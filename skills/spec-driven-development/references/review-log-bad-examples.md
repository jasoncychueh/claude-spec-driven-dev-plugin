# Review Log Bad / Good Examples

Formal doc（requirements.md / design.md / tasks.md / production code）與 review-log.md **物理隔離** — formal doc 100% 不出現 review 過程的任何痕跡。本文件用實際 pattern + 改寫示範這條紀律。

寫文件前若不確定某段內容該放哪裡，先看本文件對照組。

> 為什麼這份 doc 存在：僅靠 verifier 事後檢測時，agent 仍會習慣性引入 ADR / reviewer letter tag / Round 過程敘述（業界 Architecture Decision Records 是常見 pattern，agent 訓練資料含大量範例）。所以在 agent 寫文件當下能 reach 的地方（template、guide、本份 bad-examples）就把 negative pattern 教清楚。

---

## Pattern A: Architecture Decisions Record 段落

### ❌ Bad — design.md 含 ADR 段落

```markdown
## Components and Interfaces
[Component A 設計...]

## Architecture Decisions Record

下列 5 個 decisions 在 Round 1 design review 期間提出，user 在 Round 3 拍板：

### Decision O — Cache invalidation 策略
**Options**:
- Option 1: 60s TTL
- Option 2: 顯式 invalidation
**Chosen**: Option 1
**Rationale (user, Round 3)**: read-heavy workload tolerates staleness
**Source**: Round 1 design review by design-reviewer

### Decision P — Retry backoff
[...]
```

**為什麼錯**：

- `## Architecture Decisions Record` 段落本身屬 `review-log.md §2` content
- 「下列 5 個 decisions 在 Round 1 design review 期間提出」是 review process meta-info
- `(Round 3)` / `Source: Round 1 design review` 揭露 review 過程
- 內容與 review-log.md §2 重複，未來改一處忘改另一處會產生不一致

### ✅ Good — design.md 用中性 design rationale 整合進 Component

```markdown
## Components and Interfaces

### CacheService
- **Purpose:** in-memory cache for frequently read entities
- **Interfaces:**
  ```python
  def get(self, key: str) -> Optional[Entity]:
      """Returns cached entity (≤60s old) or None to trigger backend refetch.

      Rationale: 60s TTL balances staleness against backend RPS for our
      read-heavy workload (read:write ≈ 100:1). Stronger consistency would
      require explicit invalidation across all writer paths, which is
      currently overkill given the workload profile.
      """
  ```
- **Dependencies:** EntityRepository
```

**為什麼對**：

- 解釋「為什麼這樣設計」用**技術理由**（read-heavy workload、read:write ratio）
- 對比**反面後果**（explicit invalidation overkill）讓 reader 理解 trade-off
- **不揭露**：reviewer / Decision O 編號 / Round N / user 拍板過程
- 完整 Decision content（Options / Chosen / Rationale / Affects）僅存於 `review-log.md §2 Decision O`

---

## Pattern B: 表格中 reviewer letter tag

### ❌ Bad — design.md Key Design Decisions 表

```markdown
## Key Design Decisions

| 元件 | 設計選擇 | 來源 |
|---|---|---|
| MemoryService | 改用 owner_user_id 單表 | per user Decision O |
| ConversationLayer | 移除 group_id | per Decision P |
| MessageExtractor | rename extract → extract_memory | per Smell G |
| MemoryRepo | 加 CHECK constraint | per user Decision Q |
| 全域 | retry exponential backoff | per user Decision R |
```

**為什麼錯**：

- `per user Decision O/P/Q/R` 跟 `per Smell G` 是 reviewer-side identifier，揭露 review 過程
- 整個「來源」欄位是 audit trail 性質 — 屬 `review-log.md §1 Audit Trail` 表格
- 即使 letter tag 看起來只是「引用」，依然構成 review-log dependency

### ✅ Good — design.md 用中性 prose 整合進對應 Component

