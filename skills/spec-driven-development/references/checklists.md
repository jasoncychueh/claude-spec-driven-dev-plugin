# Checklists

This document contains all the checklists used throughout the spec-driven development workflow.

## Table of Contents

1. [Steering completeness check](#steering-completeness-check)
2. [Spec completeness check](#spec-completeness-check)
3. [Tasks vs Design alignment check](#tasks-vs-design-alignment-check)
4. [Steering sync check](#steering-sync-check)
5. [Design-change impact assessment](#design-change-impact-assessment)
6. [Design Review checklist](#design-review-checklist)
7. [Implementation Review checklist](#implementation-review-checklist)

---

## Steering completeness check

Before you start writing a feature spec, confirm the steering documents are complete.

### product.md

- [ ] Has a clear Product Purpose (the product's goal, the problem it solves)
- [ ] Defines Target Users (target users, pain points)
- [ ] Lists Key Features (core features, 1-3 primary features)
- [ ] Has Business Objectives
- [ ] Has **quantifiable** Success Metrics
- [ ] Defines Product Principles (product design principles)

### tech.md

- [ ] Defines Project Type
- [ ] All Core Technologies **note their versions**
- [ ] Has an Application Architecture description (with architecture diagram)
- [ ] Defines a Data Storage approach
- [ ] Lists External Integrations
- [ ] Describes the Development Environment
- [ ] Defines the Deployment method
- [ ] Records **the rationale for technical decisions** (Technical Decisions & Rationale)

### structure.md

- [ ] Has a complete Directory Organization (ASCII directory tree)
- [ ] Naming Conventions **presented in a table**
- [ ] Every naming rule has an **example**
- [ ] Defines Import Patterns
- [ ] Clearly defines Module Boundaries (module boundaries, dependency direction)
- [ ] Has Code Size Guidelines

### Consistency check

- [ ] The three documents **have no contradictions**
- [ ] tech.md's technology choices support product.md's functional requirements
- [ ] structure.md's organization matches tech.md's architectural patterns

---

## Spec completeness check

Before you start implementing, confirm the feature spec documents are complete.

### requirements.md

**Content completeness**:
- [ ] Has an Introduction (feature overview, the problem it solves)
- [ ] Describes Alignment with Product Vision
- [ ] Every requirement has a **User Story** (role, feature, value)
- [ ] Every requirement written or changed in this change has a **Main flow** from trigger to outcome (the path its E2E test walks). A requirement untouched since before the Main flow line existed stays valid without one; the next change that touches it adds it
- [ ] Every requirement has **verifiable Acceptance Criteria**
- [ ] Lists Non-Functional Requirements (performance, security, reliability)

**Responsibility boundary check** (ensure it does not cross into design.md):
- [ ] **Does not include** technical architecture choices (e.g. "use React", "adopt MVC")
- [ ] **Does not include** specific component/class design
- [ ] **Does not include** database schema or data model definitions
- [ ] **Does not include** algorithm implementation details
- [ ] **Does not include** code structure or file paths
- [ ] All content is described **from the user's perspective**

### design.md

**Content completeness**:
- [ ] Has an Overview (high-level design overview)
- [ ] Every Component has:
  - [ ] Purpose
  - [ ] Interfaces (public API)
  - [ ] Dependencies
- [ ] Defines the Data Models that cross a component boundary or persist (a feature with none says so in one line)
- [ ] Defines an Error Handling strategy
- [ ] Has a Testing Strategy containing a **Test Cases table**, every row carrying ID / Kind / Anchor / Behavior to verify, with Kind `e2e` or `integration` only (unit tests are derived from the interfaces, not listed). A table that still has the earlier `Level` column is valid as written until an `/update-spec` migrates it (`testing-guide.md` "Specs written before the three kinds"); the Kind and Anchor items here then do not apply to it
- [ ] Every `e2e` row's **Anchor** is a requirement whose user story it walks; every `integration` row's Anchor is an assumption about an external system, stated in one sentence. Never an internal function or private state
- [ ] Has **Test Approach** notes (harness, fixtures, what must not be mocked)

**Boundary-contract completeness** (enough for the implementer to build without guessing, without restating internals):
- [ ] Includes **API specifications** (endpoints, request/response formats)
- [ ] Includes the **public** signatures at component boundaries (parameters, return values)
- [ ] Includes the **processing flow where the flow is itself a decision** (ordering, keys, writers)

**Responsibility boundary check** (ensure it does not cross into requirements.md):
- [ ] **Does not repeat** the User Story description (only references the requirement number)
- [ ] **Does not redefine** business rules (only references requirements.md)
- [ ] **Does not include** business objectives or value statements
- [ ] All content is described **from the technical perspective**

### tasks.md

**Numbering format**:
- [ ] Tasks are grouped into **Phase sections** (e.g. `## Phase 1: Data Layer`)
- [ ] Within each Phase, tasks are numbered with a simple increment **starting from 1** (1 2 3 4 5), and **must not** carry any prefix, e.g. T1, P.1
- [ ] Phases are separated by `---`

**Content completeness**:

- [ ] **Every component** in design.md has a corresponding task
- [ ] Task order accounts for **dependency relationships** (depended-upon items come first)
- [ ] Every task has a `File:` set
- [ ] Every open (`[ ]` / `[~]`) task's title or outcome line names the component it delivers, by its design.md name. A component split over several tasks may name the public interface each one delivers instead. `[x]` and `[-]` tasks are records and are never retitled
- [ ] Every `After:` points to an earlier task in the same phase, and no test task carries one
- [ ] Includes **test tasks**, each listing the public interfaces it unit-tests (`Interfaces:`) and/or the case IDs it implements (`Cases:`), and writing only test files (test tasks are what `spec-tester` is dispatched on, so their `File:` sets must not overlap any implementation task's)
- [ ] Each task does only one thing (Single Responsibility)

### Design vs Requirements alignment check

**Requirement coverage**:
- [ ] **Every User Story** in requirements.md has a corresponding design component
- [ ] **Every Acceptance Criteria** in requirements.md can find a way to be realized in the design
- [ ] No design component is a feature **not mentioned** in requirements.md

**Non-functional requirement mapping**:
- [ ] The **performance requirements** in requirements.md are considered in design.md
- [ ] The **security requirements** in requirements.md have corresponding measures in design.md
- [ ] The **reliability requirements** in requirements.md have corresponding design in design.md

---

## Tasks vs Design alignment check

Run this when `/create-spec` / `/update-spec` completes, or during `/verify-spec` Stage 2 (dispatched alongside Stage 1; its result is used only if Stage 1 passes), to verify the alignment between tasks.md and design.md.

The items that check a task against design.md apply only to tasks still to be done (`[ ]` / `[~]`); `[x]` / `[-]` tasks are records of the change they belong to and are not checked against the current design.md. Those items are: §1 'No task references a component not defined in design.md'; both §2 items (file location, no file outside the location); the §4 'No task redefines a cross-boundary model differently from design.md's Data Models' item; §6 'No test task cites a case ID that isn't in the table'. Every other item applies to all tasks.

Coverage is still guaranteed. For open tasks it is judged through the component name each task's title or outcome line carries (the design.md name), instead of a per-task pointer. For `[x]` and `[-]` records it is judged as before, from title, description and `File:`.

### 1. Component coverage check

- [ ] **Every Component** in design.md has corresponding tasks. Open tasks are judged through the component name they carry; `[x]` and `[-]` tasks are judged as before from title, description and `File:`, and a component whose tasks are all `[x]` is not re-judged by name. In a new spec every task is open at verification time, so every component must be named by some task
- [ ] No task references a component **not defined** in design.md
- [ ] All Data Models have corresponding implementation tasks

### 2. Interface consistency check

- [ ] Each task's files sit under the `Code location` design.md gives, or are files design.md names
- [ ] No task modifies a file that is neither under design.md's `Code location` nor named in design.md

### 3. Dependency order check

- [ ] The order of the tasks matches the **dependency relationships** described in design.md
- [ ] Tasks for depended-upon components **come first**
- [ ] No circular dependencies
- [ ] Every `After:` points to an earlier task in the same phase
- [ ] No pending (`[ ]` / `[~]`) task's `After:` names a `[-]` task — the dependency is gone, so the task likely needs re-authoring (an `After:` naming a `[x]` task passes)
- [ ] **Advisory** — Foundation first (`design-principles.md`): the shared type, migration, or helper that several later tasks need comes before the tasks that use it. This item is Medium (waivable) and this check is a binary pass/fail gate for `/implement`, so a failure here is **reported with the suggested reorder and does not by itself fail the check or block `/implement`**; the main agent decides whether to dispatch `spec-author` to reorder tasks.md

### 4. Data model check

- [ ] No task redefines a cross-boundary model differently from design.md's **Data Models**
- [ ] No important data model implementation is missing

### 5. Error handling check

- [ ] The **Error Scenarios** in design.md all have corresponding implementation tasks

### 6. Test coverage check

- [ ] **Every public interface** in design.md's Components and Interfaces is named by exactly one test task's `Interfaces:`, and **every case ID** in the Test Cases table by exactly one test task's `Cases:` — none orphaned, none claimed twice. For a spec whose table still has the earlier `Level` column, only the case-ID half applies (`testing-guide.md` "Specs written before the three kinds")
- [ ] No test task names an interface or a case ID that design.md doesn't have
- [ ] Each test task sits in the **same phase as the implementation it covers** — a phase that implements something has test tasks in it, and no test task is deferred to a later phase (by then the code exists and the tester can no longer be kept blind to it)
- [ ] Test tasks write **only test files**, and their `File:` sets are **disjoint from every implementation task's** (the two are dispatched in parallel into one worktree; overlap is last-writer-wins)
- [ ] Every major component has a corresponding **test task**
- [ ] The levels in the table (behavior / interface / e2e) are all represented by tasks

---

## Steering sync check

During /create-spec and /update-spec, check whether the feature is consistent with steering.

### During /create-spec

- [ ] Whether the new feature's technology choices match the tech stack in tech.md
- [ ] Whether the new feature introduces new technology/frameworks not recorded in tech.md
- [ ] Whether the new feature's code organization matches the module boundaries in structure.md
- [ ] Whether the new feature supports the product vision and goals in product.md
- [ ] If there is any inconsistency, whether the steering documents need to be updated first

### During /update-spec

- [ ] Whether the design change affects the technical decisions in tech.md
- [ ] Whether the design change alters the module boundaries or naming conventions in structure.md
- [ ] If there is an impact, whether the steering documents have been synced accordingly

---

## Design-change impact assessment

When design.md is modified and implementation code already exists, handle it in two stages.

### Stage one: run during /update-spec

#### 1. Change-scope identification

- [ ] List the **added** components/interfaces/data models in design.md
- [ ] List the **modified** components/interfaces/data models in design.md
- [ ] List the **deleted** components/interfaces/data models in design.md
- [ ] Identify the **dependency impact** of the changes (which other components will be affected)

#### 2. Task status update

- [ ] Mark completed tasks whose named component or interface is "modified" as `[~]` (a task written without such a name is matched by its title and `File:` set; a record is not retitled to make it match)
- [ ] Mark tasks whose named component or interface is "deleted" as `[-]` (a task written without such a name is matched by its title and `File:` set; a record is not retitled to make it match)
- [ ] Create new tasks for "added" components
- [ ] Create or update tasks for the "modified" parts that need redoing
- [ ] Confirm the task order still matches the dependency relationships

#### 3. Display change summary

- [ ] Output the number of affected tasks (count of `[~]` and `[-]`)
- [ ] List the files to be modified/deleted (preview)
- [ ] Suggest the next step: run `/implement` to sync the implementation

---

### Stage two: run during /implement

> When tasks.md contains tasks in `[~]` or `[-]` status, `/implement` will handle these tasks.

#### 4. Implementation sync execution

- [ ] Execute `[-]` tasks: delete code that is no longer needed
- [ ] Execute `[~]` tasks: reimplement per the new design
- [ ] Execute `[ ]` tasks: implement the added features

#### 5. Verification and completion

- [ ] The `implementation-reviewer` agent reviews the implementation and directly fixes non-conforming items
- [ ] Confirm the build passes (build scope per `verification-scope.md`)
- [ ] After all `[~]` tasks are complete, change them to `[x]`
- [ ] All `[-]` task code has been cleaned up; the tasks are retained as a record
- [ ] tasks.md progress correctly reflects the current state

---

## Usage

### Running the Steering completeness check

```
Trigger: before /create-spec runs
Executed by: main Agent
Result: must pass entirely before continuing to create the spec
```

### Running the Spec completeness check

```
Trigger: when /create-spec completes, after /update-spec modifies requirements.md, /verify-spec Stage 1
Executed by: spec-verifier agent
Result: items that do not pass must be completed
```

### Running the Tasks vs Design alignment check

```
Trigger: when /create-spec or /update-spec completes, or /verify-spec Stage 2 (dispatched in the same message as Stage 1; used only if Stage 1 passes)
Executed by: tasks-design-verifier agent
Result: must pass before /implement can run; otherwise it displays the inconsistent items
```

### Running the Design-change impact assessment

```
Stage one trigger: /update-spec modifies design.md and implementation code already exists
Executed by: main Agent
Result: tasks.md status updated ([~] / [-] / new tasks)

Stage two trigger: /implement and tasks.md contains [~] or [-] tasks
Executed by: main Agent + Subagents
Result: code synced, all task statuses correct
```

---

## Design Review checklist

Used when the `design-reviewer` agent reviews design.md (Spec Mode) or the plan file (Quick Fix Mode). Each round's review must cover issues per the categories below. **This checklist is not a format check (that is spec-verifier's job); it is a design-quality check.**

> **Build a use-case model before applying it** (see `review-protocol.md`, "Review method"): first inventory the real use cases + the relevant data structures + the execution flows, then cross-check against the facets below. For every issue you want to open, first ask "**which real use case would hit this?**" — for a path that is theoretically reachable but has no scenario driving it and you cannot answer that, **do not require defensive handling; use fail-fast + error log instead** (this is "don't over-engineer", not ignoring robustness; failure paths with a real scenario still get robust handling as usual).

### 1. Hidden Assumptions

- [ ] Does it assume "the user is always logged in / the network is always up / the DB is always writable"?
- [ ] Does it assume "events always arrive in order / are always delivered exactly once"?
- [ ] Does it assume "some field is always unique / some ID never changes"?
- [ ] Does it assume "the parent always exists first / upstream and downstream meet their SLA"?
- [ ] Does it assume "a retry always succeeds"?

### 2. Failure Modes

- [ ] Is handling defined for partial failure (half the writes succeed)?
- [ ] Retry / rerun paths and concurrent writers: Idempotent under retry and rerun, One writer (§9)
- [ ] Are cascading-failure paths contained?
- [ ] Is there an upper bound on resource exhaustion (connection pool / FD / memory)?
- [ ] Are timeouts defined?
- [ ] Is backpressure defined?

### 3. Scalability & Observability

- [ ] Does the design still work under 10x / 100x traffic?
- [ ] Is there an N+1 query / unbounded list / full-table scan?
- [ ] Could a bottleneck become a single point of failure?
- [ ] How do you debug when something goes wrong? Are log / metric / trace provisioned for?

### 4. Component Boundaries & Data Models

- [ ] Are component responsibilities clear, with no "half the logic here, half there"?
- [ ] Do the data models express their invariants: Data shape first (§9)?
- [ ] Are there "fields that should be separate merged together" or "fields that should be merged split apart"?
- [ ] Is the interface contract complete? Is returning None vs an empty list clearly defined?
- [ ] **No restated internals** *(default Medium)*: the sections this cycle writes or edits don't restate what the code will hold (private helpers, internal field lists, signatures no boundary exposes); see the ❌ "Restated internals" row in `plan-content-guide.md`. Sections the cycle leaves alone are not graded. Applies to a Spec Mode design.md under Mode B review (`/create-spec`, or a substantive `/update-spec`); not to Quick Fix plan review
- [ ] **Shared internals are boundaries** *(default Medium)*: an internal used by more than one component or task group is treated as a boundary, either named in design.md or given its own task in tasks.md ahead of the tasks that use it. Applies to a Spec Mode design.md under Mode B review (`/create-spec`, or a substantive `/update-spec`); not to Quick Fix plan review
- [ ] **Boards agree with the docs**: when design.md has a `Visual design:` line, requirements.md and design.md agree with the boards on what the change alters (a screen, state or field on a board that no requirement or component accounts for, or the reverse)

### 5. Over / Under-Engineering

- [ ] **Over**: did it introduce an abstraction layer (factory / strategy / plugin system) for an imagined future requirement? (A structure that a triggered design principle requires is not over-engineering — `design-principles.md`, "How to apply these")
- [ ] **Over**: did it use a framework / pattern the team simply doesn't need?
- [ ] **Under**: is an extension that will obviously happen (multi-tenant / multilingual) considered?
- [ ] **Under**: is the monitoring / auth / audit necessary at the MVP stage planned?

### 6. Test Cases (the `## Testing Strategy` table in design.md)

The table lists only E2E and integration rows; unit tests are derived by `spec-tester` from the public interfaces. Each kind has a coverage rule that also caps it (`testing-guide.md`), so this section checks both directions: a missing row and a row that should not exist.

**Anchor legality** (an illegal anchor is the seed of a test that dies at the first refactor — usually High):
- [ ] Is every `e2e` row anchored to a requirement that **exists in requirements.md**, and every `integration` row to an external-system assumption the design actually relies on?
- [ ] Is no row anchored to an internal function, private state, or a description of how the code works?

**Coverage, forward** (usually High — a use case with no E2E row ships with its flow unverified):
- [ ] Does every requirement's user story have an `e2e` row?
- [ ] Does every assumption the design makes about an external system (a runtime, an API, a database, a file format) have an `integration` row?
- [ ] Does every component's public interface state its normal result and its error behaviors precisely enough for `spec-tester` to derive unit tests blind? An interface whose errors are not stated cannot be tested for them; that is a gap in the interface, not in the table
- [ ] Does the Test Approach name the public interfaces bound to an external system (their tests are integration tests), and does each bound interface say which of its errors the system produces and which its own code decides (those stay offline unit tests)?

**Coverage, backward and excess** (Medium — excess is a defect too: every extra row is a slow test that has to be written, run and maintained):
- [ ] Does every row's anchor still exist — no row citing a removed requirement or a dropped assumption?
- [ ] Is there **no** row that should be a unit test — a rule an acceptance criterion states, a single interface's contract, an error reason? Those belong to the interface's unit tests
- [ ] Is there at most one `e2e` row per user story, beyond one justified extra for an acceptance criterion that cannot be observed without the whole flow? Is there one `integration` row per assumption, not one per error reason or per fault?
- [ ] A "missing case" finding names the risk: the use case or external assumption left unverified. "The design describes a behavior that has no row" is not by itself a finding, since that behavior is covered by its interface's unit tests

**Requirement fidelity** (usually High — the design and the table share one author, so a misread requirement is implemented *and* verified, and ships certified wrong; no other check here catches it):
- [ ] For each `e2e` row, read the **requirement's own text** and confirm the row walks *that* use case, not the design's interpretation of it. The probe: **would this row still be correct if the design were thrown away and rebuilt differently?** If not, it is pinned to the design rather than to the requirement
- [ ] Does any row quietly narrow or widen its requirement — e.g. requirement "an expired claim is released automatically" vs row "the claim is released when the session ends" (both observable, only one is what was asked for)?

**Behavior, not mechanism** (usually High — rot is born in this column):
- [ ] Does the "Behavior to verify" column state an **observable outcome** ("the saved document reopens with every mate intact") rather than a structural assertion ("save calls flush before close")?
- [ ] Does the table avoid prescribing **technique** (mock this, patch that)? Prescribing *how* re-introduces implementation coupling from above

**Live runtime** (Medium):
- [ ] Does the Test Approach name the runtime the integration and E2E rows need, and whether it is available during implementation? When they share a live fixture, does it name the smoke test that validates the fixture first?

**Testability as a design property** (open against the design, not the table):
- [ ] Can every requirement actually be verified under this design — is there an injection point, observable state, or clock control where the case needs one? A requirement that cannot be tested without a structural change is a design Bug/Smell, and an Architecture Decision when the fix is a real trade-off

### 7. Steering Alignment (alignment with the steering documents, if steering exists)

- [ ] Does the design violate the technology choices, architectural patterns, or design philosophy recorded in tech.md?
- [ ] Does it violate the conventions recorded in tech.md (error handling style / dependency injection / logging, etc.)?
- [ ] Does it violate the module boundaries, dependency direction, or naming conventions in structure.md?
- [ ] Does it introduce a new technology / framework / pattern not recorded in steering?
- [ ] Does the design establish a core principle that **runs through the whole project and, if not recorded into steering, would almost certainly cause future inconsistency**? (→ list it as a Steering Candidate, not an issue; **default to not promoting** — spec-specific / detail / one-off decisions / project memory are all excluded; see review-protocol.md, "Steering Candidates")
- [ ] Is it a **decision** rather than **operating knowledge**? Probe: **can the rule be explained without recounting an incident?** If the justification is "we hit this repeatedly", it belongs in CLAUDE.md however broadly it applies → tag the entry `[claude-md]`, not `[steering]`. Steering is not an operations manual
- [ ] Does every Steering Candidate carry a `[steering]` or `[claude-md]` tag?

**Judgment discipline**: violating an existing steering clause → issue (usually High — it is the project's explicit rule); conflicting with steering but the steering may be outdated → Architecture Decision (the user decides whether to change the design or update steering); not written in steering yet this design establishes a core principle that **clears the high bar** → Steering Candidate (default to not promoting; the bar and exclusions are in review-protocol.md).

### 8. Architecture Decisions (must escalate to the user)

For every choice where "both paths are valid, each with its own trade-off":

- [ ] Is it marked as an Architecture Decision, listing Option 1 / Option 2 / ... + each one's trade-off?
- [ ] Does it explain "why there is no industry consensus"?
- [ ] Does the main agent route it through the advisor gate — the advisor resolves the clear-cut technical ones (recorded `advisor-resolved`, surfaced at the briefing), genuine preference / product / irreversible calls go to the user via AskUserQuestion (`advisor-gate-guide.md`)?

### 9. Design Principles

The rules, probes and default severities live in `design-principles.md` — **the single source; not restated here**.

- [ ] For each principle whose Stage is `design` or `both` (Foundation first only for a Quick Fix plan's change list — Spec Mode's tasks.md is checked under "Tasks vs Design alignment" §3): does a real scenario reach it, and if so, does the design satisfy it? Judge what the change adds or modifies
- [ ] When the change extends existing structure and a redesign option was in view, does the plan / the component text state the reason in a sentence (Don't bolt on)?

---

## Implementation Review checklist

Used by the `implementation-reviewer` agent during the multi-round review loop in `/implement` Stage 2 (or after implementation in Quick Fix Mode). Each round's review must cover issues per the categories below.

> **Build a use-case model before applying it** (see `review-protocol.md`, "Review method"): first inventory the real use cases the code serves + the data structures + the execution flows, then cross-check. For every issue you want to open, first ask "**which real use case would hit this?**" — a path that is theoretically reachable but has no scenario driving it does not require defensive handling; use fail-fast + error log instead (this is the basis above §3 "over-defensiveness"; it is not ignoring robustness).

### 1. Cross-agent integration (integration conflicts from Stage 1 parallel implementation)

> Parallel groups are Stage 1's default shape, so this section applies to most runs — skip it only when the main agent states that a single group ran. The group seams (where one group's output is another's input) are where these defects concentrate.

- [ ] Are the interfaces defined by the parallel agents consistent with their callers?
- [ ] Are cross-component data structures / naming consistent?
- [ ] Are the import / dependency paths correct?
- [ ] Did the two agents each write the same logic (a shared utility was not extracted)?

### 2. Bugs (execution-logic errors)

- [ ] **Async race**: do two coroutines modify shared state at the same time?
- [ ] **Weak-ref GC**: `asyncio.create_task()` did not store a strong reference — will the task be GC'd?
- [ ] **Event loop**: was the deprecated `get_event_loop()` used, or a cross-loop operation?
- [ ] **Idempotency**: Idempotent under retry and rerun (§8) on every retry / rerun path the code serves
- [ ] **Resource leak**: are connection / FD / subscription / listener cleaned up?
- [ ] **Boundary**: first-sync has no limit, a boundary condition forgotten?
- [ ] **Silent failure**: does try/except swallow the error, does a fallback mask the real problem?
- [ ] **Concurrent modification**: is a dict / list modified while being iterated?

### 3. Smells (design taste and technical debt)

- [ ] Should two classes / dicts with nearly identical structure be merged?
- [ ] Stale docstrings (missed during a refactor)?
- [ ] Callback not unregistered, listeners accumulating?
- [ ] Should a magic number / string be named as a constant?
- [ ] Over-defensiveness (adding defensive logic for cases that "won't happen")?
- [ ] A defensive fallback string (`x or "unknown"`) — could it silently drop something?

### 4. Design Fidelity (consistency with design.md — the behavior-depth version)

- [ ] Fidelity is judged at the contract as SKILL.md "Docs for Agents, Code as Truth" defines it (boundaries, specified behavior, Test Approach seams, shared internals, stated decisions): a deviation there is a defect, and a departure from the design's description of unshared internals is not. An approach `spec-author` settled for an escalated issue, and a Quick Fix plan's stated root-cause mechanism, are checked as written, internals included
- [ ] Are the aggregate invariants (I1, I2, ...) upheld on all write paths?
- [ ] Does the interface contract behavior match the description in design.md (not just the signature)?
- [ ] Are responsibility boundaries not quietly broken (something service A should do is not quietly done by B)?
- [ ] Where design.md has an Architecture section, are the component relationships consistent with it?
- [ ] **Boards match the altered elements**: when design.md has a `Visual design:` line, the elements the change alters (per requirements.md and the change's tasks) match the boards in layout, copy and states; elements the change does not alter are judged against the shipped code, not the boards

### 5. Test Completeness

**Against what specified the tests** — **Spec Mode**: the public interfaces (unit tests) and design.md's Test Cases table (E2E and integration rows), already reviewed at design time, so here you check the tests honor them; kinds and bounds in `testing-guide.md`. **Quick Fix Mode**: the plan file's change list; there is no case table, so read "case" as "the test the plan named":
- [ ] Does every public interface a test task names have unit tests for its normal result and each error behavior the design states for it? For an interface the Test Approach names as bound to an external system: integration tests of its normal result and the errors the system produces, against the real system, with the errors its own code decides tested offline
- [ ] Is every assigned case ID implemented by a test that actually verifies the stated behavior — not a test that shares its name and asserts something weaker?
- [ ] Does the test suite contain **no test that asserts internal structure** — private attributes, call order, a private helper's existence, a private method tested directly? Such a test is a **Smell** even when it passes: it will break at the next refactor and cost time to repair for no protection in return
- [ ] Can every test in the changed suite be traced to a public interface or a case-table row? A test that cannot is an internals assertion or an invented live test (Smell)
- [ ] **No excess** (Medium): no integration or E2E test beyond the table's rows and the bound interfaces' normal results and system-produced errors, no error our own code decides tested against the live system instead of offline, no behavior tested at a costlier kind than it needs, no near-duplicate tests of one behavior. A missing-test finding names the behavior and the risk it leaves unverified

**Test quality**:
- [ ] Do the added callbacks / events / paths have tests?
- [ ] Are the edge cases an interface's contract names (empty / duplicate / out-of-order / concurrent) covered by its unit tests?
- [ ] Are the stated failure paths tested, not just the happy path?
- [ ] Are the mocks reasonable? Not so much mocking that it is effectively meaningless — in particular, is the seam the case is *about* left unmocked?
- [ ] Are the tests deterministic (no race / sleep-based flakiness)?
- [ ] Is every test-support seam the change adds (a fault-injection hook, a debug-only switch, a test double) used by some test? One that nothing runs is dead code (Smell)
- [ ] Does any test pass for the wrong reason — an assertion so weak it would hold against a broken implementation, or one that was softened to reach green?

### 6. Steering Alignment (alignment with the steering documents, if steering exists)

- [ ] Does the code organization / naming / import conform to structure.md?
- [ ] Does the implementation follow the conventions recorded in tech.md (error handling style / async patterns / logging / how tests are written)?
- [ ] Does it introduce a new dependency / technology not recorded in tech.md?
- [ ] Does the implementation establish a core convention that **runs through the whole project and, if not recorded into steering, would almost certainly cause future inconsistency**? (→ list it as a Steering Candidate, not an issue; **default to not promoting** — choices that relate only to this implementation / details / project memory are all excluded; see review-protocol.md, "Steering Candidates")
- [ ] Is it a **decision** rather than **operating knowledge**? Probe: **can the rule be explained without recounting an incident?** A trap hit repeatedly during this cycle passes every breadth test and is still CLAUDE.md material → tag it `[claude-md]`. This is the most common misfiling at the implementation stage
- [ ] Does every Steering Candidate carry a `[steering]` or `[claude-md]` tag?

**Judgment discipline**: same as Design Review §7 (Steering Alignment) — violating an existing clause → issue (usually High); conflicting but steering may be outdated → Architecture Decision; not recorded, and a core principle that clears the high bar → Steering Candidate (default to not promoting).

### 7. Architecture Decisions (must escalate to the user)

For every implementation choice where "both paths are valid, each with its own trade-off":

- [ ] Is it marked as an Architecture Decision, listing Option 1 / Option 2 / ... + each one's trade-off?
- [ ] Does it explain "why there is no industry consensus"?
- [ ] Does the main agent route it through the advisor gate — the advisor resolves the clear-cut technical ones (recorded `advisor-resolved`, surfaced at the briefing), genuine preference / product / irreversible calls go to the user via AskUserQuestion (`advisor-gate-guide.md`)?

### 8. Design Principles (code stage)

The rules, their probes, and their default severities live in `design-principles.md` — **the single source; not restated here**.

- [ ] For each principle whose Stage is `code` or `both`: does a real scenario reach it, and if so, does the code honor it? Judge what the diff adds or modifies
- [ ] A violation faithful to the approved design basis (including an approved extension) is not a code issue: report it as a design-basis issue for the main agent to route (`spec-author` / Architecture Decision)
- [ ] Does any code comment invoke one of this plugin's principles by name as authority, or cite `design-principles.md`? That is review residue (a Smell): the comment states the reason, not the citation. Judge by what the comment does — the same words as ordinary prose ("fix the cause in the parser") and external principles are not residue

### Severity grading and convergence rules

Treat `review-protocol.md` as the **single source** (the four-level severity definitions, Medium/Low defer-and-batch, the convergence fuse); this is not relisted here — two lists would inevitably drift.
