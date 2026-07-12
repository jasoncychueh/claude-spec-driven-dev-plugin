# Review Log Authoring Guidelines

The detailed conventions the main agent follows when maintaining review-log.md during the review/resolve process. The reviewer agent may also read this document to understand the log structure (but the reviewer **does not write the log directly** — it only produces the issue list).

> This document answers "**how to write the review log**". For "why a review log is needed" and "the overall flow", see the Review Log section of SKILL.md.

---

## Core Philosophy

**Formal docs describe "the world after the decision"; the review log describes "why it is this world". The two are physically isolated.**

- requirements.md / design.md / tasks.md / production code → **never contain** any trace of the review process (waiver / decision content / reviewer references / process narration / review-log references / footnote pointers are all forbidden)
- review-log.md → centrally retains five kinds of artifact (audit trail / Decisions / Waivers / False Positives / Steering Updates)

When a formal doc needs to explain "why this Component is designed this way" / "why this task looks large", use **neutral design rationale** (technical constraints / codebase conventions / adverse consequences) integrated into the corresponding passage — **without revealing** reviewer / Decision / review-log.

**Why 100% isolation**:
1. Formal docs are read far more often than the review log; preserving the readability of the single source of truth is a core KPI
2. A footnote pointer looks lightweight, but in practice it trains the agent into the habit of "I can mention the review-log in design.md", which gradually degenerates into an inline waiver block (empirically proven: once the pointer back door is opened, the agent naturally adds back ADR sections + reviewer letter tags + Round process narration)
3. Design rationale can be expressed with neutral technical prose; there's no need to cite the reviewer just to "emphasize that this was discussed" — the reader doesn't need that layer of information, and whoever does need it goes to the review-log

Detailed bad/good comparison: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/review-log-bad-examples.md`

---

## File Location

| Mode | Location | Commit |
|---|---|---|
| Spec Mode | `.spec/specs/{feature}/review-log.md` (alongside r/d/t) | Yes |
| Quick Fix Mode | The `## Review Log` section at the end of the plan file | No (the plan file is ephemeral anyway) |

---

## ID and Reference Protocol

### Letter ID Rules

- **Design review** and **Implementation review** each accumulate letters independently (A, B, C, ...)
- Within the same review kind, letters **accumulate across rounds without resetting** (D Round 1 uses A-B, D Round 2 continues from C)
- References anywhere in the text must include the Round prefix to be uniquely identifiable: write `D2 Smell C` or `I1 Bug A` — **writing just `Bug A` counts as violating the reference protocol**

### Round Naming

`D{N}` = design review round N
`I{N}` = implementation review round N

### Section References

- Cross-round issues cite the letter ID: `D2 Smell C`
- §2 Decisions cite the reviewer's original Decision letter: `Decision D`
- §3 Waivers use independent W numbers: `W1`, `W2`
- §4 False Positives use independent FP numbers: `FP1`, `FP2`

### Status Field Values

| Value | Meaning |
|---|---|
| `pending` | The main agent just appended it to §1, not yet processed |
| `fixed` | Already fixed (design.md / code / tasks.md changed) |
| `waived` | Deliberately kept — the Resolution field must point to the corresponding Waiver in §3 |
| `backlogged` | Deferred as a debt to repay later — the Resolution field must cite the backlog item id (e.g. `bl-0007`); unlike `waived`, the current state is NOT accepted |
| `decision-resolved` | An Architecture Decision the **user** resolved — the Resolution field must point to §2 |
| `advisor-resolved` | An Architecture Decision the **advisor** settled (per the advisor gate), pending the user's review at the briefing — the Resolution field points to §2 with an `(advisor)` note. Becomes `decision-resolved` if the user later overrides it (see `advisor-gate-guide.md`) |
| `false-positive` | Confirmed a false positive — the Resolution field must point to §4 |

---

## Writing Conventions for the Five Sections

### §1 Audit Trail

After each reviewer round ends, the main agent appends all of that round's issues into the table at once, marking Status as `pending` first. After processing, it updates Status + Resolution.

