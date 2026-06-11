# Review Log 撰寫指引

主 agent 在 review/resolve 過程中維護 review-log.md 的細部規範。Reviewer agent 也可讀本文件理解 log 結構（但 reviewer **不直接寫 log** — 只產 issue list）。

> 本文件回答「**怎麼寫 review log**」。「為什麼需要 review log」與「整體流程」見 SKILL.md 的 Review Log 章節。

---

## 核心理念

**正式文件描述「決定後的世界」；review log 描述「為什麼是這個世界」。兩者物理隔離。**

- requirements.md / design.md / tasks.md / production code → **完全不出現** review 過程的任何痕跡（waiver / decision content / reviewer references / process narration / review-log 引用 / footnote pointer 全禁止）
- review-log.md → 集中保留五類 artifact（audit trail / Decisions / Waivers / False Positives / Steering Updates）

當正式文件需要交代「為什麼這個 Component 這樣設計」/ 「為什麼這個 task 看起來大」時，用**中性 design rationale**（技術限制 / codebase 慣例 / 反面後果）整合進對應段落 — **不揭露** reviewer / Decision / review-log。

**為什麼 100% 隔離**：
1. 正式文件被讀的次數遠多於 review log；保留 single source of truth 可讀性是核心 KPI
2. Footnote pointer 看似輕量，實際讓 agent 養成「我可以在 design.md 提一下 review-log」的習慣，逐步退化成 inline waiver block（實測證明：開了 pointer 後門，agent 自然加回 ADR 段落 + reviewer letter tag + Round 過程敘述）
3. 設計理由用中性技術 prose 即可表達；不需要為了「強調這是討論過的」而引用 reviewer — reader 不需要這層信息，需要這層信息的人去看 review-log

詳細 bad/good 對照：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/review-log-bad-examples.md`

---

## 檔案位置

| Mode | 位置 | Commit |
|---|---|---|
| Spec Mode | `.spec/specs/{feature}/review-log.md`（與 r/d/t 並列） | 是 |
| Quick Fix Mode | plan file 結尾的 `## Review Log` section | 否（plan file 本就 ephemeral） |

---

## ID 與引用協定

### Letter ID 規則

- **Design review** 與 **Implementation review** 各自獨立累加 letter（A, B, C, ...）
- 同 review 種類內**跨輪累加不重設**（D Round 1 用 A-B，D Round 2 從 C 接續）
- 全文引用必須含 Round prefix 才能唯一識別：寫 `D2 Smell C` 或 `I1 Bug A`，**單寫 `Bug A` 視為違反引用協定**

### Round 命名

`D{N}` = design review round N
`I{N}` = implementation review round N

### Section 引用

- 跨輪 issue 引 letter ID：`D2 Smell C`
- §2 Decisions 引用 reviewer 原 Decision letter：`Decision D`
- §3 Waivers 用獨立 W 編號：`W1`, `W2`
- §4 False Positives 用獨立 FP 編號：`FP1`, `FP2`

### Status 欄取值

| 值 | 意義 |
|---|---|
| `pending` | 主 agent 剛 append 進 §1、尚未處理完 |
| `fixed` | 已修正（design.md / code / tasks.md 已改）|
| `waived` | 刻意保留 — Resolution 欄須指向 §3 對應 Waiver |
| `decision-resolved` | Architecture Decision 已拍板 — Resolution 欄須指向 §2 |
| `false-positive` | 經確認為誤判 — Resolution 欄須指向 §4 |

---

## 五大區塊寫入規範

### §1 Audit Trail

每輪 reviewer 結束後，主 agent 把該輪所有 issue 一次 append 進表格，Status 先標 `pending`。處理完更新 Status + Resolution。

**Resolution 欄的 1 行原則**：
- `fixed`：寫「動了什麼 + 位置」（例：`design.md §Component-X 改用 mutex` 或 `src/cache.py:42 加 RLock`）
- `waived` / `decision-resolved` / `false-positive`：寫 cross-reference（例：`→ §3 W1`）

**為什麼要 1 行**：表格的價值在於 scan 一眼看全貌。完整理由放對應子節。

### §2 Architecture Decisions

每個 Decision 用三級標題加 letter ID：

```markdown
### Decision D（raised at D2）
**Problem**: <一句話陳述爭議>
**Options considered**:
- **Option 1**: <方案> — <一句 trade-off>
- **Option 2**: <方案> — <一句 trade-off>
**Chosen**: Option N
**Rationale (user, YYYY-MM-DD)**: <user 在 AskUserQuestion 補充的理由 + 主 agent 整理>
**Affects**: <影響的正式文件位置，例 design.md §Cache, tasks.md T2.3>
```

**為什麼有 `Affects` 欄**：未來改動相關 component 時，可反查「這個改動會不會推翻過去 user 的決定」。

### §3 Waivers

當 issue 處理結果是「保留不修」（無論是 user 主動拍板還是 trade-off 評估後接受）時寫入。

