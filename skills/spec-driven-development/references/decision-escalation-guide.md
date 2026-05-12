# Architecture Decision 呈現紀律

主 agent 收到 reviewer 升級的 Architecture Decision 後，用 `AskUserQuestion` 把選擇遞給 user 時必須做的「翻譯工作」。

> 本文件只在主 agent 需要遞 Decision 給 user 時才需要讀。reviewer agent **不必**讀本文件 — 它們仍按 `review-protocol.md` 輸出機械可解析的 issue list；本文件規範的是主 agent 如何把那份 list **翻譯**成人類能消化的對話。

---

## 核心原則：為人類的認知極限校準

Reviewer 產的 issue list 是 raw material，**主 agent 不能直接照搬**。原因：

- 人類無法像 LLM 即時撐起一個龐大的心智圖。Round 9 的 review 對 reviewer 是 cheap context；對 user 是新鮮 cold start
- 每次互動的 context 量要**剛剛好** — 不夠則 user 無法判斷，過量則無法消化
- 多個 Decision 一起問 = 每個都被壓縮成兩行 label = user 都看不懂

**目標**：user 在「不翻外部文件、不問你回頭問」的情況下能直接做選擇。

---

## ✅/❌ 對照表

| ✅ 做 | ❌ 不做 |
|---|---|
| Question stem 寫 review 過程脈絡（前幾輪處理什麼、為什麼此刻浮現）| 把 Decision 當孤立選項丟出，不交代由來 |
| Function / SQL / config 直接貼 code 片段 | Prose 描述 code（「在 line 142 回傳 bool」）|
| 放對照組 — 同 codebase 類似 API 的 code | 只說「跟其他 API 不一致」但不示範哪些 API、怎麼一致 |
| Option `description` 至少覆蓋通用核心 3 維度（架構 / 一致性 / 功能風險），其他維度視 Decision 性質加 | 只寫「會 break X」這種單維度後果；或硬湊 N/A 填空 |
| 用 `preview` 欄位放 before/after diff 或完整 function | Code 細節用文字描述但不顯示 |
| 完全獨立 Decision 拆多次 `AskUserQuestion` call | 多個無關 Decision 塞同一個 question |
| 平行相關 Decision（共享脈絡、答案獨立）用同 call 多 questions 欄位 | 條件耦合（B 依賴 A）也硬塞多 questions — 工具不支援這種依賴 |
| 條件耦合 Decision 用複合選項或序列發問 | 假設多 questions 能表達 "if A then B" 結構 |
| 標 reviewer 的 issue 編號（例「Decision BT」）讓 user 對得到 raw issue list | 重新編號 / 不引用原 issue ID |

---

## 三條判斷規則

### 1. Context-First

Question stem 必須在第一段就建立背景，至少涵蓋三件事：

**(a) Review 過程脈絡** — 這個 Decision 是怎麼浮現的？
- 前面幾輪 review 處理了什麼相關問題（例如「Round 1-8 已對齊整個 read path，這是唯一漏網之魚」）
- 為什麼到這輪才被列為 Decision（之前是否被認為是 bug，後來判斷成設計選擇）
- design.md / requirements.md 對這個點有沒有明確規範 — 沒有的話為什麼這次必須拍板

**沒這層脈絡，user 看到的是孤立的選項；有了，user 看得到「為什麼此刻問這個」**。

**(b) Code 直接放，不用 prose 描述**

```
❌ 「has_related(conversation_id) 在 conversation_service.py:142 回傳 bool」
✅ 直接貼 function body code block
```

Prose 描述 function 是退化的二手資訊。user 看 code 一眼就懂簽章、SQL、行為，看 prose 反而要在腦中重組。**function 簽章、SQL 片段、config schema 永遠用 code 顯示**；prose 只用來補 code 看不出的脈絡（為什麼這樣寫、與誰對照）。

**(c) 對照組** — 同個 codebase 內類似 API 的 baseline

放一段相關 function / 相鄰 module 的 code，讓 user 看得到「目前 codebase 的慣例是什麼」。這是 architectural / consistency 判斷的基礎。

### 2. Decision 之間的關係模式

