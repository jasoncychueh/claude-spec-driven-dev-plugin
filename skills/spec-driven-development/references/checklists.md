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
- [ ] Describes Steering Document Alignment
- [ ] Has a Code Reuse Analysis (reusable existing components)
- [ ] Has an Architecture diagram (Mermaid)
- [ ] Every Component has:
  - [ ] Purpose
  - [ ] Interfaces (public API)
  - [ ] Dependencies
- [ ] Defines Data Models (data structures)
- [ ] Defines an Error Handling strategy
- [ ] Has a Testing Strategy

**Implementation-detail completeness** (ensure it contains enough technical information):
- [ ] Includes **API specifications** (endpoints, request/response formats)
- [ ] Includes **the main function signatures** (parameters, return values)
- [ ] Includes a description of **the algorithm or processing flow**
- [ ] Includes a plan for **the file structure**

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
- [ ] Every task has a **Design ref** field (pointing to the corresponding section in design.md)
- [ ] Includes **test tasks**
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

Run this when `/create-spec` / `/update-spec` completes, or during `/verify-spec` Stage 2 (after Stage 1 passes), to verify the alignment between tasks.md and design.md.

### 1. Component coverage check

- [ ] **Every Component** in design.md has corresponding tasks
- [ ] No task references a component **not defined** in design.md
- [ ] All Data Models have corresponding implementation tasks

### 2. Interface consistency check

- [ ] The **file paths** in the tasks match the Components defined in design.md
- [ ] The **Purpose** in the tasks is consistent with the Component Purpose in design.md
- [ ] The **Design ref** in the tasks correctly points to the corresponding section in design.md
- [ ] No task modifies a file not mentioned in design.md

### 3. Dependency order check

- [ ] The order of the tasks matches the **dependency relationships** described in design.md
- [ ] Tasks for depended-upon components **come first**
- [ ] No circular dependencies

### 4. Data model check

- [ ] The data structures involved in the tasks are consistent with the **Data Models** in design.md
- [ ] Field names and types all match the design
- [ ] No important data model implementation is missing

### 5. Error handling check

- [ ] The **Error Scenarios** in design.md all have corresponding implementation tasks
- [ ] The error handling strategy is mentioned in the relevant tasks

### 6. Test coverage check

- [ ] Every major component has a corresponding **test task**
- [ ] The **Testing Strategy** in design.md is covered by tasks
- [ ] Includes tasks for unit tests and integration tests

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

- [ ] Mark completed tasks affected by "modified" as `[~]`
- [ ] Mark tasks related to "deleted" as `[-]`
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
- [ ] Confirm the build passes
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
Trigger: when /create-spec or /update-spec completes, or /verify-spec Stage 2 (after Stage 1 passes)
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
- [ ] Is concurrent modification (two actors changing it at once) handled?
- [ ] Is idempotency guaranteed? Will a retry not cause duplication?
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
- [ ] Do the data models express invariants (NOT NULL / FK / unique constraint)?
- [ ] Are there "fields that should be separate merged together" or "fields that should be merged split apart"?
- [ ] Is the interface contract complete? Is returning None vs an empty list clearly defined?

### 5. Over / Under-Engineering

- [ ] **Over**: did it introduce an abstraction layer (factory / strategy / plugin system) for an imagined future requirement?
- [ ] **Over**: did it use a framework / pattern the team simply doesn't need?
- [ ] **Under**: is an extension that will obviously happen (multi-tenant / multilingual) considered?
- [ ] **Under**: is the monitoring / auth / audit necessary at the MVP stage planned?

### 6. Steering Alignment (alignment with the steering documents, if steering exists)

- [ ] Does the design violate the technology choices, architectural patterns, or design philosophy recorded in tech.md?
- [ ] Does it violate the conventions recorded in tech.md (error handling style / dependency injection / logging, etc.)?
- [ ] Does it violate the module boundaries, dependency direction, or naming conventions in structure.md?
- [ ] Does it introduce a new technology / framework / pattern not recorded in steering?
- [ ] Does the design establish a core principle that **runs through the whole project and, if not recorded into steering, would almost certainly cause future inconsistency**? (→ list it as a Steering Candidate, not an issue; **default to not promoting** — spec-specific / detail / one-off decisions / project memory are all excluded; see review-protocol.md, "Steering Candidates")

