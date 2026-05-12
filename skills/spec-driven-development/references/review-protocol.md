# Review Protocol（reviewer agent 共用）

`design-reviewer` 跟 `implementation-reviewer` 共用同一套 review loop 機制。本文件是兩個 reviewer 與主 agent 都應該理解的「合約」。每個 reviewer agent 啟動時應該讀過這個文件，再回去看自己 agent prompt 裡的特有審查面向。

## 核心模型

Reviewer 的價值來自**多輪對抗式審查**：每輪都假設前一輪有遺漏，直到收斂為止。這跟「一次過 review」的差別在於：複雜系統的 design / implementation flaw 通常**不是同個檢視角度能一次抓完的** — 修了 race condition 露出 idempotency 漏洞，修了 idempotency 才看見 invariant 沒守住。多輪 review 模擬這個「修一層、揭一層」的真實過程。

收斂條件嚴格：**當輪 0 issues 才結束**。妥協（「夠好就停」）會讓系統累積技術債，且每次妥協會降低未來 review 的標準（thin-edge-of-the-wedge）。

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

issue 編號用**英文字母**，跨 round 累加，不重設：

```
Round 1: Bug A, Bug B, Smell C, Decision D
Round 2: Bug E, Smell F, Decision G  ← 不從 A 重新開始
Round 3: Bug H, Smell I
```

**為什麼不重設**：跨 round 引用不會撞名（「Round 4 的 Bug U 已修」不會跟 Round 1 的另一個 Bug U 混淆）。這次 conversation-management-refactor 在 Round 4 報告裡引用了「Round 4 Bug U」就是這個規則的真實使用紀錄。

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

## 輸出格式

每輪 review 結尾必須輸出符合下列結構的 issue list（讓主 agent 能機械解析）：

```
## Round {N} {agent-name} Review — {feature}

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

### 結論
[ ] 0 issues — 收斂，可進入下一階段
[x] {N} issues found — 主 agent 須處理（修正 + 對 Decision 回問 user）後重新進入下一輪
```

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
4. **避免 scope creep**：派工修正時嚴格限定在 issue 範圍，不順便重構（重構若需要，當成新的 issue 進下一輪）
5. **判斷收斂**：看到 reviewer 報告「0 issues — 收斂」才能退出 loop；看到 N issues 不能提前退出

## Loop 收斂判斷規則

```
Reviewer 輸出 "0 issues" → 退出 loop，進下一階段
Reviewer 輸出 "N issues" 且全是 Medium/Low → 用 AskUserQuestion 問使用者要不要修
                                              使用者說不修 → 視為收斂，退出
                                              使用者說修 → 修完進下一輪
Reviewer 輸出 "N issues" 含任何 Critical/High → 必修，修完進下一輪
```

**永遠不要**在含 Critical/High 的情況提前退出，即使覺得已經跑了很多輪。
