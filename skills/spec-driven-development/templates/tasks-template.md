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

---

## Phase 2: [Phase name]

- [ ] 1. [Task title]
  - ...
