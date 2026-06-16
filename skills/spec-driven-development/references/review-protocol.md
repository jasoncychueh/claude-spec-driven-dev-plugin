# Review Protocol（reviewer agent 共用）

`design-reviewer` 跟 `implementation-reviewer` 共用同一套 review loop 機制。本文件是兩個 reviewer 與主 agent 都應該理解的「合約」。每個 reviewer agent 啟動時應該讀過這個文件，再回去看自己 agent prompt 裡的特有審查面向。

## 核心模型

Reviewer 的價值來自**多輪對抗式審查**：每輪都假設前一輪有遺漏，直到收斂為止。這跟「一次過 review」的差別在於：複雜系統的 design / implementation flaw 通常**不是同個檢視角度能一次抓完的** — 修了 race condition 露出 idempotency 漏洞，修了 idempotency 才看見 invariant 沒守住。多輪 review 模擬這個「修一層、揭一層」的真實過程。

收斂條件嚴格：**當輪 0 issues 才結束**。妥協（「夠好就停」）會讓系統累積技術債，且每次妥協會降低未來 review 的標準（thin-edge-of-the-wedge）。

這條紀律有對稱的另一面：**乾淨的一輪輸出 `0 issues` 是好結果，不是失職**。為了顯得盡責而發明 issue（把 nit 升級成 High、對已正確的設計硬挑毛病），跟假收斂傷害的是同一個東西 — review 的可信度。兩個方向的誠實同等重要。

**收斂保險絲**：若 review 進行到第 5 輪仍有**新的 Critical/High** 浮現，繼續 loop 通常已無意義 — 這代表 design / 實作本身有結構性問題（每修一處冒一處），或 review 在 churn。此時主 agent 應停止 loop，整理跨輪 issue 的 pattern 向 user 報告，由 user 決定：回頭重做 design、縮小 scope、或知情後繼續。保險絲是「停下來升級給 user」，**不是**「視為收斂」。

## 嚴重度分級

每個 issue 必須標一個級別。分級不是裝飾，是**主 agent 派工順序的依據**。

| 級別 | 定義 | 範例（design 階段）| 範例（implementation 階段）|
|------|------|-------------------|---------------------------|
| **Critical** | 不修會出 production 事故 | 沒 idempotency 但會被 retry / 缺 unique constraint | weak-ref GC / async race / silent failure |
| **High** | 不修 6 個月內變技術債或誤用陷阱 | 元件邊界不清 / 沒定義 timeout | callback 沒 unregister / shared utility 未抽出 |
| **Medium** | 不修增加維護成本 | 命名不一致 / 抽象層次不齊 | stale docstring / 過度防禦 |
| **Low** | nit-pick 級，可延後 | 文件描述不清 | 變數命名小議 |

**收斂規則**：所有 Critical / High 必須清零；Medium / Low 由 user 決定保留與否（主 agent 用 AskUserQuestion 詢問）。

**為什麼分級誠實很重要**：升級 Low 為 High 會讓主 agent 浪費資源修不重要的事；降級 Critical 為 Medium 會讓事故在 production 爆。Reviewer 的可信度建立在「抓到的真的是要修的」這個信譽上。

## 編號規則

### Letter ID（跨 round 累加，不重設）

issue 編號用**英文字母**，跨 round 累加，不重設：

```
Round 1: Bug A, Bug B, Smell C, Decision D
Round 2: Bug E, Smell F, Decision G  ← 不從 A 重新開始
Round 3: Bug H, Smell I
```

**為什麼不重設**：跨 round 引用不會撞名（「Round 4 的 Bug U 已修」不會跟 Round 1 的另一個 Bug U 混淆）。

### Round 命名 — 區分 reviewer 種類

| Reviewer | Round prefix | Letter 序列範圍 |
|---|---|---|
| `design-reviewer` | `D{N}` — `D1`, `D2`, ... | 自成一序，跨 D round 累加 |
| `implementation-reviewer` | `I{N}` — `I1`, `I2`, ... | 自成一序，跨 I round 累加（**與 D 序列獨立**）|

