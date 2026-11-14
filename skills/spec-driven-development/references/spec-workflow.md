# Feature Spec Authoring Guide

Before implementing any feature, three spec documents must be completed: requirements, design, and tasks.

## The Three Documents

| Order | Document | Purpose | Template |
|------|------|------|------|
| 1 | `requirements.md` | Defines what to build (What) | `templates/requirements-template.md` |
| 2 | `design.md` | Defines how to build it (How) | `templates/design-template.md` |
| 3 | `tasks.md` | Breaks it down into executable tasks | `templates/tasks-template.md` |

---

## Separation of Document Responsibilities

**Strictly separate the content scope of requirements.md and design.md** to avoid responsibility confusion.

### requirements.md - Business Requirements Layer (What)

Focus on feature descriptions from the **user's perspective**, answering "what the system should do":

| Should include | Should not include |
|----------|------------|
| User Story (role, feature, value) | Technical architecture choices |
| Acceptance Criteria (verifiable behavior) | Specific component/class design |
| Business rules and logic | Database schema / data models |
| Non-functional requirements (performance metrics, security policies) | Algorithm implementation details |
| Feature scope (In Scope / Out of Scope) | Code structure, file paths |

### design.md - Technical Design Layer (How)

Focus on the implementation approach from the **technical perspective**, answering "how the system realizes it":

| Should include | Should not include |
|----------|------------|
| System architecture and component relationships | Repeating User Stories |
| Component design (Purpose, Interfaces, Dependencies) | Redefining business rules |
| Data models and Schema | Business goals and value |
| API specs and public signatures at component boundaries | Quantifiable business metrics |
| Error handling strategy | Internals below the component boundary (the code holds them) |
| Processing flow where the flow is itself a decision (ordering, keys, writers) | |
| Testing strategy | |

### Decision Principle

```
❓ Does this content involve technology selection, component boundaries, data that crosses a boundary, or a design decision?
   ├─ Yes → write it in design.md
   └─ No →
      ❓ Does this content describe user behavior, business rules, or feature expectations?
         ├─ Yes → write it in requirements.md
         └─ No → it probably doesn't need to be written
```

## Authoring Workflow

### Two Paths

This skill supports two development paths (see `mode-selection.md` for details); below is an overview of each flow.

---

### Quick Fix Mode Flow

```
[User requests a small change: bug fix / refactor / small extension]
    │
    ├── Main agent declares it's going Quick Fix Mode (gives the user a chance to adjust)
    │
    ├── EnterPlanMode
    │     │
    │     ├── Confirm the plan file's actual path (usually auto-created by Claude Code;
    │     │   if the environment doesn't provide one, spec-author creates ~/.claude/plans/<slug>.md —
    │     │   plan files never live inside the repo)
    │     ├── Main agent distills the discussion into a brief → dispatches spec-author (Mode 1)
    │     │   to write the plan draft (context / plan / risks / verification) at that path
    │     ├── Main agent reads the draft → fidelity challenge in the author session (drift vs the brief)
    │     │
    │     └── design-reviewer multi-round review loop (mandatory; one persistent reviewer session)
    │           ├── Main agent tells the reviewer the plan file path (Round 1; later rounds resume via SendMessage)
    │           ├── Reviewer uses Read to read the plan file, produces an issue list
    │           ├── Challenge exchange → final post-challenge list is the round's record
    │           ├── Architecture Decision → advisor gate (advisor settles clear-cut ones → review-log §2 advisor-resolved, confirmed at briefing; genuine user calls → AskUserQuestion)
    │           ├── Bugs/Smells → resume spec-author (Mode 2) to fix the plan file
    │           ├── Steering Candidate (if the project has steering) → accumulate for batch handling
    │           └── Exit only when the round reaches 0 issues
    │
    ├── Plan Briefing (turn-final message → end the turn; proceed only after the user replies with no objection)
    │
    ├── ExitPlanMode (submit the reviewed version for the user to approve)
    │
    ├── spec-implementer (Mode 1) implements per the plan file
    │     ↳ Main agent hands it the plan file path (the change list is its task list);
    │       the session stays resumable for the review loop's fixes
    │
    └── implementation-reviewer multi-round review loop (mandatory; one persistent reviewer session)
          ├── Reviewer produces an issue list
          ├── Challenge exchange → final post-challenge list is the round's record
          ├── Architecture Decision → advisor gate (advisor settles clear-cut ones → review-log §2 advisor-resolved, confirmed at briefing; genuine user calls → AskUserQuestion)
          ├── Bugs/Smells → triage by rung: mechanical → resume spec-implementer (Mode 2);
          │                  root-cause-unknown / multi-direction / contract-touching →
          │                  spec-author settles the approach into the plan first
          └── Exit only when the round reaches 0 issues
```

---

