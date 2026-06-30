# Review Log Bad / Good Examples

The formal docs (requirements.md / design.md / tasks.md / production code) and review-log.md are **physically isolated** — the formal docs never contain any trace of the review process. This document demonstrates this discipline with real patterns + rewrites.

Before writing a doc, if you're unsure where a piece of content belongs, first check the comparison sets in this document.

> Why this doc exists: relying on the verifier to detect afterward alone, the agent still habitually introduces ADR / reviewer letter tags / Round process narration (Architecture Decision Records are a common industry pattern, and the agent's training data contains plenty of examples). So we teach the negative pattern clearly in the places the agent can reach at the moment it writes the doc (the template, the guide, this bad-examples file).

**Production code is also a formal surface** (Pattern F): beyond review-log residue, shipped comments must not pin themselves to a **spec doc's section/requirement numbering** (`design.md §Component 8` / `Requirements: R6.1`). Only references that don't drift with your spec's structure may be cited — an external standard (`RFC §` / OAuth / IETF) or a spec's **name** (a stable handle). **`ADR-N` is *not* exempt**: in this project ADRs are `#### ADR-N:` sections inside design.md, so an ADR *number* drifts exactly like `§Component 8` — write the decision, not the pointer.

## Table of Contents

1. [Pattern A: Architecture Decisions Record Section](#pattern-a-architecture-decisions-record-section)
2. [Pattern B: Reviewer Letter Tags in a Table](#pattern-b-reviewer-letter-tags-in-a-table)
3. [Pattern C: Process Narration Section](#pattern-c-process-narration-section)
4. [Pattern D: SRP Exception Declaration in tasks.md](#pattern-d-srp-exception-declaration-in-tasksmd)
5. [Pattern E: WAIVED Comment in Production Code](#pattern-e-waived-comment-in-production-code)
6. [Pattern F: Review-Log Codes & Spec-Section Pointers in Production Comments](#pattern-f-review-log-codes--spec-section-pointers-in-production-comments)
7. [General Rewrite Formula](#general-rewrite-formula)

---

## Pattern A: Architecture Decisions Record Section

### ❌ Bad — design.md contains an ADR section

```markdown
## Components and Interfaces
[Component A design...]

## Architecture Decisions Record

The following 5 decisions were raised during Round 1 design review, and the user resolved them in Round 3:

### Decision O — Cache invalidation strategy
**Options**:
- Option 1: 60s TTL
- Option 2: explicit invalidation
**Chosen**: Option 1
**Rationale (user, Round 3)**: read-heavy workload tolerates staleness
**Source**: Round 1 design review by design-reviewer

### Decision P — Retry backoff
[...]
```

**Why it's wrong**:

- The `## Architecture Decisions Record` section itself belongs to `review-log.md §2` content
- "The following 5 decisions were raised during Round 1 design review" is review process meta-info
- `(Round 3)` / `Source: Round 1 design review` reveals the review process
- The content duplicates review-log.md §2; changing one place and forgetting the other in the future produces inconsistency

### ✅ Good — design.md uses neutral design rationale integrated into the Component

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

**Why it's right**:

- Explains "why it's designed this way" with a **technical reason** (read-heavy workload, read:write ratio)
- Contrasts the **adverse consequence** (explicit invalidation overkill) so the reader understands the trade-off
- **Does not reveal**: reviewer / Decision O number / Round N / the user resolution process
- The full Decision content (Options / Chosen / Rationale / Affects) exists only in `review-log.md §2 Decision O`

---

## Pattern B: Reviewer Letter Tags in a Table

### ❌ Bad — design.md Key Design Decisions table

```markdown
## Key Design Decisions

| Component | Design choice | Source |
|---|---|---|
| MemoryService | switch to single-table owner_user_id | per user Decision O |
| ConversationLayer | remove group_id | per Decision P |
| MessageExtractor | rename extract → extract_memory | per Smell G |
| MemoryRepo | add CHECK constraint | per user Decision Q |
| Global | retry exponential backoff | per user Decision R |
```

**Why it's wrong**:

- `per user Decision O/P/Q/R` and `per Smell G` are reviewer-side identifiers that reveal the review process
- The whole "Source" column is audit-trail in nature — it belongs to the `review-log.md §1 Audit Trail` table
- Even if a letter tag looks like just a "reference", it still constitutes a review-log dependency

### ✅ Good — design.md uses neutral prose integrated into the corresponding Component

```markdown
## Components and Interfaces

### MemoryService
- **Purpose:** unified memory ownership management
- **Data Model**: uses the `owner_user_id` direct field (single-table design)
  - Rationale: at 5152-row scale the join overhead isn't worth it, and the ownership invariant is enforced via a CHECK constraint
- **Interfaces:** ...

### ConversationLayer
- **Purpose:** conversation message access
- **Schema change note**: removed the group_id field (redundant after Phase 1 — the group concept is merged into conversation_type)
- **Interfaces:** ...
```

**Why it's right**:

- The design choice is written inline into the corresponding Component section (the reader naturally sees the rationale when looking at the Component)
- The Rationale uses a **technical number** (5152-row scale) and an **architectural note** (CHECK constraint enforces the invariant), without citing the reviewer
- The reason for removing the obsolete field states **business evolution** (redundant after Phase 1), not "per Decision X"

---

## Pattern C: Process Narration Section

### ❌ Bad — design.md contains a review process narration

```markdown
## Design Decisions Background

This design went through 5 rounds of design review. In Round 1, spec-verifier flagged 4 Critical Bugs,
in Round 2 design-reviewer raised 3 Architecture Decisions, the user resolved them in Round 3,
and after Round 4 fixes it converged to 0 issues.

Main design choices:
- Synchronous data flow (reviewer suggested avoiding callback hell)
- Single memory ownership invariant (per Decision Q)
- ...
```

**Why it's wrong**:

- "went through 5 rounds of design review" / "Round 1 spec-verifier flagged" / "the user resolved them in Round 3" are all review process meta-info
- "reviewer suggested avoiding callback hell" reveals the reviewer's reasoning — it should be written as "Synchronous data flow chosen because callback hell complicates debugging and stack traces"
- The whole passage has no value for the reader's understanding of "how the system works"; it's just narrative process

### ✅ Good — remove this passage entirely, integrate the core rationale into the architecture section

```markdown
## Architecture

[Mermaid architecture diagram]

### Core Design Principles

- **Synchronous data flow**: all memory mutations go through the synchronous path, avoiding broken stack traces from callbacks on the error path
- **Single memory ownership invariant**: each memory's ownership is defined by the single `owner_user_id` field, enforced by a DB CHECK constraint
- [other principles...]
```

**Why it's right**:

- The reason for "Synchronous" is stated as "debugging / stack traces" — a technical reason
- The ownership invariant is stated as "DB CHECK constraint enforces it" — the implementation approach
- No mention at all of reviewer / Round / Decision letter

---

## Pattern D: SRP Exception Declaration in tasks.md

### ❌ Bad — tasks.md task description contains an "exception" block

```markdown
#### Task 1.4: Schema migration combined

Five schema changes in the same task: (a) add owner_user_id + migrate + drop the memory_owners
table; (b) drop group_id; (c) rename extracted_personal → extracted; (d) add a CHECK
constraint; (e) add FK CASCADE.

> **SRP exception (known and accepted)**: this task deliberately violates SRP, merging 5 kinds of schema change into one task.
> Reason: the DB migration must be atomic — backfill owner_user_id, drop memory_owners,
> add CHECK constraint, drop group_id, rename extracted_*, add FK CASCADE; any split
> would leave an intermediate state violating a schema invariant. spec-verifier flagged it as a High SRP violation,
> and this waiver note serves to make the trade-off acceptance explicit.

A pg_dump backup is mandatory before production.
```

**Why it's wrong**:

- The multi-line block `> **SRP exception (known and accepted)**: ...` is the classic "inline waiver inside a formal doc"
- "spec-verifier flagged it as a High SRP violation" reveals the review process
- "this waiver note serves to make the trade-off acceptance explicit" is an audit-trail sentence, which belongs to the review-log

### ✅ Good — tasks.md only describes the task; the waiver reasoning lives purely in review-log §3

```markdown
#### Task 1.4: Atomic schema migration

Five schema changes must be completed atomically in the same transaction:
(a) add owner_user_id + backfill + drop memory_owners
(b) drop group_id
(c) rename extracted_personal → extracted
(d) add CHECK constraint for ownership invariant
(e) add FK CASCADE for conversation_id

Reason for merging: any split would leave an intermediate state violating a schema invariant
(e.g. adding CHECK first but backfill not done).

A pg_dump backup is mandatory before production.
```

**Why it's right**:

- The "reason for merging" is a one-sentence **technical note** (intermediate-state schema invariant), without the "SRP exception" label
- No mention of spec-verifier / High severity / waiver acceptance — those exist only in review-log.md §3 W1
- When the reader sees the task, they naturally understand "this task is large because of schema atomicity", and won't mistakenly think the SRP check was missed

The corresponding review-log.md §3 (**this passage is in another file, not in tasks.md**):

```markdown
### W1: Task 1.4 violates SRP (from D2 Smell C)
**Raised by**: spec-verifier, Round D2, severity High
**Principle violated**: Single Responsibility
**Where**: tasks.md task 1.4
**Why kept**:
The DB migration must be atomic — backfill owner_user_id, drop memory_owners, add CHECK constraint,
drop group_id, rename extracted_*, add FK CASCADE; any split would leave an intermediate state
violating a schema invariant.
**Trade-off accepted**: the readability of a large multi-purpose task vs schema integrity guarantee
**Related Decisions**: AL, Q, M
**Accepted by**: User decision, 2026-05-12
```

---

## Pattern E: WAIVED Comment in Production Code

### ❌ Bad — inside Python

```python
def update(self, key, value):
    # WAIVED in implementation review Round I2 (Smell C):
    # reviewer flagged race here but user accepted because
    # expected concurrency is single-digit RPS
    # See review-log.md §W3
    self._store[key] = value
```

**Why it's wrong**:

- "WAIVED in implementation review Round I2" reveals the review process
- "See review-log.md §W3" is a footnote pointer — any reference pointing to the review-log is forbidden
- The reader's reaction to this comment: "Round I2, which reviewer? Who's the user? Does the reasoning still hold?" — unanswerable, and it instead creates anxiety

### ✅ Good — neutral code semantic comment

```python
def update(self, key, value):
    # No locking: expected single-writer-per-key invariant
    # (caller serializes via key-sharded queue, see EventDispatcher)
    self._store[key] = value
```

**Why it's right**:

- Explains "why there's no lock" with a **system invariant** (single-writer-per-key) + a **dependency pointer** (how the caller guarantees it)
- The reader can verify what they see: "I'll go check whether EventDispatcher has a key-sharded queue and I'll know whether the premise holds"
- No mention at all of review / waiver — the waiver's audit trail is in `review-log.md §3 W3`

---

## Pattern F: Review-Log Codes & Spec-Section Pointers in Production Comments

Pattern E covers the blatant *waiver block* (`# WAIVED in Round I2 — see review-log §W3`). This pattern covers the subtler residue: a code / pointer that **rides inside an otherwise-legitimate technical comment**, so it reads as normal at a glance and survives review.

**The principle**: a production comment describes the **code** — its invariant, its precondition, the *why* behind how it's written — not the design **process**, and not a planning doc's **table of contents**. The test for whether a reference may stay is **durability**: a *stable identifier* (won't churn) may be cited; a *fragile pointer* (drifts every time a doc is reorganized, or points at something the reader can't open) may not. Crucially, *stable* is about **where the identifier lives**, not what it's called — an `ADR-N` number sounds like a durable artifact, but in this project ADRs are `#### ADR-N:` sections inside design.md, so it drifts with the spec (see below).

**Forbidden — fragile references**:

- **(A) review-log codes** — `Decision X` / `Bug X` / `Smell X` / `Round-N` / `R<n>` (review round) / `D<n>` / `Pivot-Event-N` / `SC-N`. They point at review-process artifacts the reader can't see, and that the review invalidates as it evolves. A future reader hits `(Decision AL)` with no file to open and no way to tell if the rationale still holds.
- **(B) internal spec-doc pointers** — `design.md §X` / `§Component N` / a bare `Component N` / requirement IDs (`R6.1`, `R13`, `Requirements: R6.1, R6.4, R6.5`) / **`ADR-N`** (in this project an ADR is a `#### ADR-N:` section *inside* design.md, not a separate registry — so it drifts like any other section ref). These pin shipped code to a project doc's numbering, which is re-sorted, split, and renamed constantly. The design rationale belongs **inlined as prose** in the comment, not cited by a number that rots.

**Allowed — stable handles that don't drift with your spec's structure** (cite freely; just strip any fragile code riding alongside):

- **External-standard citations** — `RFC 6749 §5.2`, an OAuth 2.0 / W3C / IETF section: an external spec with frozen, versioned numbering, owned by a standards body — not your moving design.md.
- A spec's **name** — `tool-approval-modes spec`: a stable handle. Cite the *name*; drop its Component / section / requirement numbers.

> **`ADR-N` is *not* on this list — the counter-intuitive part.** An Architecture Decision Record *sounds* like the canonical durable-decision artifact, and with a frozen ADR registry it would be citable. But durability is about *where the thing lives*, not the name: here ADRs are `#### ADR-N:` subsections **inside design.md**, so `ADR-7` drifts with every spec reorg like `§Component 8`. It belongs under Forbidden (B) — write the decision itself.

### (A) Review-log codes riding inside a normal comment

| ❌ Bad | ✅ Good |
|---|---|
| `# Phase 11 (Decision AL): owner_user_id is the single ACL column` | `# owner_user_id is the single ACL column` |
| `the current group's system prompt (Round-1 Bug B). When parse…` | `the current group's system prompt. When parse…` |
| `# Bug A guard (Phase 11 R1): group memory MUST carry conversation_id` | `# Guard: group memory MUST carry a conversation_id` |
| `Decision B column split: writes claimed_at = now()` | `The column split: writes claimed_at = now()` |
| `# Decision tree (D11 final):` | `# Decision tree:` |
| `Pending-interactions (Pivot-Event-5/-6): COMPLETE is terminal…` | `Pending-interactions: COMPLETE is terminal…` |
| `comment="Audit trail — who triggered this write (D4)"` | `comment="Audit trail — who triggered this write"` |
| `# ADR-3 Option 4b (D11 Bug C / D12)` | `# Continuation reuses the origin SDK client to stay within the latency budget` — drop the `(D11 Bug C / D12)` codes **and** `ADR-3` (a design.md §); inline the decision |

### (B) Spec-doc section / requirement / ADR pointers

| ❌ Bad | ✅ Good |
|---|---|
| `Requirements: R6.1, R6.4, R6.5` (module docstring header) | delete the line — or one plain sentence on what the module does |
| `# Design ref: design.md §Component 8` / `# Design ref: design.md Component 8` | `# Design ref: design.md` — or drop the line |
| `see design.md §Component 13.` | `see design.md.` |
| `CRUD (tool-approval-modes spec Component 2 / Component 7).` | `CRUD (tool-approval-modes spec).` — keep the spec **name**, drop `Component N` |
| `# R13 rename (formerly _resolve_task_authority)` | `# rename (formerly _resolve_task_authority)` — drop the `R13` |
| `(design §Execution-model C / §Judgment state-packing query)` | drop it, or say it plainly: "dispatch once it holds; pack the judgment at check time" |
| `# ADR-7 + Decision B schema (§Component 18)` | `# column-split schema` — drop `Decision B`, the `§Component 18`, **and** `ADR-7` (all design.md refs) |
| `# ADR-7 Scheduler driver tick` | `# Scheduler driver tick` |
| `Three terminal states per ADR-6/-7:` | `Three terminal states:` |
| `# ADR-5: approval execution is system-driven, not LLM replay` | `# approval execution is system-driven, not LLM replay` — keep the WHAT, drop the ADR pointer |

**Why these rot**:

- (A) The bracketed `(Decision AL)` / `Round-1 Bug B` / `D11` / `Pivot-Event-5` add nothing a reader can act on — there is no `Decision AL` in the codebase, and even if they found the review-log the entry may have been superseded three rounds later. The comment's *technical* claim ("owner_user_id is the single ACL column") is the only durable part; the code beside it is noise that ages into a lie.
- (B) `§Component 8` / `R6.1` are pointers into a *different file's structure*. Renumber the design doc, split a component, re-sort the requirements list — and the comment now points at the wrong place or nowhere. You've tied the half-life of a shipped comment to the editing of a planning doc.
- The exceptions survive precisely because they live **outside** your spec's structure and don't rot with it: an RFC section is frozen by the standards body, and a spec's *name* doesn't change when its internal headings do. `ADR-N` looks like it belongs here but doesn't — it's a `#### ADR-N:` section inside design.md, so it rots with the spec like (B).

**Rewrite recipe**: drop the code / pointer → ask *"what is this line of code guaranteeing?"* → rewrite using that invariant / precondition / reason.

Example: `# Decision K: FK CASCADE on conversation_id` — the comment isn't "Decision K said to use CASCADE"; it's *"FK CASCADE is a schema-level safety net; the app layer never hard-deletes users."* Write the latter — it tells the reader what protects them, and they can verify it against the schema.

---

## General Rewrite Formula

| The review-residue you want to write | Neutral rewrite direction |
|---|---|
| "per Decision X, use synchronous" | "Synchronous because <technical reason>" |
| "reviewer suggested avoiding callback hell" | "Synchronous to keep stack traces intact for debugging" |
| "user resolved it in Round 3, choosing Option 2" | write the Option 2 decision directly + the technical rationale, without mentioning Round / user |
| "SRP exception (known and accepted): ..." | "Reason for merging: <technical requirement like atomicity / dependency / invariant>" |
| "rename per Smell G" | use the new name directly, and if needed a one-sentence docstring saying "naming aligns with X module convention" |
| "See review-log §W1" | write the part of that content meaningful to the reader as neutral prose into the docstring / Component description |
| inline tag: `owner_user_id is the single ACL column (Decision AL)` | drop `(Decision AL)`; keep only the technical claim the comment already makes |
| `see design.md §Component 8` / `Requirements: R6.1` in a docstring | inline the one sentence that matters — or name the doc/spec without the section/requirement number |

**Core formula**: **strip away** the three layers of review meta-info — **WHO** decided + **WHEN** in review + **WHAT** waiver code — keeping only the "**WHY** technically" rationale layer, integrated into the corresponding place in the Component / docstring / task description. For production comments, strip one more layer — **WHERE-in-the-doc** (`§Component N` / `R6.1` / spec-section numbers) — and inline the WHY instead; keep only references that live *outside* your spec's structure (an external `RFC §`, or a spec's name — **not** `ADR-N`, which is a design.md section here).

The full review trace (who raised it, which round, why it was accepted) goes in `review-log.md`, physically isolated from the formal doc.