`AskUserQuestion` 一次可包 1-4 個 questions — 但這個工具特性**不支援條件式依賴**（B 的選項取決於 A 的選擇）。所有 questions 是「同時呈現、同時作答」。所以三種模式各有對應呈現方式：

**(a) 獨立 Decision**（兩個 Decision 之間無關，例如「GC 順序」+「另一支 API 命名」）
→ **拆多次 `AskUserQuestion` call**，每次一個 Decision，每個都拿到滿格 context

**(b) 平行相關 Decision**（共享 review 脈絡，但 user 可獨立作答；例如同一個 review round 浮出的「Logging format」+「Retry backoff」— 兩者都是這個 module 的 convention 選擇，但答案互不依賴）
→ **同一個 `AskUserQuestion` 用多 questions 欄位**（1-4 questions），共用一個 review-context preamble，user 一次決完

**(c) 條件耦合 Decision**（B 的選項取決於 A 的選擇；例如「要不要加 cache invalidation」+ (若 yes)「TTL vs invalidate-on-write」）
→ 多 questions 欄位**不適用**。兩種替代：
  - **複合選項**：合併成一個 question，options 直接列組合「不加 / 加+TTL / 加+invalidate-on-write」
  - **序列**：先問 A，user 答完再發第二個 `AskUserQuestion` 問 B

判斷流程：

```
兩個 Decision 之間 user 的選擇互相影響嗎？
├─ 完全無關 → (a) 拆多次 call
├─ 共享脈絡、答案獨立 → (b) 同 call 多 questions
└─ B 的選項取決於 A 的答案 → (c) 複合選項 or 序列
```

**為什麼**：拆開讓 user 一次只專注一個決策；合併（(b)）省 user 切換成本但需確認真的獨立；條件耦合硬塞 (b) 會出現「user 選了 A 卻發現 B 的選項在這個 A 下不適用」的尷尬。

### 3. Trade-off 多維度

每個 option 的 `description` 不能只寫單向後果。Architecture Decision 之所以難拍板，是因為**多維度權衡** — 選 A 在某維度好、在某維度差。逐維度列出來，user 才能依自己的優先順序選。

**通用核心（建議都覆蓋）**：

| 維度 | 看什麼 |
|---|---|
| **架構** | 是否強化 / 弱化 design.md 的 invariant；是否引入新的設計分支；是否與 architectural pattern（layered / hex / CQRS...）一致 |
| **一致性** | 同 codebase 類似 API / module 怎麼做；這個選擇是「對齊主流」還是「成為例外」 |
| **功能 / 風險** | API break、performance、leak surface、rollback 等可量化後果 |

**常見補充維度（涉及程式碼可讀性時加）**：

| 維度 | 看什麼 |
|---|---|
| **撰寫慣例 / 認知負擔** | 簽章、命名、錯誤處理、test 寫法、依賴注入風格是否符合 codebase convention；新進工程師閱讀時的認知成本 |

**其他 Decision-specific 維度**：

不預先列舉完整池，主 agent 視當前 Decision 性質判斷加入。常見的有：

- **可逆性** — 選了之後 back out 多難（schema 改 / 資料遷移 / external API）
- **Testability** — DI 風格、mock 策略、fixture 設計改變
- **可觀測性** — production debug story / on-call 接手難易
- **可擴展性** — 未來新增 case 多容易
- **開發成本** — A 路 1 天 vs B 路 3 天
- **領域特定**：performance、security surface、對外契約、migration path

**不要為了湊維度而寫「N/A」**。不適用就不列那個維度，省下空間給真正在 trade-off 的維度。

**為什麼這樣設計**：reviewer 通常只把「功能 / 風險」維度寫得詳細，但 user 拍板時關心的常常是「這條路是否會讓 codebase 走向長期一致」。固定 3 個核心保證底線；其他維度由主 agent 判斷加入，避免變成填空表格。

### 4. 資訊量上限

單一互動的 context 加總，預估 user 1-2 分鐘能讀完。超過就拆 / 抽 reference。

| 元件 | 建議長度 |
|---|---|
| Question stem（含 code 片段） | 10-25 行 |
| 每個 option description | 6-15 行（核心 3 + 視情況補充） |
| Preview 欄位 code 片段 | ≤ 30 行 |

