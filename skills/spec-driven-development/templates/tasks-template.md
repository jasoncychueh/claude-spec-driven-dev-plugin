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

---

## Phase 1: [Phase name]

- [ ] 1. [Task title]
  - File: [file path]
  - [Task description]
  - Purpose: [the purpose of this task]
  - Design ref: [corresponding section/component name in design.md]
  - _Leverage: [existing code that can be reused]_
  - _Requirements: [corresponding requirement number]_

- [ ] 2. [Task title]
  - File: [file path]
  - [Task description]
  - Purpose: [the purpose of this task]
  - Design ref: [corresponding section/component name in design.md]

- [ ] 3. [Test task title]
  - File: [test file path — **test files only**; a test task's File: set must not overlap any implementation task's]
  - [What this task covers]
  - Cases: [the case IDs from design.md's Test Cases table this task implements, e.g. T-1, T-2, T-5]
  - Design ref: [Testing Strategy]

> **Test tasks** are dispatched to `spec-tester`, not `spec-implementer`, and run in parallel with the implementation groups **of the same phase** — put a test task in a later phase and the tester ends up writing against a finished implementation instead of against the contract, which is the coupling this whole arrangement exists to prevent. Every case ID in design.md's Test Cases table must be claimed by exactly one test task — none orphaned, none claimed twice — and no test task may cite an ID that isn't in the table.

---

## Phase 2: [Phase name]

- [ ] 1. [Task title]
  - ...