**Judgment discipline**: violating an existing steering clause → issue (usually High — it is the project's explicit rule); conflicting with steering but the steering may be outdated → Architecture Decision (the user decides whether to change the design or update steering); not written in steering yet this design establishes a core principle that **clears the high bar** → Steering Candidate (default to not promoting; the bar and exclusions are in review-protocol.md).

### 7. Architecture Decisions (must escalate to the user)

For every choice where "both paths are valid, each with its own trade-off":

- [ ] Is it marked as an Architecture Decision, listing Option 1 / Option 2 / ... + each one's trade-off?
- [ ] Does it explain "why there is no industry consensus"?
- [ ] Does the main agent use AskUserQuestion to hand the choice to the user to resolve?

---

## Implementation Review checklist

Used by the `implementation-reviewer` agent during the multi-round review loop in `/implement` Stage 2 (or after implementation in Quick Fix Mode). Each round's review must cover issues per the categories below.

> **Build a use-case model before applying it** (see `review-protocol.md`, "Review method"): first inventory the real use cases the code serves + the data structures + the execution flows, then cross-check. For every issue you want to open, first ask "**which real use case would hit this?**" — a path that is theoretically reachable but has no scenario driving it does not require defensive handling; use fail-fast + error log instead (this is the basis above §3 "over-defensiveness"; it is not ignoring robustness).

### 1. Cross-agent integration (integration conflicts from Stage 1 parallel implementation)

- [ ] Are the interfaces defined by the parallel agents consistent with their callers?
- [ ] Are cross-component data structures / naming consistent?
- [ ] Are the import / dependency paths correct?
- [ ] Did the two agents each write the same logic (a shared utility was not extracted)?

### 2. Bugs (execution-logic errors)

- [ ] **Async race**: do two coroutines modify shared state at the same time?
- [ ] **Weak-ref GC**: `asyncio.create_task()` did not store a strong reference — will the task be GC'd?
- [ ] **Event loop**: was the deprecated `get_event_loop()` used, or a cross-loop operation?
- [ ] **Idempotency**: will a retry cause a duplicate write? Is a duplicate event deduped?
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

- [ ] Are the aggregate invariants (I1, I2, ...) upheld on all write paths?
- [ ] Does the interface contract behavior match the description in design.md (not just the signature)?
- [ ] Are responsibility boundaries not quietly broken (something service A should do is not quietly done by B)?
- [ ] Is the architecture consistent with the architecture diagram in design.md?

### 5. Test Completeness

- [ ] Do the added callbacks / events / paths have tests?
- [ ] Are edge cases tested: empty / duplicate / out-of-order / concurrent?
- [ ] Are failure paths tested, not just the happy path?
- [ ] Are the mocks reasonable? Not so much mocking that it is effectively meaningless?
- [ ] Are the tests deterministic (no race / sleep-based flakiness)?

### 6. Steering Alignment (alignment with the steering documents, if steering exists)

- [ ] Does the code organization / naming / import conform to structure.md?
- [ ] Does the implementation follow the conventions recorded in tech.md (error handling style / async patterns / logging / how tests are written)?
- [ ] Does it introduce a new dependency / technology not recorded in tech.md?
- [ ] Does the implementation establish a core convention that **runs through the whole project and, if not recorded into steering, would almost certainly cause future inconsistency**? (→ list it as a Steering Candidate, not an issue; **default to not promoting** — choices that relate only to this implementation / details / project memory are all excluded; see review-protocol.md, "Steering Candidates")

**Judgment discipline**: same as Design Review §6 — violating an existing clause → issue (usually High); conflicting but steering may be outdated → Architecture Decision; not recorded, and a core principle that clears the high bar → Steering Candidate (default to not promoting).

### 7. Architecture Decisions (must escalate to the user)

For every implementation choice where "both paths are valid, each with its own trade-off":

- [ ] Is it marked as an Architecture Decision, listing Option 1 / Option 2 / ... + each one's trade-off?
- [ ] Does it explain "why there is no industry consensus"?
- [ ] Does the main agent use AskUserQuestion to hand the choice to the user to resolve?

### Severity grading and convergence rules

Treat `review-protocol.md` as the **single source** (the four-level severity definitions, Medium/Low defer-and-batch, the convergence fuse); this is not relisted here — two lists would inevitably drift.