**為什麼 D 與 I 各自獨立累加**：兩個 reviewer 各自獨立 invocation，要求協調 letter 序列會增加耦合（implementation-reviewer 啟動時無法得知 design-reviewer 用過 A-G，要由主 agent 傳遞 context）。獨立累加讓 reviewer 可純粹按 review-protocol.md 執行。代價是 letter 不再全 spec 唯一 — 引用時必須帶 Round prefix（如 `D2 Smell C` / `I1 Bug A`），這在 audit trail 表格內本來就是必要的。

**全文引用格式**：
- ✅ `D2 Smell C` / `I1 Bug A` — Round prefix + letter ID
- ❌ `Bug A` — 缺 Round prefix，跨 reviewer 種類會撞名

## Architecture Decision 紀律

這是 reviewer 的**核心防線**。Reviewer 拍板了 architecture decision 等於越權，且這類選擇往往不可逆 — 一旦選了路，回頭成本極高。

### 判斷準則

當你發現一個選擇有「兩個或多個合理方案，且軟體工程歷史上沒有業界共識的最佳解」時，**不要在 issue list 判定「應該改成 X」**。

判斷三問：

1. 在這個 trade-off 上，**Google / Meta / Amazon / Netflix 是否各自選了不同方案**？
2. 這個選擇是否取決於**團隊偏好或 organizational context**（reviewer agent 看不到這部分）？
3. 我能不能斷言「這條路一定錯」？

三個都 yes → 是 Architecture Decision，主 agent 須用 AskUserQuestion 把選擇遞給使用者拍板。

### 範例對照

| 是 Architecture Decision | 不是（直接挑為 Bug/Smell）|
|--------------------------|---------------------------|
| CQRS vs CRUD | NULL 沒處理 |
| Event sourcing vs state-based | Race condition |
| Push vs poll | 重複技術債 |
| Orchestration vs choreography | Stale docstring |
| Optimistic vs pessimistic locking | 缺 NOT NULL constraint |
| 重試策略：exponential vs linear backoff | weak-ref task GC |
| 錯誤處理：raise vs return Result | callback 沒 unregister |
| Cache invalidation：TTL vs explicit | 沒 idempotency key |

### Issue list 中的標記方式

每個 Architecture Decision 至少要列出：

- **Option 1**: 方案 A — Trade-off
- **Option 2**: 方案 B — Trade-off
- **為什麼沒共識**: industry 為何分裂
- **建議 user 考量**: 決定的關鍵維度（哪個 organizational context 會影響選擇）

主 agent 收到後，用 AskUserQuestion 把這幾個選項遞給使用者，等決定後再進下一輪。

## Steering Candidates（steering 昇華候選）

Review 時讀過 steering 文件後，若發現「本設計 / 實作所依賴或確立的某個專案級原則、慣例、設計哲學，steering 並未記錄」，把它列為 **Steering Candidate**（編號 `SC-1`, `SC-2`, ... 跨 round 累加），放在 issue list 後的專屬區段。

- SC **不是 issue、不計入收斂** — 「文件該補一條慣例」不該 block 品質防線
- Reviewer 不自行判定「該寫進 steering」 — 跟 Architecture Decision 同一條不越權紀律：寫不寫由 user 拍板，主 agent 負責批次遞送（依 SKILL.md「Steering 演進機制」）
- 與「違反 steering」區分清楚：
  - 設計**違反** steering 既有條文 → 開正常 issue（明文規範的違反通常 High）
  - 設計與 steering 衝突，但你無法斷定誰對（steering 可能過時）→ 開 Architecture Decision，讓 user 決定「修設計」還是「更新 steering」
  - steering **沒寫**，而本設計確立了新原則 → Steering Candidate
- 已存在於你讀到的 steering 內容中的原則不必列；跨 round 重複列出尚未處理的 candidate 沒關係，主 agent 負責去重

## 輸出格式

每輪 review 結尾必須輸出符合下列結構的 issue list（讓主 agent 能機械解析）：