**超標自查**：是否有太多背景重述（可以指向已存在的 design.md / plan file 而非全文重貼）？是否塞了第二個邊緣 Decision 進來？某個維度的描述能不能再凝練？

---

## AskUserQuestion 欄位使用

| 欄位 | 用途 | 何時用 |
|---|---|---|
| `question` | Decision 命題 + 背景敘述 | **必填** |
| `header` | 簡短 tag（< 12 字）| **必填** |
| `options.label` | 一句話方向（1-5 字）| **必填** |
| `options.description` | Trade-off 與後果 | **每個 option 必寫**（不可空）|
| `options.preview` | Code 片段 / diff / 檔案內容 | 涉及具體 code / config 時用 |
| `multiSelect` | 允許多選 | 通常 false；只有「彼此不互斥」的功能 toggle 才 true |

**`preview` 欄位特別實用的場景**：function 簽章變更、SQL 片段、JSON schema diff、檔案結構對照 — 純文字描述會失真，code block 直接看得懂。

---

## 範例對照

### 壞範例（重現實際場景）

```
question: "Decision BT: has_related() ACL hint 是否該套 ownership filter？"
header: "has_related ACL"
options:
  - label: "留為 follow-up"
    description: ""
  - label: "本次一起修：has_related 套 _OWNERSHIP_SQL"
    description: "加 conversation_id/type 參數"
```

**為什麼這個是壞範例**：

1. **沒 review 過程脈絡** — Decision 像憑空蹦出，user 不知道前幾輪在做什麼、為什麼這個現在才浮現
2. **沒 code 對照** — `has_related()` 哪個 function、`_OWNERSHIP_SQL` 什麼結構，全靠 user 腦補
3. **沒對照組** — 沒給「同 codebase 類似 API 怎麼做」的 baseline，user 無從判斷一致性問題
4. **trade-off 只一個維度** — Option 2 只勾到「功能影響」（加參數、複雜度），通用核心的架構 / 一致性 完全缺席，user 看不出長期影響
5. **Option 1 `description` 空白** — user 看不出「留為 follow-up」的代價是什麼
6. **沒用 `preview` 欄位** — function 簽章直接貼 code 比文字描述清楚 100 倍
7. **二選一框架太窄** — Architecture Decision 通常有 3-4 條路（例如 ContextVar 注入），只給 2 個選項等於 reviewer 已先剪了枝

### 好範例（這份待 Jason 看完調整）

