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

> **What each field is for.** `File:` decides parallel grouping and what the tester must not read. Phases and `After:` decide order: `After:` lists only **earlier** task numbers **in the same phase**, so a cycle cannot be written, and only when the task depends on what another task in the phase writes while their `File:` sets are disjoint (with overlapping sets they are grouped together anyway, and list order sets the order inside a group). Test tasks never carry `After:`: they run in parallel, blind to the code. `Interfaces:` and `Cases:` assign what each test task covers. The contract is read from design.md and the approach is the implementer's, so a task carries no steps and does not restate the design.

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
  - Interfaces: [the public interfaces this task tests, by their design.md names, e.g. SyncQueue.push, SyncQueue.drain; an interface the Test Approach names as bound to an external system gets integration tests, the rest unit tests]
  - Cases: [the E2E and integration case IDs from design.md's Test Cases table this task implements, e.g. T-1, T-2]

> **Test tasks** are dispatched to `spec-tester`, not `spec-implementer`, and run in parallel with the implementation groups **of the same phase**. A test task in a later phase has the tester writing against a finished implementation instead of against the contract, which is the coupling this arrangement exists to prevent. A test task carries `Interfaces:` (unit tests, whose cases the tester derives from each interface's contract), `Cases:` (E2E and integration rows), or both. Every public interface in design.md's Components and Interfaces is named by exactly one test task's `Interfaces:`, and every case ID in the Test Cases table by exactly one test task's `Cases:`: none orphaned, none claimed twice, none that design.md doesn't have. When a phase has integration or E2E tests on a shared live fixture and the runtime is available, its test task builds the fixture and one smoke test first (`references/testing-guide.md`).

---

## Phase 2: [Phase name]

- [ ] 1. [Task title]
  - ...