**The 1-line principle for the Resolution field**:
- `fixed`: write "what was changed + where" (e.g., `design.md §Component-X switched to mutex` or `src/cache.py:42 added RLock`)
- `waived` / `decision-resolved` / `false-positive`: write a cross-reference (e.g., `→ §3 W1`)

**Why 1 line**: the value of the table is to scan the whole picture at a glance. Put the full reasoning in the corresponding subsection.

### §2 Architecture Decisions

Each Decision uses a level-3 heading plus a letter ID:

```markdown
### Decision D (raised at D2)
**Problem**: <one-sentence statement of the contention>
**Options considered**:
- **Option 1**: <approach> — <one-sentence trade-off>
- **Option 2**: <approach> — <one-sentence trade-off>
**Chosen**: Option N
**Rationale (user, YYYY-MM-DD)**: <the reasoning the user added in AskUserQuestion + the main agent's tidy-up>
**Affects**: <the affected formal-doc locations, e.g. design.md §Cache, tasks.md T2.3>
```

**Why there's an `Affects` field**: when a related component is changed in the future, you can look back to "will this change overturn a past user decision".

**Advisor-resolved Decisions** use the same skeleton with the heading tagged `[advisor-resolved · pending your review]` and the rationale attributed to the advisor:

```markdown
### Decision D (raised at D2)  [advisor-resolved · pending your review]
**Problem**: <one-sentence statement of the contention>
**Options considered**: <as above>
**Chosen**: Option N
**Rationale (advisor, YYYY-MM-DD)**: <the advisor's reasoning + the main agent's tidy-up>
**Affects**: <as above>
```

It is surfaced at the next briefing / Summary for the user to confirm or override (never asked at resolution time). On override, re-record with `**Chosen**` + `**Rationale (user, YYYY-MM-DD)**` and drop the tag; if left to stand, just drop the `[advisor-resolved · pending your review]` tag. Full lifecycle: the plugin's `references/advisor-gate-guide.md`.

### §3 Waivers

Written when an issue's resolution is "kept, not fixed" (whether the user actively resolved it or it was accepted after a trade-off assessment).

```markdown
### W1: <one-sentence title> (from <Round> <Issue ID>)
**Raised by**: <agent name>, Round <X>, severity <Y>
**Principle violated**: <the principle violated, e.g. SRP / DRY / Idempotency>
**Where**: <formal-doc location, e.g. tasks.md task 1.4 or src/handler.py:42>
**Why kept**: <why this violation is accepted — the technical reason>
**Trade-off accepted**: <acknowledge what is lost, and what is gained>
**Related Decisions**: <if linked to some Decision, list the letter ID>
**Accepted by**: User decision, YYYY-MM-DD
```

**Why the `Trade-off accepted` field is needed**: to avoid "waivers piling up but nobody remembering what each one cost". The maintainer needs to know "keeping this violation means giving up what".

### §4 False Positives

```markdown
### FP1: <one-sentence title> (from <Round> <Issue ID>)
**Reviewer claim**: <the problem the reviewer raised>
**Actual situation**: <the actual situation, why it's not a problem — including design rationale / upstream guarantee / other clarification>
**Resolution**: <how to avoid raising it again in the future, e.g.: add a docstring hint / update design.md explanation / add an inline comment explaining the constraint>
```

**Why this section is needed**: the reviewer is an independent invocation with no cross-round memory. Without an FP record, the same false positive recurs repeatedly, wasting review rounds.

### §5 Steering Updates (Promotion Record)

When a project-level principle discovered during development is, after user confirmation, written into steering (per the "Steering Evolution Mechanism" in SKILL.md), record a row here:

```markdown
| #   | Date       | Principle (one sentence)                          | Written into            | Source        |
|-----|------------|----------------------------------------|------------------------|------------|
| SU1 | 2026-05-12 | service-layer errors always raise, no Result type | tech.md §Error Handling | D2 SC-1    |
```

**Source field values**: the reviewer's SC number (`D2 SC-1`), the Architecture Decision number (`Decision D`), or `implementer report` (discovered during implementation).