```
## Round {D|I}{N} {agent-name} Review — {feature}

### 審查範圍   ← implementation-reviewer 才需要這節，design-reviewer 可省略
- 檔案數：{n}
- 上一輪修正：{Round N-1 修了哪些 issue 編號}

### Critical (must fix before next round)
- **Bug A**: {一句話問題描述}
  - 位置：{file_path:line_number}    ← 如適用
  - 影響：{會發生什麼後果}
  - 建議方向：{怎麼修，但不寫 code}
- **Bug B**: ...

### High (should fix this round)
- **Smell C**: ...

### Medium / Low
- ...

### ⚠️ Architecture Decisions (need user input — main agent must escalate)
- **Decision D**: {問題描述}
  - **Option 1**: {方案 A} — Trade-off: {優缺點}
  - **Option 2**: {方案 B} — Trade-off: {優缺點}
  - **為什麼沒共識**: {industry 為何分裂}
  - **建議 user 考量**: {決定的關鍵維度}

### 📌 Steering Candidates (non-blocking — 不計入 issue 數，如有才列)
- **SC-1**: {本次設計/實作確立、但 steering 未記錄的專案級原則} — 建議寫入：{tech.md §X / structure.md §Y}

### 結論
[ ] 0 issues — 收斂，可進入下一階段（Steering Candidates 不計入 issue 數）
    ⚠️ 主 agent 收斂後續步提醒：依你所在流程，下一步常是 Briefing 停點 —
    Quick Fix Mode：design 收斂 → ExitPlanMode 前必須先交付 Plan Briefing；
    /create-spec、/update-spec：續寫 tasks / 跑 verifier 後必須交付 Spec Briefing。
    兩者都以「回合最終訊息」輸出、結束回合、等 user 回覆，
    不可跳過、不可把 briefing 跟工具呼叫擠在同一回合
[x] {N} issues found — 主 agent 須處理（修正 + 對 Decision 回問 user）後重新進入下一輪
```

**為什麼收斂結論要夾帶續步提醒**：主 agent 的 SKILL.md 指示是任務開頭載入的，經過多輪 review 後早已遠離注意焦點（甚至被 context compaction 摘要掉）。Reviewer 的收斂報告是「轉場時刻的最新 context」— 把下一步提醒放在這裡，主 agent 才會在正確的時刻看到它。

## Reviewer 共用紀律

無論是 design-reviewer 還是 implementation-reviewer，這幾條都適用：

1. **Review only, never fix**：產 issue list 是唯一產出。為什麼？因為「review 跟 fix 分開」讓決策可追溯（每個改動對應到某個 issue 編號），也讓主 agent 能在「修還是先問 user」之間判斷
2. **No false convergence**：收到「這是第 N 輪了該收了」的暗示也不放水。為什麼？妥協會降低未來 review 的標準
3. **嚴重度誠實**：分級不是社交工具。為什麼？分級失真讓主 agent 派工失準
4. **Production 視角**：「這會不會半夜把 oncall 叫起來」是 north star
5. **避免 review 範圍縮水**：第 N 輪不能只看上一輪修的部分，也要抽查未動檔案。為什麼？主 agent 可能（無意識）把範圍縮小到只看修過的部分，造成假收斂

## 主 agent 的責任

當主 agent 驅動 review loop 時：

1. **Dispatch issue list**：把 reviewer 的 issue list 整包丟給對應修正者
   - design 階段：主 agent 自己改 design.md（design.md 是文件，不是 code，不違反「實作必須由 agent 執行」原則）
   - implementation 階段：派工給 `spec-implementer (Mode 2)`，主 agent 不直接寫 code