### Spec Mode Flow

```
[/create-spec]
    │
    ├── Load steering
    ├── Planning phase (an ordinary session — no Plan Mode, so roadmap writes, Artifacts and subagent writes all work)
    │     ├── spec-researcher (background research)
    │     ├── Main agent discusses with the user → distills a brief → spec-author (Mode 1) drafts the plan file
    │     │   (~/.claude/plans/<slug>.md): the direction and the rough framework design, not the detail
    │     ├── (optional) design-reviewer Mode A — conversational partner challenging the direction and the framework
    │     │   (one pass, resumed once if the direction changes; the sparring session continues into Mode B below — same session)
    │     └── Plan Briefing (turn-final message → end the turn) — approves the direction only
    │
    ├── spec-author (same session) writes requirements.md + design.md (draft) + review-log.md skeleton
    ├── Main agent reads them in full once → fidelity challenge vs the brief + plan
    │
    ├── design-reviewer Mode B multi-round review loop (mandatory; one persistent reviewer session)
    │     ├── Reviewer produces an issue list (Bugs / Smells / Decisions / Steering Candidates)
    │     ├── Challenge exchange → final post-challenge list is the round's record
    │     ├── Architecture Decision → advisor gate (advisor settles clear-cut ones → review-log §2 advisor-resolved, confirmed at briefing; genuine user calls → AskUserQuestion)
    │     ├── Bugs/Smells → resume spec-author (Mode 2) to fix design.md (Medium/Low defer-and-batch: fix / waive / backlog)
    │     ├── Steering Candidate → accumulate, hand to user in batch (Steering Evolution Mechanism, steering-guide.md)
    │     └── Exit only when the round reaches 0 issues (still new Critical/High at Round 5 → convergence fuse
    │         → one fresh-eyes reviewer round before reporting)
    │
    ├── spec-author (same session) writes tasks.md
    ├── spec-verifier (Stage 1: completeness) + tasks-design-verifier (Stage 2: alignment) — dispatched in the same message;
    │     if Stage 1 fails, report its failures and discard the Stage 2 result
    └── Spec Briefing (turn-final message with key points + resolved Decisions / Waivers → end the turn, wait for the user's reply;
        the confirmation is recorded with approve.mjs <feature> as the first action of the next turn)


[/implement]
    │
    ├── (If this session hasn't briefed yet → condensed briefing as the turn-final message; enter Stage 1 only after the user confirms, recorded with approve.mjs <feature>)
    ├── Stage 1: spec-implementer (Mode 1) writes the initial version — parallel groups by default (File:-disjoint within a phase, ≤4, one message) + self-verify + build of its own scope
    │            spec-tester (Mode 1) writes the tests in the SAME message — its own group, blind to the source files in flight,
    │            unit tests per assigned interface + one test per assigned case row; Mode 1 red is expected, never softened
    │            Stage 1 ends with the main agent's whole-solution build (code builds, tests compile) — no test run yet
    │
    ├── Stage 2: implementation-reviewer multi-round review loop (mandatory; one persistent reviewer session)
    │     ├── Reviewer produces an issue list (integration/Bugs/Smells/Fidelity/Tests/Steering/Decisions)
    │     ├── Challenge exchange → final post-challenge list is the round's record
    │     ├── Architecture Decision → advisor gate (advisor settles clear-cut ones → review-log §2 advisor-resolved, confirmed at briefing; genuine user calls → AskUserQuestion)
    │     ├── Bugs/Smells → triage by rung:
    │     │     ├── mechanical → spec-implementer (Mode 2), preferring the owning group's session
    │     │     ├── root-cause-unknown / multi-direction / contract-touching → spec-author settles the approach into design.md first,
    │     │     │   then the implementer implements it
    │     │     └── issues against the tests → spec-tester (Mode 2), never the implementer
    │     │     Fix items are grouped by owning session, then File:-disjointness; the groups are dispatched in the same message,
    │     │     each building only its own scope
    │     │     (Medium/Low defer-and-batch: fix / waive / backlog)
    │     ├── Steering Candidate → accumulate, hand to user in batch (Steering Evolution Mechanism, steering-guide.md)
    │     └── Exit only when the round reaches 0 issues (still new Critical/High at Round 5 → convergence fuse
    │         → one fresh-eyes reviewer round before reporting)
    │     Loop converged → main agent builds the whole solution (serially)
    │
    ├── Stage 3: Test run — only after the review loop converges
    │     ├── Main agent runs the affected tier (targeted first; E2E / live-host subset last, once) — the full suite only on a significant risk
    │     ├── Each failure: impl wrong → implementer / test wrong → tester / basis doesn't settle it → spec-author
    │     ├── Fix groups dispatched in the same message → build own scope → re-run only what failed, until green
    │     │   (a fix that changed the design goes back through review, and the post-convergence build runs again)
    │     └── Fix loop converged → whole-solution build, only if more than one fix group ran or a fix changed a public interface
    │
    └── Stage 4: Summary (incl. steering updates + new backlog items recorded this run)
```

