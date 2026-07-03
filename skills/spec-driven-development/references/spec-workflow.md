# Feature Spec Authoring Guide

Before implementing any feature, three spec documents must be completed: requirements, design, and tasks.

## The Three Documents

| Order | Document | Purpose | Template |
|------|------|------|------|
| 1 | `requirements.md` | Defines what to build (What) | `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/requirements-template.md` |
| 2 | `design.md` | Defines how to build it (How) | `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/design-template.md` |
| 3 | `tasks.md` | Breaks it down into executable tasks | `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/tasks-template.md` |

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
| API specs and function signatures | Quantifiable business metrics |
| Error handling strategy | |
| Algorithms and processing flows | |
| Testing strategy | |

### Decision Principle

```
❓ Does this content involve technology selection, code structure, or implementation details?
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
    │           ├── Architecture Decision → AskUserQuestion, handed to the user
    │           ├── Bugs/Smells → resume spec-author (Mode 2) to fix the plan file
    │           ├── Steering Candidate (if the project has steering) → accumulate for batch handling
    │           └── Exit only when the round reaches 0 issues
    │
    ├── Plan Briefing (turn-final message → end the turn; proceed only after the user replies with no objection)
    │
    ├── ExitPlanMode (submit the reviewed version for the user to approve)
    │
    ├── Main agent implements directly (per the plan file content)
    │     ↳ Note: Quick Fix Mode allows the main agent to write code directly (unlike Spec Mode)
    │
    └── implementation-reviewer multi-round review loop (mandatory; one persistent reviewer session)
          ├── Reviewer produces an issue list
          ├── Challenge exchange → final post-challenge list is the round's record
          ├── Architecture Decision → AskUserQuestion, handed to the user
          ├── Bugs/Smells → main agent fixes the code itself
          └── Exit only when the round reaches 0 issues
```

---

### Spec Mode Flow

```
[/create-spec]
    │
    ├── Load steering
    ├── Plan Mode
    │     ├── spec-researcher (background research)
    │     ├── Main agent discusses with the user → distills a brief → spec-author (Mode 1) drafts the plan file
    │     └── (optional) design-reviewer Mode A — conversational partner challenging the design draft
    │         (the sparring session continues into Mode B below — same session)
    │
    ├── spec-author (same session) writes requirements.md + design.md (draft) + review-log.md skeleton
    ├── Main agent reads them in full once → fidelity challenge vs the brief + plan
    │
    ├── design-reviewer Mode B multi-round review loop (mandatory; one persistent reviewer session)
    │     ├── Reviewer produces an issue list (Bugs / Smells / Decisions / Steering Candidates)
    │     ├── Challenge exchange → final post-challenge list is the round's record
    │     ├── Architecture Decision → main agent uses AskUserQuestion to hand it to the user to resolve
    │     ├── Bugs/Smells → resume spec-author (Mode 2) to fix design.md (Medium/Low defer-and-batch)
    │     ├── Steering Candidate → accumulate, hand to user in batch (Steering Evolution Mechanism)
    │     └── Exit only when the round reaches 0 issues (still new Critical/High at Round 5 → convergence fuse
    │         → one fresh-eyes reviewer round before reporting)
    │
    ├── spec-author (same session) writes tasks.md
    ├── spec-verifier (Stage 1: completeness)
    ├── tasks-design-verifier (Stage 2: alignment)
    └── Spec Briefing (turn-final message with key points + resolved Decisions / Waivers → end the turn, wait for the user's reply)


[/implement]
    │
    ├── (If this session hasn't briefed yet → condensed briefing as the turn-final message; enter Stage 1 only after the user confirms)
    ├── Stage 1: spec-implementer (Mode 1) writes the initial version in parallel / sequentially + self-verify + build
    │
    ├── Stage 2: implementation-reviewer multi-round review loop (mandatory; one persistent reviewer session)
    │     ├── Reviewer produces an issue list (integration/Bugs/Smells/Fidelity/Tests/Steering/Decisions)
    │     ├── Challenge exchange → final post-challenge list is the round's record
    │     ├── Architecture Decision → main agent uses AskUserQuestion to hand it to the user to resolve
    │     ├── Bugs/Smells → spec-implementer (Mode 2), preferring to resume the owning group's session (Medium/Low defer-and-batch)
    │     ├── Steering Candidate → accumulate, hand to user in batch (Steering Evolution Mechanism)
    │     └── Exit only when the round reaches 0 issues (still new Critical/High at Round 5 → convergence fuse
    │         → one fresh-eyes reviewer round before reporting)
    │
    └── Stage 3: Summary
```

The two modes differ only in "the document layer (plan file vs steering+spec docs)" and "who writes the code (main agent vs spec-implementer)" — document authoring (`spec-author`) and the review loop mechanism are fully shared (the same `review-protocol.md`, including persistent sessions and the challenge exchange).

---

### 1. requirements.md - Requirements Document

**MANDATORY**: Use the Read tool to read the full content of `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/requirements-template.md`.

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

**MANDATORY**: Use the Read tool to read the full content of `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/design-template.md`.

Content to define:
- Overview - high-level design overview
- Steering Document Alignment - following tech.md and structure.md
- Code Reuse Analysis - reusable existing components
- Architecture - architecture diagram (Mermaid)
- Components and Interfaces - component design, public API
- Data Models - data structure definitions
- Error Handling - error handling strategy
- Testing Strategy - test plan

**Authoring points**:
- The architecture diagram clearly expresses component relationships
- Each component has Purpose, Interfaces, Dependencies
- Identify reusable existing code
- Ensure conformance to the technology selection in `steering/tech.md`
- Ensure conformance to the naming conventions in `steering/structure.md`
- **Include all implementation details**: API specs, function signatures, algorithm flows
- **Do not repeat** the User Stories from requirements.md, just reference the requirement numbers
- Focus on "how the system realizes it" rather than "what the user can do"

---

### 3. tasks.md - Task List

**MANDATORY**: Use the Read tool to read the full content of `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/tasks-template.md`.

Content to define:
- Break the design down into executable tasks
- Each task corresponds to one deliverable unit
- Arrange them in dependency order

#### Task Format

```markdown
- [ ] {number}. {task title}
  - File: {file path}
  - {task description}
  - Purpose: {the purpose of this task}
  - Design ref: {the corresponding section/component in design.md}
  - _Leverage: {reusable existing code}_
  - _Requirements: {corresponding requirement numbers}_
```

**Authoring points**:
- Each task does only one thing (Single Responsibility)
- Task size is moderate (completable in 0.5-2 days)
- Tasks that are depended upon come first
- Each task can be tested independently once complete
- Design ref clearly points to the corresponding section in design.md; implementation details are read directly from design.md by the agent

---

## Core Principle: Design as Single Source of Truth

design.md is the single source of truth for implementation. tasks.md is responsible for defining "what to do" and "the order of doing it"; the concrete "how to do it" is read directly by the agent from the corresponding section in design.md.

This means:
- tasks.md does not need to repeat the implementation details in design.md
- The `Design ref` field establishes a clear correspondence between tasks and the design
- When design.md is updated, the implementation approach of the corresponding tasks automatically follows

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
