# Tasks Document

> ## ⛔ Forbidden sections (formal-doc 100% isolation principle)
>
> tasks.md **describes "which tasks to do"** and carries no trace of the review process. The following must absolutely NOT appear in a task description:
>
> - Any **waiver block** (`> **SRP exception (known and accepted)**: ...` / `<!-- WAIVED -->`)
> - Any **reviewer letter tag** (`(per Decision X)` / `(per Smell Y)` / `(per spec-verifier Round 2)`)
> - Any **review-process narration** ("fixed in Round 3" / "reviewer flagged as High" / "user resolved in Round 5 to keep it")
> - Any **review-log reference** or **footnote pointer** (`→ review-log.md §W1` / `> ⓘ ...`)
>
> If a task violates some principle (e.g. SRP) but is deliberately kept, the **rationale goes in `review-log.md §3 Waivers`**; tasks.md describes only what the task itself needs to do, and **does not explain** "why this task violates principle X".
>
> If a task description genuinely needs to explain "why it was split this way", use neutral prose (technical constraints / atomicity requirements, etc.) and **do not reveal** the reviewer source. See `references/review-log-bad-examples.md`.

## Task Status Markers

| Marker | Meaning | Description |
|------|------|------|
| `[ ]` | To do | Task not yet started |
| `[x]` | Done | Implemented and verified to pass |
| `[~]` | Needs rework | Affected by a design change, needs reimplementation |
| `[-]` | Removed | Removed by a design change, code already cleaned up |

> **What each field is for.** `File:` decides parallel grouping and what the tester must not read. Phases and `After:` decide order: `After:` lists only **earlier** task numbers **in the same phase**, so a cycle cannot be written, and only when the task depends on what another task in the phase writes while their `File:` sets are disjoint (with overlapping sets they are grouped together anyway, and list order sets the order inside a group). Test tasks never carry `After:`: they run in parallel, blind to the code. `Cases:` assigns test cases. The contract is read from design.md and the approach is the implementer's, so a task carries no steps and does not restate the design.

---

## Phase 1: [Phase name]

- [ ] 1. [Task title — names the component or public interface the task delivers, by its design.md name, e.g. "`SyncQueue.push` and `SyncQueue.drain`"]
  - File: [the files the task writes]
  - [One line: the outcome, not the steps, e.g. "concurrent pushes are drained in arrival order, none lost"]
  - _Requirements: [optional trace — corresponding requirement number]_

- [ ] 2. [Task title]
  - File: [the files the task writes]
  - [One line: the outcome]
  - After: [optional — earlier task numbers in the same phase, e.g. 1]

- [ ] 3. [Test task title]
  - File: [test file path — **test files only**; a test task's File: set must not overlap any implementation task's]
  - [One line: the outcome this task covers]
  - Cases: [the case IDs from design.md's Test Cases table this task implements, e.g. T-1, T-2, T-5]

> **Test tasks** are dispatched to `spec-tester`, not `spec-implementer`, and run in parallel with the implementation groups **of the same phase** — put a test task in a later phase and the tester ends up writing against a finished implementation instead of against the contract, which is the coupling this whole arrangement exists to prevent. Every case ID in design.md's Test Cases table must be claimed by exactly one test task — none orphaned, none claimed twice — and no test task may cite an ID that isn't in the table.

---

## Phase 2: [Phase name]

- [ ] 1. [Task title]
  - ...