**Why this section is needed**: when steering has been changed but nobody remembers "why this entry was added", this table is the lookup entry point — tracing from the principle back to the review / Decision context that triggered it. Steering itself only states the principle (the world after the decision), not the source.

---

## Reference Protocol — Complete Isolation

**There is no reference relationship between the formal doc and the review-log.**

An older version once allowed the `> ⓘ <one sentence> — see review-log.md §<id>` footnote pointer as an "abnormal + tracked" signal, **now fully abolished** — empirically, once the agent sees the pointer is allowed, it gradually degenerates into ADR sections + reviewer letter tags + Round process narration (only 100% isolation of the formal doc can root out this drift).

### The Correct Way for a Formal Doc to Explain "Why It's Designed This Way"

Use **neutral design rationale** integrated into the Component / docstring / task description:

| Dimension | How to write it |
|---|---|
| **Technical constraint** | "Synchronous for atomicity guarantees" |
| **Codebase convention** | "Returns None per upstream convention in UserService" |
| **Adverse consequence** | "Splitting would leave intermediate states violating schema invariants" |
| **System invariant dependency** | "No locking: caller serializes via key-sharded queue (see EventDispatcher)" |

**Forbidden**:

- "per Decision X" / "per Smell Y" / "per Bug Z"
- "reviewer suggested / flagged / raised"
- "user resolved it in Round N"
- "See review-log.md §X" / `> ⓘ` / `→ §W1`
- Whole `## Architecture Decisions Record` / `## ADR` / `## Decisions` sections

Full bad/good comparison (6 patterns + a general rewrite formula): `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/review-log-bad-examples.md`

### Review Log Internal Structure