```markdown
## Components and Interfaces

### MemoryService
- **Purpose:** 統一 memory ownership 管理
- **Data Model**: 使用 `owner_user_id` 直接欄位（單表設計）
  - Rationale: 5152-row scale 下 join overhead 不值得，且 ownership invariant 透過 CHECK constraint 強制
- **Interfaces:** ...

### ConversationLayer
- **Purpose:** 對話訊息存取
- **Schema 變更說明**: 移除 group_id 欄位（Phase 1 後冗餘 — group 概念整合進 conversation_type）
- **Interfaces:** ...
```

**為什麼對**：

- 設計選擇 inline 寫進對應 Component 段落（reader 看 Component 自然看到 rationale）
- Rationale 用**技術數字**（5152-row scale）與**架構說明**（CHECK constraint enforce invariant），不引用 reviewer
- 廢欄位移除原因說**業務演進**（Phase 1 後冗餘），不寫「per Decision X」

---

## Pattern C: Process narration 段落

### ❌ Bad — design.md 含 review process 敘述

```markdown
## Design Decisions Background

本設計經過 5 輪 design review。Round 1 spec-verifier 標記 4 個 Critical Bug，
Round 2 design-reviewer 提出 3 個 Architecture Decision，user 在 Round 3 拍板，
Round 4 修正後達到 0 issues 收斂。

主要設計選擇：
- Synchronous data flow（reviewer 建議避免 callback hell）
- 單一 memory ownership invariant（per Decision Q）
- ...
```

**為什麼錯**：

- 「經過 5 輪 design review」/ 「Round 1 spec-verifier 標記」/ 「user 在 Round 3 拍板」全是 review process meta-info
- 「reviewer 建議避免 callback hell」揭露 reviewer 推理 — 應該寫成「Synchronous data flow chosen because callback hell complicates debugging and stack traces」
- 整段對 reader 理解「系統怎麼運作」毫無價值，只是 narrative 過程

### ✅ Good — 完全移除這段，把核心 rationale 整合進架構章節

```markdown
## Architecture

[Mermaid 架構圖]

### 核心設計原則

- **Synchronous data flow**：所有 memory mutation 走同步路徑，避免 callback 在 error path 上的 stack trace 斷裂
- **Single memory ownership invariant**：每個 memory 由 `owner_user_id` 單一欄位定義 ownership，DB CHECK constraint 強制
- [其他原則...]
```

**為什麼對**：

- 「Synchronous」原因說「debugging / stack traces」技術理由
- Ownership invariant 說「DB CHECK constraint enforce」實作方式
- 完全沒提 reviewer / Round / Decision letter

---

## Pattern D: tasks.md 內 SRP 例外宣告

### ❌ Bad — tasks.md task 描述含「例外」block

```markdown
#### Task 1.4: Schema migration combined

四項 schema 改動同一 task：(a) 加 owner_user_id + migrate + drop memory_owners
表；(b) drop group_id；(c) rename extracted_personal → extracted；(d) 加 CHECK
constraint；(e) 加 FK CASCADE。

> **SRP 例外（已知並接受）**：本任務刻意違反 SRP，合併 5 類 schema 改動於同一 task。
> 理由：DB migration 必須 atomic — backfill owner_user_id、drop memory_owners、
> 加 CHECK constraint、drop group_id、rename extracted_*、加 FK CASCADE 任一拆分
> 都會留下 schema invariant 違反的中間態。spec-verifier 標記為 High 級 SRP 違反，
> 本豁免說明用以明確 trade-off 接受。

Production 前必須 pg_dump 備份。
```

**為什麼錯**：

- `> **SRP 例外（已知並接受）**：...` 多行 block 是經典的「formal doc 內 inline waiver」
- 「spec-verifier 標記為 High 級 SRP 違反」揭露 review 過程
- 「本豁免說明用以明確 trade-off 接受」是 audit trail 句子，屬 review-log

### ✅ Good — tasks.md 只描述 task；豁免理由純粹存在 review-log §3