```markdown
### W1: <一句話標題>（from <Round> <Issue ID>）
**Raised by**: <agent name>, Round <X>, severity <Y>
**Principle violated**: <被違反的原則，例 SRP / DRY / Idempotency>
**Where**: <正式文件位置，例 tasks.md task 1.4 或 src/handler.py:42>
**Why kept**: <為什麼接受這個違反 — 技術理由>
**Trade-off accepted**: <承認失去什麼，換得什麼>
**Related Decisions**: <若與某 Decision 連動，列 letter ID>
**Accepted by**: User decision, YYYY-MM-DD
```

**為什麼需要 `Trade-off accepted` 欄**：避免「豁免越積越多但沒人記得各自付了什麼代價」。維護者需要知道「保留這個違反等於放棄了什麼」。

### §4 False Positives

```markdown
### FP1: <一句話標題>（from <Round> <Issue ID>）
**Reviewer claim**: <reviewer 提出的問題>
**Actual situation**: <實際狀況、為什麼不是問題 — 含 design rationale / 上游保證 / 其他釐清>
**Resolution**: <如何避免未來重複提出，例：加 docstring 提示 / 更新 design.md 說明 / 加 inline comment 解釋約束>
```

**為什麼需要這節**：reviewer 是獨立 invocation，沒有跨 round 記憶。沒有 FP 紀錄會讓同個誤判反覆出現，浪費 review round。

### §5 Steering Updates（昇華紀錄）

當開發過程發現的專案級原則經 user 確認寫入 steering 後（依 SKILL.md「Steering 演進機制」），在此記錄一列：

```markdown
| #   | 日期       | 原則（一句話）                          | 寫入位置                | 來源        |
|-----|------------|----------------------------------------|------------------------|------------|
| SU1 | 2026-05-12 | service 層錯誤一律 raise，不用 Result type | tech.md §Error Handling | D2 SC-1    |
```

**來源欄取值**：reviewer 的 SC 編號（`D2 SC-1`）、Architecture Decision 編號（`Decision D`）、或 `implementer report`（實作過程發現）。

**為什麼需要這節**：steering 改了但沒人記得「為什麼加這條」時，這張表是反查入口 — 從原則回溯到觸發它的 review / Decision 脈絡。steering 本身只寫原則（決定後的世界），不寫來源。

---

## 引用協定 — 完全隔離

**Formal doc ↔ review-log 之間沒有引用關係**。

舊版曾允許 `> ⓘ <一句話> — 詳見 review-log.md §<id>` footnote pointer 作為「異常 + tracked」signal，**現已完全廢止** — 實測 agent 看到 pointer 被允許，會逐步退化成 ADR 段落 + reviewer letter tag + Round 過程敘述（formal doc 100% 隔離才能根除這個 drift）。

### Formal doc 解釋「為什麼這樣設計」的正確方式

用 **中性 design rationale** 整合進 Component / docstring / task description：

| 維度 | 寫法 |
|---|---|
| **技術限制** | 「Synchronous for atomicity guarantees」 |
| **Codebase 慣例** | 「Returns None per upstream convention in UserService」 |
| **反面後果** | 「Splitting would leave intermediate states violating schema invariants」 |
| **系統 invariant 依賴** | 「No locking: caller serializes via key-sharded queue (see EventDispatcher)」 |

**禁止**：

- 「per Decision X」 / 「per Smell Y」 / 「per Bug Z」
- 「reviewer 建議 / 標記 / 提出」
- 「user 在 Round N 拍板」
- 「See review-log.md §X」/ `> ⓘ` / `→ §W1`
- 整段 `## Architecture Decisions Record` / `## ADR` / `## Decisions`

完整 bad/good 對照（5 種 pattern + 通用改寫公式）：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/review-log-bad-examples.md`

### Review log 內部結構

Review log 內部使用 letter ID + W / FP 編號 cross-reference（如 §1 Audit Trail 表格 Resolution 欄寫 `→ §3 W1`）。這些**只在 review-log.md 內**，不外溢到 formal doc。

---

## ✅/❌ 對照表

| ✅ 做 | ❌ 不做 |
|---|---|
| §1 表格每列 Resolution 欄 1 行；完整理由放對應子節 | Resolution 欄寫 3 行解釋 |
| Waiver 寫進 §3；formal doc 用中性 design rationale 解釋 | 在 tasks.md 寫 `> **SRP 例外（已知並接受）**：...` 多行區塊 |
| Decision 用 reviewer 原 letter ID（Decision D）| 重新編號（Decision 1, Decision 2）|
| §3 Waiver 必填 `Trade-off accepted` 欄 | 只寫「為什麼保留」不寫「失去了什麼」|
| Architecture Decision 拍板後立刻寫進 §2 | 拖到全部 review 收斂後才補寫（細節已模糊）|
| FP1 寫 Resolution 欄說明如何避免重複提出 | 只記「reviewer 誤判」不記如何防止再犯 |
| 跨 review 種類用獨立 letter 序（D 與 I 各自累加）| 把 design / impl issue 混在同 letter 序 |
| Formal doc 100% 不出現 review-log reference / pointer / letter tag | 用 `> ⓘ ... — 詳見 review-log §W1` footnote pointer（已廢止）|
| Steering 昇華後在 §5 記一列（原則 / 位置 / 來源）| steering 改了但 review log 無紀錄，未來無從反查為什麼加這條 |
| Formal doc 解釋設計理由用中性 prose（技術 / codebase 慣例 / 反面後果）| 用 `per Decision X` / `reviewer 建議` / `Round N 提出` 等 review-residue |

---

## 寫入時機（主 agent 動作）

每輪 review 結束，主 agent 執行：

1. 把 reviewer 輸出的 issue list 整批 append 到 §1，Status 先標 `pending`
2. 處理 issue（修 / 派工 / 問 user）後更新該列 Status + Resolution
3. 若 issue 成為 waiver → 在 §3 補完整 Waiver 區塊，§1 該列 Resolution 改 `→ §3 W{N}`
4. 若 issue 是 Architecture Decision 拍板 → 在 §2 補完整 Decision 區塊，§1 改 `→ §2 Decision <letter>`
5. 若 issue 確認為誤判 → 在 §4 補 False Positive 區塊，§1 改 `→ §4 FP{N}`
6. 若某原則經 user 確認寫入 steering → 完成 steering 編輯後在 §5 加一列（原則 / 寫入位置 / 來源）

**為什麼一筆一筆即時更新而非 batch**：reviewer 結束時 context 還新鮮，wait 太久細節會模糊；user 答 AskUserQuestion 後立即寫入 §2，rationale 還是 user 原話。

---

## 完整範例

```markdown
# Review Log — agent-memory-system