The review log internally uses letter ID + W / FP number cross-references (e.g., the §1 Audit Trail table's Resolution field writes `→ §3 W1`). These exist **only within review-log.md**, never spilling over into the formal doc.

---

## ✅/❌ Comparison Table

| ✅ Do | ❌ Don't |
|---|---|
| Each §1 table row's Resolution field is 1 line; the full reasoning goes in the corresponding subsection | Write a 3-line explanation in the Resolution field |
| Write the waiver into §3; the formal doc explains with neutral design rationale | Write a multi-line block `> **SRP exception (known and accepted)**: ...` in tasks.md |
| Use the reviewer's original letter ID for a Decision (Decision D) | Renumber (Decision 1, Decision 2) |
| §3 Waiver mandatorily fills in the `Trade-off accepted` field | Only write "why kept" without "what was lost" |
| Write an Architecture Decision into §2 immediately after it's resolved | Wait until all reviews converge before backfilling it (the details have already blurred) |
| FP1 writes the Resolution field explaining how to avoid raising it again | Only record "reviewer false positive" without recording how to prevent recurrence |
| Use independent letter sequences across review kinds (D and I each accumulate separately) | Mix design / impl issues into the same letter sequence |
| The formal doc never contains a review-log reference / pointer / letter tag | Use the `> ⓘ ... — see review-log §W1` footnote pointer (abolished) |
| After steering promotion, record a row in §5 (principle / location / source) | Steering changed but the review log has no record, so there's no way to look up later why this entry was added |
| The formal doc explains design rationale with neutral prose (technical / codebase convention / adverse consequence) | Use `per Decision X` / `reviewer suggested` / `raised in Round N` and other review-residue |

---

## When to Write (Main Agent Actions)

At the end of each review round, the main agent does:

1. Append the reviewer's output issue list as a batch into §1, marking Status as `pending` first
2. After processing an issue (fix / dispatch / ask user), update that row's Status + Resolution
3. If the issue becomes a waiver → fill in the full Waiver block in §3, and change that §1 row's Resolution to `→ §3 W{N}`
4. If the issue is an Architecture Decision resolution → fill in the full Decision block in §2, and change §1 to `→ §2 Decision <letter>`
5. If the issue is confirmed a false positive → fill in the False Positive block in §4, and change §1 to `→ §4 FP{N}`
6. If a principle is, after user confirmation, written into steering → after finishing the steering edit, add a row in §5 (principle / written-into location / source)

**Why update entry by entry in real time rather than in a batch**: when the reviewer finishes, the context is still fresh; waiting too long blurs the details; after the user answers AskUserQuestion, writing into §2 immediately keeps the rationale in the user's original words.

---

## Full Example

```markdown
# Review Log — agent-memory-system

> This document records the review/resolve process for this feature.
> The formal docs (r/d/t/code) describe "the world after the decision"; this log describes "why it is this world".
> Authoring conventions: references/review-log-guide.md

## 1. Audit Trail

| Round | ID         | Severity | Status            | Resolution                                       |
|-------|------------|----------|-------------------|--------------------------------------------------|
| D1    | Bug A      | Critical | fixed             | design.md §MemoryService added lock invariant    |
| D1    | Smell B    | Medium   | fixed             | design.md L88 rename `extract` → `extract_memory`|
| D2    | Smell C    | High     | waived            | → §3 W1                                           |
| D2    | Decision D | -        | decision-resolved | → §2 Decision D                                   |
| I1    | Bug A      | Critical | false-positive    | → §4 FP1                                          |
| I1    | Bug B      | Critical | fixed             | src/cache.py:42 added RLock                       |
| I2    | Smell C    | Medium   | fixed             | src/handler.py refactor, extracted _format_payload |

## 2. Architecture Decisions

### Decision D (raised at D2)
**Problem**: Cache invalidation strategy — TTL vs explicit invalidation
**Options considered**:
- **Option 1**: 60s TTL — simple, tolerates staleness, easy background polling
- **Option 2**: explicit invalidation — strong consistency, but needs an event broadcast mechanism
**Chosen**: Option 1
**Rationale (user, 2026-05-12)**: a read-heavy workload tolerates 1 minute of staleness, simplicity comes first; upgrade later if strong consistency is truly needed
**Affects**: design.md §Cache, tasks.md T2.3

## 3. Waivers

### W1: Task 1.4 violates SRP (from D2 Smell C)
**Raised by**: spec-verifier, Round D2, severity High
**Principle violated**: Single Responsibility
**Where**: tasks.md task 1.4
**Why kept**:
The DB migration must be atomic — backfill owner_user_id, drop memory_owners, add CHECK constraint,
drop group_id, rename extracted_*, add FK CASCADE; any split would leave an intermediate state violating a schema invariant
(e.g. adding CHECK first but backfill not done, or dropping the table first but callers not yet updated).
**Trade-off accepted**: the readability of a large multi-purpose task vs schema integrity guarantee;
gaining "production won't see an intermediate-state schema violation", paying with "a longer task description, no single responsibility visible via grep"
**Related Decisions**: AL, Q, M
**Accepted by**: User decision, 2026-05-12

## 4. False Positives

### FP1: process_batch missing idempotency key (from I1 Bug A)
**Reviewer claim**: src/processor.py process_batch doesn't do idempotency
**Actual situation**: the upstream webhook handler already dedupes by event_id at the receiver layer (src/webhook.py:23),
process_batch is an internal callee, and the caller already guarantees each batch_id enters only once
**Resolution**: add a line to the process_batch docstring "idempotency enforced by caller (see src/webhook.py)",
to avoid subsequent reviewers raising it again

## 5. Steering Updates

| #   | Date       | Principle                                 | Written into            | Source     |
|-----|------------|-------------------------------------------|------------------------|----------|
| SU1 | 2026-05-12 | cache-type components default to TTL expiry, no explicit invalidation | tech.md §Caching        | Decision D |
```

---

## Why Not Write MUST / NEVER

This document uses "✅/❌" and "why it's designed this way" to explain, not hard prohibitions. The decision criterion is always: **can the formal doc keep its "single source of truth" readability? Can the review log let a future maintainer quickly answer "why is it designed this way here"?** If both questions pass, handle the details flexibly; if they fail, you need to come back to this guide to adjust the approach.