```markdown
#### Task 1.4: Atomic schema migration

五項 schema 改動須 atomic 完成於同一 transaction：
(a) 加 owner_user_id + backfill + drop memory_owners
(b) drop group_id
(c) rename extracted_personal → extracted
(d) 加 CHECK constraint for ownership invariant
(e) 加 FK CASCADE for conversation_id

合併理由：任一拆分都會留下 schema invariant 違反的中間態
（例如先加 CHECK 但 backfill 未完成）。

Production 前必須 pg_dump 備份。
```

**為什麼對**：

- 「合併理由」一句話**技術說明**（schema invariant 中間態），不寫「SRP 例外」標籤
- 不提 spec-verifier / High 級 / 豁免接受 — 那些只在 review-log.md §3 W1 存在
- Reader 看到 task 自然知道「這個 task 大是因為 schema atomicity」，不會誤以為遺漏 SRP 檢查

對應的 review-log.md §3 寫法（**這段在另一個檔案，不在 tasks.md**）：

```markdown
### W1: Task 1.4 違反 SRP（from D2 Smell C）
**Raised by**: spec-verifier, Round D2, severity High
**Principle violated**: Single Responsibility
**Where**: tasks.md task 1.4
**Why kept**:
DB migration 必須 atomic — backfill owner_user_id、drop memory_owners、加 CHECK constraint、
drop group_id、rename extracted_*、加 FK CASCADE 任一拆分都會留下 schema invariant
違反的中間態。
**Trade-off accepted**: 大型 multi-purpose task 的可讀性 vs schema integrity guarantee
**Related Decisions**: AL, Q, M
**Accepted by**: User decision, 2026-05-12
```

---

## Pattern E: production code 內 WAIVED 註解

### ❌ Bad — Python 內

```python
def update(self, key, value):
    # WAIVED in implementation review Round I2 (Smell C):
    # reviewer flagged race here but user accepted because
    # expected concurrency is single-digit RPS
    # See review-log.md §W3
    self._store[key] = value
```

**為什麼錯**：

- 「WAIVED in implementation review Round I2」揭露 review 過程
- 「See review-log.md §W3」是 footnote pointer — 任何指向 review-log 的引用都被禁止
- Reader 看到此註解的反應：「Round I2 哪個 reviewer？User 是誰？理由還成立嗎？」— 答不出來，反而製造焦慮

### ✅ Good — 中性 code semantic comment

```python
def update(self, key, value):
    # No locking: expected single-writer-per-key invariant
    # (caller serializes via key-sharded queue, see EventDispatcher)
    self._store[key] = value
```

**為什麼對**：

- 解釋「為什麼沒 lock」用**系統 invariant**（single-writer-per-key）+ **依賴指向**（caller 怎麼保證）
- Reader 看到能驗證：「我去看 EventDispatcher 有沒有 key-sharded queue 就知道前提是否成立」
- 完全不提 review / waiver — 豁免的 audit trail 在 `review-log.md §3 W3`

---

## 通用改寫公式

| 你想寫的 review-residue | 中性改寫方向 |
|---|---|
| 「per Decision X，採同步」 | 「Synchronous because <技術理由>」 |
| 「reviewer 建議避免 callback hell」 | 「Synchronous to keep stack traces intact for debugging」 |
| 「user 在 Round 3 拍板選 Option 2」 | 直接寫 Option 2 的決定 + 技術 rationale，不提 Round / user |
| 「SRP 例外（已知並接受）：...」 | 「合併理由：<atomicity / dependency / invariant 等技術需求>」 |
| 「per Smell G 重命名」 | 直接用新命名，必要時一句 docstring 說「naming aligns with X module convention」 |
| 「See review-log §W1」 | 把該內容對 reader 有意義的部分用中性 prose 寫進 docstring / Component description |

**核心公式**：把「**WHO** decided + **WHEN** in review + **WHAT** waiver code」三層 review meta-info **剝離**，只留「**WHY** technically」這層 rationale，整合進 Component / docstring / task description 對應位置。

完整 review trace（誰提的、哪一輪、為什麼接受）放 `review-log.md`，與 formal doc 物理隔離。