The two modes differ only in **the document layer** (plan file vs steering+spec docs) — document authoring (`spec-author`), implementation (`spec-implementer`), and the review loop mechanism are fully shared (the same `review-protocol.md`, including persistent sessions and the challenge exchange).

---

### 1. requirements.md - Requirements Document

**MANDATORY**: Use the Read tool to read the full content of `templates/requirements-template.md`.

Content to define:
- Introduction - feature overview, the problem solved
- Alignment with Product Vision - how it supports the product vision
- Requirements - using User Story + Acceptance Criteria
- Non-Functional Requirements - performance, security, reliability

#### User Story Format

```
As a [role], I want [feature], so that [value]
```

#### Acceptance Criteria Format

```
WHEN [event] THEN [system] SHALL [behavior]
IF [precondition] THEN [system] SHALL [behavior]
WHEN [event] AND [condition] THEN [system] SHALL [behavior]
```

**Authoring points**:
- Every requirement has a clear User Story
- Acceptance Criteria must be verifiable
- **Forbidden** to describe technical implementation in requirements (architecture, components, data models)
- **Forbidden** to specify code structure or file paths
- Reference `steering/product.md` to ensure alignment with the product vision
- Focus on "what the user can do" rather than "how the system does it"

---

### 2. design.md - Design Document

**MANDATORY**: Use the Read tool to read the full content of `templates/design-template.md`.

Content to define:
- Overview - high-level design overview
- Steering Document Alignment - following tech.md and structure.md (*Optional — include only when it carries information the sections below don't.*)
- Code Reuse Analysis - reusable existing components (*Optional — include only when it carries information the sections below don't.*)
- Architecture - architecture diagram (Mermaid) (*Optional — include only when it carries information the sections below don't.*)
- Components and Interfaces - component design, public API
- Data Models - data structure definitions
- Error Handling - error handling strategy
- Testing Strategy - the **Test Cases table** (ID / Kind / Anchor / Behavior to verify: one `e2e` row per requirement's user story, one `integration` row per external-system assumption; unit tests are derived from the public interfaces and not listed) plus Test Approach notes. Kinds and bounds: `testing-guide.md`

**Authoring points**:
- When an Architecture section is included, it shows the component relationships
- Each component has Purpose, Interfaces, Dependencies
- Name reuse where it shapes a boundary
- Ensure conformance to the technology selection in `steering/tech.md`
- Ensure conformance to the naming conventions in `steering/structure.md`
- **Include the boundary contract**: API specs, public signatures at component boundaries, processing flow where the flow is itself a decision; don't restate internals the code will hold
- **Do not repeat** the User Stories from requirements.md, just reference the requirement numbers
- Focus on "how the system realizes it" rather than "what the user can do"

---

### 3. tasks.md - Task List

**MANDATORY**: Use the Read tool to read the full content of `templates/tasks-template.md`.

Content to define:
- Break the design down into executable tasks
- Each task corresponds to one deliverable unit
- Arrange them in dependency order

#### Task Format

```markdown
- [ ] {number}. {title naming the component or public interface delivered, by its design.md name}
  - File: {files the task writes}
  - {one line: the outcome, not the steps}
  - After: {earlier task numbers in the same phase — optional}
  - _Requirements: {corresponding requirement numbers — optional trace}_

- [ ] {number}. {test task title}
  - File: {test files only}
  - {one line: the outcome}
  - Interfaces: {public interfaces this task unit-tests}
  - Cases: {integration / e2e case IDs from design.md's Test Cases table}
```

**Authoring points**:
- Each task does only one thing (Single Responsibility)
- Task size is moderate (completable in 0.5-2 days)
- Tasks that are depended upon come first
- Each task can be tested independently once complete
- The title or outcome line names the component or public interface the task delivers, by its design.md name
- The description is one line stating the outcome, not steps
- `After:` only for a dependency across disjoint `File:` sets

---

## Core Principle: Design Is the Change's Contract

During a change, design.md is the contract for implementation. tasks.md says what to do, where (`File:`) and in what order; design.md holds the contract. The approach is the implementer's.

This means:
- tasks.md does not carry steps and does not repeat the design detail in design.md
- When design.md is updated, the contract the corresponding tasks read automatically follows
- design.md is written at the contract level (boundaries, decisions, behavior), and the approach below the contract is the implementer's; see SKILL.md "Docs for Agents, Code as Truth".

---

## Output Location

Completed documents are placed in:

```
.spec/specs/{feature-name}/
├── requirements.md
├── design.md
├── tasks.md
└── review-log.md
```