```yaml
question: |
  Decision BT — has_related() 是否該套 ownership filter？

  Review 過程脈絡：
  - Round 1-8 對齊了 conversation_service 整個 read path 的 ownership filter
    （fetch_by_id / list_by_user / search_memory 都已套上 _OWNERSHIP_SQL）
  - has_related() 是 read path 唯一漏網之魚
  - 前幾輪曾標為 Critical Bug，Round 5 user 提出「hint 不傳 memory 內容
    或可主張不算 leak」後降級成 Decision
  - design.md:88 規範了 read API 須過 ACL，但**未明確涵蓋 hint-style API**
    — 拍板結果會回填進 design.md 補完此 invariant

  目前實作（conversation_service.py:142）：
  ```python
  def has_related(conversation_id: str) -> bool:
      rows = db.query(
          "SELECT 1 FROM memory WHERE conv_id = ?",
          conversation_id,
      )
      return bool(rows)
  ```

  同 module 對照組 — fetch_by_id 是目前 read API 的標準形：
  ```python
  def fetch_by_id(user_id: str, conversation_type: str, memory_id: str):
      sql = f"SELECT * FROM memory WHERE id = ? AND {_OWNERSHIP_SQL}"
      return db.query(sql, memory_id, user_id, conversation_type)
  ```

header: "has_related ACL"
options:
  - label: "留為 follow-up"
    description: |
      開 follow-up issue，本次 PR 不動 has_related()。

      架構：保留「hint API 不走 ACL」這個未明說的設計分支；design.md
      須補一條 "hint-style API 可不過 ACL" 的明確 invariant，否則未來新
      hint API 沒參考依據。
      
      一致性：read path 4 個 API 中 1 個例外；本次 refactor 結束後留下
      一個未對齊的尾巴，後續每次相關 review 都會被重新提起。
      
      功能 / 風險：cross-user state 殘留範圍小（bool 不傳 memory 內容）；
      若未來引入 row-level security policy，這支 function 必跟著改。
      
      可逆性：很高 — 隨時可以回頭加 filter；但「之後再改」實際上常變
      永遠不改，需要納入考量。

  - label: "本次一起修（套 _OWNERSHIP_SQL）"
    description: |
      has_related() 加 user_id, conversation_type 兩個必傳參數，套 _OWNERSHIP_SQL。

      架構：read path 完整對齊「ownership filter 全套」；design.md 可確立
      「所有 read 含 hint 都須過 ACL」這條清晰、無例外的 invariant。
      
      一致性：4 個 read API 簽章與 SQL 結構統一，新進工程師 0 認知成本。
      
      撰寫慣例 / 認知負擔：簽章變胖（3 個必傳參數），偏離 predicate
      function 通常的簡潔形式；但與 conversation_service.fetch_* / list_*
      / search_* 系列對齊。trade「predicate 簡潔」vs「module 內部一致」。
      
      功能 / 風險：API break — 3 個 caller 須同步改 + 對應 test 改寫；
      但 leak fix 與這次 refactor 主軸一致，一次 review 比拆兩次省事。
    preview: |
      def has_related(user_id: str, conversation_id: str, conversation_type: str) -> bool:
          sql = f"SELECT 1 FROM memory WHERE conv_id = ? AND {_OWNERSHIP_SQL}"
          rows = db.query(sql, conversation_id, user_id, conversation_type)
          return bool(rows)

  - label: "改走 ContextVar 注入"
    description: |
      簽章不變，從 request-local ContextVar 讀 user_id / conversation_type。
      仍可套 _OWNERSHIP_SQL，但 caller 不必傳 ACL 參數。

      架構：引入新的「implicit context」分支；conversation_service 目前所有
      API 都明寫 user_id（explicit dependency injection）。會分裂兩種風格。
      
      一致性：偏離 codebase 主流（全 explicit pass），但對齊 web framework
      慣例（flask.g / FastAPI Depends）。看 codebase 整體偏好。
      
      功能 / 風險：caller 無 API break；但若 ContextVar 在某條 code path
      沒被 set（例如 background task），會 silent fail 或 raise — 必須加防呆。
      
      Testability：unit test 必須 mock context，原本 explicit pass 直接傳值。
      連鎖影響：conversation_service 整個 test suite 寫法需要調整 — 本選項
      真正的爭議點在這。
```

**這個好範例做對的事**：

- **Review 過程脈絡**：4 行交代「前幾輪做什麼、為什麼到這輪才浮現、design.md 規範缺口」
- **Code 直接放**：function body 與對照組 `fetch_by_id` 都用 code block 而非 prose
- **對照組**：放了同 module 的 `fetch_by_id` 當 baseline，user 看得到「目前慣例」
- **三個 option 都覆蓋通用核心 3（架構 / 一致性 / 功能風險）**，但補充維度各自不同：
  - Option 1（follow-up）加「可逆性」— 因為這個選項本質是延後決策，可逆性是核心議題
  - Option 2（一起修）加「撰寫慣例 / 認知負擔」— 因為簽章變胖是核心爭議
  - Option 3（ContextVar）加「Testability」— 因為這條路真正的代價在 test 寫法的連鎖影響
- **每個 option 都點出該選項的「真正爭議點」**，不是平均分配筆墨
- **第三個選項揭示「兩條路之外還有路」**— Architecture Decision 通常不是二選一
- 引用 reviewer 編號 `Decision BT` 讓 user 對得到原 issue list
- 不假設 user 記得 `_OWNERSHIP_SQL` / `has_related` 是什麼 — 直接 code 看到

---

## 補救流程

如果發出 `AskUserQuestion` 之後 user 回問「這是什麼？」「我看不懂選項」：

- **不要在原 question 補解釋** — 原 question 的選項已根植於不足的 context
- **重新發一個 `AskUserQuestion`**，把 user 的問題納入新 question 的背景敘述