> 本文件記錄此 feature 的 review/resolve 過程。
> 正式文件（r/d/t/code）描述「決定後的世界」；本 log 描述「為什麼是這個世界」。
> 寫入規範：references/review-log-guide.md

## 1. Audit Trail

| Round | ID         | Severity | Status            | Resolution                                       |
|-------|------------|----------|-------------------|--------------------------------------------------|
| D1    | Bug A      | Critical | fixed             | design.md §MemoryService 加 lock invariant       |
| D1    | Smell B    | Medium   | fixed             | design.md L88 rename `extract` → `extract_memory`|
| D2    | Smell C    | High     | waived            | → §3 W1                                           |
| D2    | Decision D | -        | decision-resolved | → §2 Decision D                                   |
| I1    | Bug A      | Critical | false-positive    | → §4 FP1                                          |
| I1    | Bug B      | Critical | fixed             | src/cache.py:42 加 RLock                          |
| I2    | Smell C    | Medium   | fixed             | src/handler.py refactor，抽 _format_payload      |

## 2. Architecture Decisions

### Decision D（raised at D2）
**Problem**: Cache invalidation 策略 — TTL vs explicit invalidation
**Options considered**:
- **Option 1**: 60s TTL — 簡單，可容忍 staleness，背景輪詢省事
- **Option 2**: 顯式 invalidation — 強一致性，但需要事件廣播機制
**Chosen**: Option 1
**Rationale (user, 2026-05-12)**: read-heavy workload 可容忍 1 分鐘 staleness，simplicity 優先；未來真的需要強一致再升級
**Affects**: design.md §Cache, tasks.md T2.3

## 3. Waivers

### W1: Task 1.4 違反 SRP（from D2 Smell C）
**Raised by**: spec-verifier, Round D2, severity High
**Principle violated**: Single Responsibility
**Where**: tasks.md task 1.4
**Why kept**:
DB migration 必須 atomic — backfill owner_user_id、drop memory_owners、加 CHECK constraint、
drop group_id、rename extracted_*、加 FK CASCADE 任一拆分都會留下 schema invariant 違反的中間態
（例如先加 CHECK 但 backfill 未完成，或先 drop 表但 caller 未改完）。
**Trade-off accepted**: 大型 multi-purpose task 的可讀性 vs schema integrity guarantee；
換得「production 不會出現中間態 schema 違反」，付出「task 描述偏長、grep 看不到單一職責」
**Related Decisions**: AL, Q, M
**Accepted by**: User decision, 2026-05-12

## 4. False Positives

### FP1: process_batch 缺 idempotency key（from I1 Bug A）
**Reviewer claim**: src/processor.py process_batch 沒做 idempotency
**Actual situation**: 上游 webhook handler 已在 receiver layer 用 event_id 去重（src/webhook.py:23），
process_batch 是內部 callee，呼叫端已保證每個 batch_id 只進來一次
**Resolution**: process_batch docstring 加一行 "idempotency enforced by caller (see src/webhook.py)"，
避免後續 reviewer 重複提出

## 5. Steering Updates

| #   | 日期       | 原則                                      | 寫入位置                | 來源     |
|-----|------------|-------------------------------------------|------------------------|----------|
| SU1 | 2026-05-12 | cache 類元件預設 TTL 失效，不做 explicit invalidation | tech.md §Caching        | Decision D |
```

---

## 為什麼不寫 MUST / NEVER

本文件用「✅/❌」與「為什麼這樣設計」說明，不用硬性禁令。判斷準則永遠是：**正式文件能不能保持「single source of truth」可讀性？review log 能不能讓未來維護者快速回答「為什麼這裡這樣設計」？** 這兩問通過，細節彈性處理；通不過則需要回到本指引調整寫法。