2. **Decision escalation**：所有 Architecture Decisions 用 AskUserQuestion 遞給使用者（主 agent 會依 SKILL.md「Architecture Decision 呈現紀律」/ `decision-escalation-guide.md` 做人類友善的翻譯 — reviewer 本身只負責產四點原料）
3. **追蹤輪次**：每輪 review 後記錄 issue 編號，提供給下一輪 reviewer 作為「上一輪修了哪些」context
4. **更新 Review Log**：每輪 review 後維護 `review-log.md`（Spec Mode）或 plan file `## Review Log` 區段（Quick Fix Mode）— 詳見下節「Review Log 整合」
5. **避免 scope creep**：派工修正時嚴格限定在 issue 範圍，不順便重構（重構若需要，當成新的 issue 進下一輪）
6. **判斷收斂**：看到 reviewer 報告「0 issues — 收斂」且無累積待決的 Medium/Low 才能退出 loop；含 Critical/High 不能提前退出；第 5 輪仍有新 Critical/High → 觸發收斂保險絲（見「核心模型」），停止 loop 向 user 報告
7. **Steering Candidates 遞送**：累積 reviewer 列出的 SC（跨輪去重），與 Decision 拍板 / 實作過程的發現合併，依 SKILL.md「Steering 演進機制」批次遞 user 確認後輕量寫入 steering，並記入 review log §5

## Review Log 整合（與 reviewer 的 handshake）

每輪 review 結束後，主 agent 必須把 reviewer 的 issue list 整合進 review log。詳細寫入規範見 `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/review-log-guide.md`。

### Reviewer 端責任

- **產 issue list 即可** — 不直接寫 log
- Issue 編號按本文件「Letter ID」+「Round 命名 D/I prefix」規則
- 輸出格式依本文件「輸出格式」章節

### 主 agent 端責任（每輪 review 後）

1. 把 reviewer 輸出的 issue list 整批 append 到 review log §1 Audit Trail，Status 標 `pending`
2. 處理每個 issue 後立即更新該列 Status + Resolution：
   - 修正 → `fixed`，Resolution 寫「動了什麼 + 位置」（1 行）
   - Architecture Decision 拍板 → `decision-resolved`，§2 補 Decision 完整區塊，Resolution 寫 `→ §2 Decision <letter>`
   - 保留不修 → `waived`，§3 補 Waiver 完整區塊，Resolution 寫 `→ §3 W{N}`
   - 確認誤判 → `false-positive`，§4 補 FP 區塊，Resolution 寫 `→ §4 FP{N}`

### Reviewer 引用 Review Log 的時機

下一輪 reviewer 在做「上一輪修了哪些」context 整理時，可選擇讀 review log §1 表格快速掃過已處理的 issue ID。但 reviewer **不可以**只看 §1 就跳過 fresh review — review-protocol.md「避免 review 範圍縮水」規則仍適用：第 N 輪要審所有變動 + 抽查未動關鍵檔案。

### 為什麼 Reviewer 不寫 log

把 review/fix 分離的紀律已建立（reviewer 不動 code）；同樣邏輯適用於 log：**reviewer 只負責產 raw material（issue list），整合成 audit trail 是主 agent 的工作**。這讓 reviewer 純粹聚焦在「找問題」，不被「該寫進 log 的哪個欄位」分心。

## Loop 收斂判斷規則

Medium/Low 採 **defer-and-batch**：不逐輪打斷 user — Medium/Low 常在後續輪次被 Critical/High 的修正連帶解決，提早問是浪費 user 的注意力；累積到 Critical/High 清零的那一輪一次問完。

```
Reviewer 輸出含 Critical/High → 本輪只修 Critical/High；
                                Medium/Low 標 pending 累積（先不問 user）
Reviewer 輸出全 Medium/Low（或 0 issues 但有歷輪累積的 open Medium/Low）
    → 把本輪 + 歷輪累積的 open Medium/Low 一次用 AskUserQuestion 問 user
       使用者說不修 → 寫入 waiver；若本輪也沒有新 Critical/High → 視為收斂
       使用者說修 → 修完進下一輪
Reviewer 輸出 "0 issues" 且無累積 open Medium/Low → 收斂，退出 loop
第 5 輪仍有新 Critical/High → 收斂保險絲：停止 loop，向 user 報告結構性問題
```

**永遠不要**在含 Critical/High 的情況提前退出，即使覺得已經跑了很多輪（保險絲觸發是「停下來升級給 user」，不是「視為收斂」— 兩者不同）。