這個流程也是訊號：下次處理類似 Decision 時，背景敘述要更早展開。

---

## Decision 拍板後寫入 Review Log

User 透過 `AskUserQuestion` 回答 Decision 後，主 agent 必須立即把結論寫進 `review-log.md` §2 Architecture Decisions 區塊。寫入規範詳見 `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/review-log-guide.md`，重點：

- Decision 標題用 reviewer 原 letter ID（例 `### Decision D（raised at D2）`），不重新編號
- 必填欄位：`Problem` / `Options considered` / `Chosen` / `Rationale (user, YYYY-MM-DD)` / `Affects`
- `Rationale` 欄寫 user 在 AskUserQuestion 補充的 free-text 理由（如有）+ 主 agent 整理 — **不要只寫「user 選了 Option 2」**，要寫「為什麼」
- 同步更新 §1 Audit Trail 表格：該 Decision 列 Status 改 `decision-resolved`、Resolution 改 `→ §2 Decision <letter>`

**為什麼立即寫入而非 batch**：user 答完 AskUserQuestion 後 rationale 還是原話，等到全部 Decision 都拍板再 batch 補寫，細節已失真且容易遺漏。

### Decision 結果如何反映到 design.md / tasks.md（中性化原則）

**1.5.0 紀律**：Decision content（Options 比較、Chosen、Rationale、Round 來源）**只能存在於 `review-log.md §2`**。design.md / tasks.md **不得**：

- 寫 `## Architecture Decisions` / `## Decisions Record` / `## ADR` 段落
- 寫 `(per Decision X)` reviewer letter tag
- 寫 `→ review-log §2 Decision X` footnote pointer（1.4.0 曾允許，1.5.0 完全廢止）
- 寫「user 在 Round N 拍板選 Option 2」等 review 過程敘述

**Decision 結果若需要反映到 design.md（例如 user 選了 Option 1 而非 Option 2，這影響某 Component 的設計）**，做法：

- 把 Option 1 的**內容**（不是 Option 1 這個 label）直接寫進對應 Component 段落
- 設計理由用**中性 prose** — 寫「為什麼這樣設計」的技術理由，**不**寫「為什麼選 Option 1 拒絕 Option 2」
- 不揭露 Decision 編號 / Round 來源 / user 拍板過程

**範例**：

User 對 Decision D 拍板「TTL invalidation, 60s」。

- ❌ design.md 寫：`CacheService 採 60s TTL（per Decision D, user 在 Round 3 拍板選 Option 1）`
- ✅ design.md 寫：`CacheService 採 60s TTL，理由是 read-heavy workload (read:write ≈ 100:1) 可容忍 1 分鐘 staleness；explicit invalidation 需要事件廣播機制，當前 workload 不值得這個複雜度`
- ✅ review-log.md §2 寫：`### Decision D（raised at D2）\n**Problem**: Cache invalidation 策略 — TTL vs explicit\n**Options considered**: ...\n**Chosen**: Option 1\n**Rationale (user, 2026-05-12)**: ...`

兩者**內容互補但不引用**：design.md 是技術描述、review-log.md 是決策審計，物理隔離。

**為什麼 100% 隔離**：design.md / tasks.md 是反覆閱讀的 truth source；夾雜 Decision audit trail 會稀釋技術描述的密度。1.4.0 允許 footnote pointer 後實測發現 agent 會 drift 成 ADR 段落 + reviewer letter tag — 唯一可靠的紀律是完全禁止任何 review-log reference。完整 bad/good 對照：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/review-log-bad-examples.md`

---

## 為什麼不寫 MUST / NEVER

skill-creator 哲學：解釋「為什麼這件事重要」比硬性規定更有效。本指引的「✅/❌」是經驗派的「在這個 plugin context 下做這樣比較好」，不是禁令。例如：

- 「不相關 Decision 拆多次 call」**通常**對；但若三個 Decision 都是 nit-pick 級 Low、user 已表明「批次給我」，合併也合理
- 「每個 option description 必寫」**通常**對；但若兩個 option 真的只差一個字（例如「採用」vs「不採用」），label 就足夠時 description 可以省

判斷依據永遠是「**user 能不能在不問你的情況下做選擇**」。
