---
name: spec-driven-development
description: "Disciplined development workflow with multi-round architecture review loops. MUST use for any task that writes or modifies code — bug fixes, refactors, config tweaks, new features, anything (sole exception: trivial pure-text edits like a README typo). Auto-routes: (a) Quick Fix Mode for bug fixes / refactors / small extensions — Plan Mode + mandatory review loops, no spec docs; (b) Spec Mode for new features / large refactors / cross-component work — full steering + requirements + design + tasks docs before implementation. Both modes run design-reviewer and implementation-reviewer loops until 0 issues — non-negotiable regardless of task size. Steering docs are living: review loops surface unrecorded project principles for user-confirmed promotion into steering. Triggers: fix bug / refactor / add feature / change behavior / modify config / create or edit spec / implement feature. Also use when asked about steering / requirements / design / tasks docs, /create-spec, /implement, /load-spec, /verify-spec."
---

# Spec-Driven Development

A development workflow with **two routing modes**, both backed by multi-round architecture review:

- **Quick Fix Mode**: bug fix / refactor / small extension — Plan Mode + review loops
- **Spec Mode**: new feature / large refactor / cross-component — full steering + spec docs + implementation

**Detailed mode-selection guidance**: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/mode-selection.md`

**Core discipline**: regardless of mode, the `design-reviewer` + `implementation-reviewer` multi-round loops are mandatory and run until 0 issues. Review discipline is the quality line of defense — **it does not bend for task size**.

## Quick Reference

### Route first (**do this before anything else**)

When the main agent receives any request to write / modify code, the first step is to decide which mode to take (see `mode-selection.md`):

| Signal | Mode |
|---|---|
| bug fix / refactor / small extension / typo / config change | **Quick Fix Mode** |
| new feature / large refactor / cross-component / introduces a new concept | **Spec Mode** |
| unsure | main agent decides first and tells the user; the user can adjust |

After deciding, **tell the user explicitly which route you're taking**, e.g.: "I'm planning to run this as a quick fix — scope is a single-component bug fix. Tell me if you'd rather go through the spec-level flow."

### Spec Mode commands

| Command | Description |
|------|------|
| `/load-spec <feature>` | Load spec, verify, then show progress |
| `/create-steering` | Create the three steering documents |
| `/create-spec <feature>` | Create the three spec documents for a feature |
| `/update-steering <type>` | Update steering (product/tech/structure) |
| `/update-spec <feature>` | Update a feature spec |
| `/verify-spec <feature>` | Verify spec completeness + tasks vs design alignment |
| `/implement <feature>` | Start implementation |

### Quick Fix Mode has no slash command

The main agent enters Plan Mode and runs the full flow directly — no slash command needed. Flow details are in the "Quick Fix Mode" operating-instructions section below.

---

## File Structure

### Steering Documents (project level)

```
.spec/steering/
├── product.md     # Product vision, target users, success metrics
├── tech.md        # Tech stack, architecture patterns, deployment
└── structure.md   # Directory layout, naming conventions, module boundaries
```

### Spec Documents (feature level)

```
.spec/specs/{feature}/
├── requirements.md  # User Story + Acceptance Criteria
├── design.md        # Architecture, components, data models (single source of truth for implementation)
├── tasks.md         # Executable task list
└── review-log.md    # Record of the review/resolve process (audit trail / decision / waiver / FP / steering updates)
```

> **The role of review-log.md**: the formal docs (r/d/t/code) describe "the world after decisions"; review-log.md describes "why it's this world, what was rejected along the way, which principles were deliberately waived." See the "Review Log Mechanism" section below and `references/review-log-guide.md`.

---

### Agents

This skill uses the agents defined in the plugin to carry out each phase.

| Agent | Purpose | Trigger | Action |
|-------|------|---------|------|
| `spec-researcher` | Search existing solutions, libraries, best practices | /create-spec planning phase | review only |
| `spec-verifier` | Verify spec file **completeness and format** (cookie-cutter check) | /verify-spec Stage 1, /create-spec | review only |
| `tasks-design-verifier` | Verify **alignment** between tasks.md and design.md | /verify-spec Stage 2, /create-spec, /update-spec | review only |
| `design-reviewer` | Review **design quality** from a senior engineer's perspective (multi-round to 0 issues) | /create-spec design phase; /update-spec when design changes; Quick Fix Mode reviewing the plan file | review only (produces issue list) |
| `spec-implementer` | Write / fix code + self-verify + build (two modes) | /implement Stage 1 (Mode 1) + taking a reviewer issue list (Mode 2) | **write / fix code** |
| `implementation-reviewer` | Review **implementation quality** from a senior engineer's perspective (multi-round to 0 issues) | /implement Stage 2; after Quick Fix Mode implementation | review only (produces issue list) |

---

## Workflow Decision Tree

```
User requests writing / modifying code
        ↓
Decide mode (per mode-selection.md)
        ↓
   ┌────┴─────┐
   ▼          ▼
Quick Fix    Spec Mode
Mode           ↓
   │      Steering exists?
   │       no  → /create-steering
   │       yes → /create-spec  (or /load-spec) → /implement
   ▼
Plan Mode + design-reviewer loop → ExitPlanMode →
main agent implements → implementation-reviewer loop
```

---

## Operating Instructions

### Quick Fix Mode (no slash command; main agent auto-routes)

When a task meets the Quick Fix Mode bar (see `mode-selection.md`) — bug fix / refactor / small extension / typo / config change — run the flow below, with **no need to create steering / requirements / design / tasks documents**:

**Upfront declaration**: after receiving the task, the main agent first tells the user: "I'm planning to run this as a quick fix, because {basis for the call}. Let me know if you need the spec-level flow."

**Steps**:

1. **EnterPlanMode** — confirm the actual path of this run's plan file (Claude Code usually creates it automatically; if the environment provides no plan file, create `.spec/quickfix/<slug>.md` instead). If the project already has `.spec/steering/`, load it too — the reviewer will do a steering alignment check, and any new conventions discovered go through the "Steering Evolution Mechanism."
2. **Write the plan draft** — the main agent writes the plan into the plan file with the Edit tool. **Follow the `plan-content-guide.md` conventions** (focus on substance, no process narration). Append a `## Review Log` section at the end of the plan file (using the five-block skeleton from `review-log-template.md`) — in Quick Fix Mode the review log lives inside the plan file, not in a separate file.
3. **design-reviewer multi-round loop (mandatory)** — give the reviewer the plan file path and run to 0 issues per `review-protocol.md` (Medium/Low use defer-and-batch; new Critical/High still present at Round 5 trips the convergence fuse). Architecture Decisions go to the user via AskUserQuestion; the main agent fixes Bugs/Smells with the Edit tool on the plan file; Steering Candidates accumulate for batch handling. **After each round, update the plan file's `## Review Log` section per `review-log-guide.md`** (add a new row to §1 Audit Trail, fill in the corresponding Decisions/Waivers subsections).
4. **Plan Briefing (mandatory, delivered as the turn-final message)** — after review converges and **before** ExitPlanMode: per `briefing-guide.md`, output the plan summary as text — **walk through it with the actual use case / bug-trigger scenario**: "what happens now → what it becomes after the fix → what risk remains," surfacing the key decisions (not a bare concept list), and end with "anything here that doesn't match what you expected?" — **the briefing must be the turn-final message; after sending it, end the turn immediately** (no AskUserQuestion / ExitPlanMode / any tool in the same turn — mid-turn text wedged before a tool call renders unreliably and the whole block can go invisible). Only after the user replies with no objection do you ExitPlanMode in the next turn; if there are issues → clarify verbally or Edit the plan file (and add a review round if the design substance changes).
5. **ExitPlanMode** — submit the converged plan for the user to approve.
6. **Implement** — after exiting Plan Mode, **the main agent writes the code directly** (a Quick Fix Mode special case — no dispatch to spec-implementer).
7. **implementation-reviewer multi-round loop (mandatory)** — run to 0 issues per `review-protocol.md`. The main agent fixes Bugs/Smells in the code directly (Quick Fix Mode special case). **After each round, update the plan file's `## Review Log` section the same way.**
8. **Summary** — before reporting, batch-process the accumulated Steering Candidates per the "Steering Evolution Mechanism." Report changed files, review history (pointing at the plan file's `## Review Log`), user-decided Decisions, steering updates, and build status.

**Key constraint**: Quick Fix Mode allows the main agent to write code directly; Spec Mode still strictly forbids it.

**Mid-flow escalation**: if you find the scope exceeds Quick Fix Mode (e.g., touching 5+ files, needing a formal design doc), stop and recommend the user upgrade to Spec Mode. The plan already written can serve as a starting point for design.md.

---

### /load-spec \<feature\>

Load a feature spec and show progress.

**Steps**:

1. Load steering (product.md, tech.md, structure.md)
2. Load requirements.md, design.md, tasks.md, review-log.md (if review-log.md is missing, mark it as missing but do not abort)
3. Parse tasks.md to tally task status
4. Parse review-log.md to tally: counts of §2 Decisions, §3 Waivers, §4 False Positives, §5 Steering Updates
5. Show a status summary and a recommended next step

> **Note**: loading does not run verification. Verification runs only when `/create-spec` or `/update-spec` completes.
> For standalone verification, use `/verify-spec`.

**Output format**:

```
📋 Spec Context loaded: {feature}

✅ Steering Documents: product.md ✓ | tech.md ✓ | structure.md ✓
✅ Spec Files: requirements.md ✓ | design.md ✓ | tasks.md ✓ | review-log.md ✓

📊 Progress: ✅ {n} completed | 🔄 {current} in progress | ⏳ {m} pending
📒 Review Log: {n} Decisions resolved | {m} Waivers | {k} False Positives | {s} Steering Updates

🎯 Suggestion: continue with task #{next}: {description}
```

> If review-log.md is missing (an old spec not yet upgraded), the output becomes `⚠️ review-log.md does not exist — recommend creating it manually (see templates/review-log-template.md)`.

---

### /create-steering

Create the project steering documents.

**Preconditions**: none

**Flow**:
1. Read `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/steering-guide.md`
2. **Enter Plan Mode** (use the EnterPlanMode tool)
3. Plan the steering content, confirm with the user, then exit Plan Mode
4. Create the `.spec/steering/` directory
5. Write in order (first Read the template, then write to the template's format):
   - `product.md` — template: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/product-template.md`
   - `tech.md` — template: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/tech-template.md`
   - `structure.md` — template: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/structure-template.md`
6. Run the Steering completeness check

---

### /create-spec \<feature\>

Create the spec documents for a feature.

**Preconditions**: steering documents must exist and be complete

**Steps**:

1. Load the steering documents
2. Read `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/spec-workflow.md`
3. **Steering sync check**: confirm the new feature is consistent with steering
   - Does the feature's tech choice conform to tech.md?
   - Does it introduce an undocumented new technology/framework?
   - Does the code organization conform to structure.md?
   - If there's any inconsistency, **update steering first, then continue**
4. **Enter Plan Mode** (use the EnterPlanMode tool)
5. **Launch the `spec-researcher` agent** (runs in the background): search existing solutions, libraries, best practices
6. Plan the spec content (requirements, design, tasks), folding the researcher's findings into design considerations
7. **(Optional) `design-reviewer` Mode A — Plan Mode sparring partner**:
   - While drafting the design direction, **proactively ask the user**: "Want to invite design-reviewer in to challenge this design?"
   - If the user agrees, invoke the `design-reviewer` agent and hand it the current design draft (it need not be finished)
   - The agent returns a **challenge list + Architecture Decisions**
   - For each Architecture Decision, **use AskUserQuestion to hand the choice to the user**, don't let the main agent decide
   - After revising the design direction you can invoke it again (this is an optional, non-mandatory loop)
8. **Plan Briefing (mandatory, delivered as the turn-final message)** — **before** ExitPlanMode: per `briefing-guide.md`, with an actual use case / scenario, output "what I plan to build for this feature, the core design direction, the key trade-offs surfacing so far," ending with "does the direction match what you expected?" → **end the turn and wait for the user's reply → only then ExitPlanMode** (no tool in the same turn). This is a "direction confirmation" briefing (design isn't written yet, so it's lightweight); the full one is at the end of step 15.
9. Create the `.spec/specs/{feature}/` directory
10. Write in order (first Read the template, then write to the template's format):
    - `requirements.md` — template: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/requirements-template.md`
    - `design.md` — template: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/design-template.md`
    - `review-log.md` — template: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/review-log-template.md` (create the minimal skeleton; the later review loop fills in content)
11. **`design-reviewer` Mode B — mandatory multi-round review (until 0 issues)**:
    - **This step is mandatory** and cannot be skipped
    - Loop start (from Round D1):
      - Invoke the `design-reviewer` agent to review design.md for design quality
      - The agent returns an issue list (Bugs / Smells / Decisions + non-blocking Steering Candidates, graded Critical/High/Medium/Low, rounds named `D{N}`)
      - **Append the whole issue list to `review-log.md` §1 Audit Trail, Status initially `pending`** (per `review-log-guide.md`)
      - **If there are Architecture Decisions**: use AskUserQuestion to hand each Decision to the user (presentation format per the "Architecture Decision Presentation Discipline" section below / decision-escalation-guide.md). After it's decided, **write it to `review-log.md` §2** + update the corresponding §1 row + make a promotion judgment (hook point 2 of the "Steering Evolution Mechanism")
      - **If there are Bugs/Smells (Critical/High)**: the main agent fixes design.md (it may also invoke the researcher for supplementary research); once done, update that §1 row's Status to `fixed`
      - Medium/Low: **defer-and-batch** — don't ask every round; accumulate to the round where Critical/High hits zero and ask once via AskUserQuestion (per `review-protocol.md`'s "Loop convergence rules"); if the user decides to keep it, that's a waiver → **write it to `review-log.md` §3** + update §1
      - If an issue is judged a false positive after discussion → **write it to `review-log.md` §4** + update §1
      - **If there are Steering Candidates**: accumulate them (they don't count against convergence) and batch-process per the "Steering Evolution Mechanism"
      - Enter Round D{N+1} and re-invoke `design-reviewer`
    - **End the loop only when a round has 0 issues (and no accumulated pending Medium/Low)**; new Critical/High still present at Round 5 → trips the `review-protocol.md` convergence fuse — stop and report to the user
    - **100% isolation of formal docs** — design.md carries no Decisions / Waivers / round process / reviewer citations / footnote pointers at all. Express design rationale as **neutral prose** (technical constraints / codebase conventions / adverse consequences) woven into the Component descriptions. Full conventions and bad/good comparisons: `review-log-guide.md` + `review-log-bad-examples.md`
12. **Write `tasks.md`** (only after design.md has converged) — template: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/tasks-template.md`
13. Use the `spec-verifier` agent to **run the Spec completeness check** (including the "cross-file Review-Residue check" that ensures formal docs contain no inline waiver / decision blocks)
14. Use the `tasks-design-verifier` agent to **run the Tasks vs Design alignment check**
15. **Spec Briefing (mandatory, delivered as the turn-final message)** — after both verifiers pass: per `references/briefing-guide.md`, summarize the whole spec as text — **walk through it with 1–2 actual use cases** to surface the architecture highlights, new concepts, the scenario-grounded consequences of the resolved Decisions, the Waivers and their cost, and the implementation outlook (not a bare concept list), ending with "anything here that doesn't match what you expected?" — **the briefing must be the turn-final message; after sending it, end the turn immediately** (no tool follows). Only after the user replies with no objection is /create-spec complete; if there are issues → clarify verbally, or go back and fix the spec (which re-triggers the corresponding verifier)

---

### /update-steering \<type\>

Update a steering document.

**Argument**: `type` = product | tech | structure

**Flow**:
1. Load the specified steering document
2. **Enter Plan Mode** (use the EnterPlanMode tool)
3. Plan the changes, confirm with the user, then exit Plan Mode
4. Apply the changes
5. Re-run the Steering completeness check
6. Check consistency with the other steering documents

---

### /update-spec \<feature\>

Update a feature's spec documents.

**Core principle**: changing a completed spec is no less risky — often more — than building one fresh (it can break invariants established by the original design and affect already-implemented code). So **when design.md changes substantively, /update-spec runs the same mandatory design-review loop as /create-spec**, with the same plan-phase and end-of-flow briefings.

**Steps**:

1. Load the steering documents
2. Load the feature's spec documents (including review-log.md)
3. **Enter Plan Mode** (use the EnterPlanMode tool)
4. Plan the changes (which parts of r/d/t to touch, and why); **(optional)** invite `design-reviewer` Mode A to challenge the direction
5. **Plan Briefing (mandatory, delivered as the turn-final message)** — **before** ExitPlanMode: per `briefing-guide.md`, with an actual use case / scenario, output "what's changing → what it becomes → where it affects the existing design / already-implemented code," ending with "anything that doesn't match what you expected?" → **end the turn and wait for the user's reply → only then ExitPlanMode** (no tool in the same turn)
6. Apply the changes (to requirements / design / tasks)
7. **Steering sync check**: if the design change involves a shift in technical direction, update steering in sync
8. **design.md changed substantively → mandatory `design-reviewer` Mode B multi-round review loop (until 0 issues)** — the **same protocol** as /create-spec step 11: append the issue list to review-log §1, two-beat AskUserQuestion for Architecture Decisions then write §2 + promotion judgment, Critical/High must be fixed, Medium/Low defer-and-batch, Steering Candidates batched, false positives to §4, new Critical/High still present at Round 5 trips the fuse, 100% isolation of formal docs. **Pure requirements wording clarification (design untouched) or pure tasks status bookkeeping may skip this loop.**
9. **Design-change impact assessment** (when implementation code already exists): identify the affected scope → update tasks.md markers (affected → `[~]`, deleted → `[-]`, add new tasks). Detailed flow in the "Design-change impact assessment" section of `references/checklists.md`
10. Re-run the corresponding verifier:
    - changed requirements.md → `spec-verifier` (**Spec completeness check**, including review-residue check)
    - changed design.md or tasks.md → `tasks-design-verifier` (**Tasks vs Design alignment check**)
11. **Spec Briefing (mandatory, delivered as the turn-final message)** — per `briefing-guide.md`, summarize "**what changed this time, why, the new Decisions/Waivers the review resolved, and the impact on existing tasks / already-implemented code**" (use-case-driven), then **end the turn and wait for the user's reply**. Only after the user confirms is /update-spec complete; if there are issues → clarify verbally or fix again (re-triggering the corresponding verifier / an extra design-review round if needed)

> **Note**: `/update-spec` only updates documents and task status; it does not implement. The actual code changes happen during `/implement`.

**Task status markers**: `[ ]` pending | `[x]` done | `[~]` needs rework (design-change impact) | `[-]` removed

---

### /verify-spec \<feature\>

Run Spec completeness verification and Tasks vs Design alignment verification standalone.

**Important**:
- **Stage 1 Spec completeness verification** must run via the `spec-verifier` agent
- **Stage 2 Tasks vs Design alignment check** must run via the `tasks-design-verifier` agent
- **If Stage 1 fails, do not run Stage 2**

**Steps**:

1. Confirm the `.spec/specs/{feature}/` directory exists and contains requirements.md, design.md, tasks.md, and review-log.md (a missing review-log.md is a warning but does not block verification)
2. **Stage 1: Spec completeness verification**
   - Run the completeness check via the `spec-verifier` agent
   - Verify requirements.md (content completeness + responsibility-boundary check + review-residue check)
   - Verify design.md (content completeness + implementation-detail completeness + responsibility-boundary check + review-residue check)
   - Verify tasks.md (numbering format + content completeness + review-residue check)
   - **If any item fails, stop immediately and output the report**
3. **Stage 2: Tasks vs Design alignment check** (only after Stage 1 passes)
   - Run the alignment check via the `tasks-design-verifier` agent
4. Show the full verification report

**Output format**: detailed format is decided by the `spec-verifier` / `tasks-design-verifier` agents (pass rate per item + a table of failing items + conclusion).

---

### /implement \<feature\>

Start implementing the feature.

**Preconditions**:
- The spec already exists (the `.spec/specs/{feature}/` directory contains requirements.md, design.md, tasks.md)

**Important**: the implementation phase **must** run via agents; the main agent is **forbidden** from implementing code directly.

**Pre-step (briefing check)**: if this session hasn't yet given a spec briefing for this feature (a typical case: running /implement in a later session), first output a **condensed briefing** per `briefing-guide.md` (10–20 lines: positioning / one use-case main-line walk-through / resolved Decisions / this run's task scope) to rebuild the user's context — **deliver it as the turn-final message and end the turn**; only after the user confirms do you enter Stage 1.

---

#### Stage 1: Initial Implementation

1. Get the pending tasks from tasks.md (`[ ]` / `[~]` status)
2. Analyze dependencies and group the tasks (independent groups can run in parallel, at most 4 groups)
3. Launch `spec-implementer` agents (Mode 1) — spawn multiple independent groups in parallel within the same message; each agent receives the feature name, its task list, the `Mode 1` marker, and reads design.md via the `Design ref` field
4. Agent reports completion → immediately update tasks.md to `[x]`
5. After all groups finish, enter Stage 2

---

#### Stage 2: Review Loop (review only, multi-round to 0 issues)

`spec-implementer`'s self-verification can't catch the "things that only blow up in production" (async race, weak-ref GC, idempotency, leak, test gap) — that's Stage 2's job.

1. Each round, invoke `implementation-reviewer` to review all the implementation from a senior engineer's perspective, producing an issue list (interpret it per `review-protocol.md`'s Quick Summary, rounds named `I{N}`)
2. **Append the whole issue list to `review-log.md` §1 Audit Trail, Status initially `pending`** (per `review-log-guide.md`)
3. Process the issue list (update that §1 row's Status + Resolution as soon as each issue is handled):
   - **Architecture Decisions** → AskUserQuestion to the user (presentation format per the "Architecture Decision Presentation Discipline" section / decision-escalation-guide.md; may trigger /update-spec) → after it's decided, **write it to `review-log.md` §2** + update §1 + make a promotion judgment (hook point 2 of the "Steering Evolution Mechanism")
   - **Critical/High Bugs/Smells** → dispatch `spec-implementer (Mode 2)` to fix (the main agent does not touch code directly) → once fixed, change that §1 row to `fixed`
   - **Medium/Low** → **defer-and-batch** — don't ask every round; accumulate to the round where Critical/High hits zero and ask once via AskUserQuestion; if the user decides to keep it → **write it to `review-log.md` §3 Waivers** + update §1
   - **False positive** → confirmed a false positive after discussion → **write it to `review-log.md` §4** + update §1
   - **Steering Candidates** → accumulate (they don't count against convergence) and batch-process per the "Steering Evolution Mechanism"
4. After fixes, enter Round I{N+1}, until a round has 0 issues (and no accumulated pending Medium/Low); new Critical/High still present at Round 5 → trips the `review-protocol.md` convergence fuse — stop and report to the user

**Only `spec-implementer` writes / fixes code** — the reviewer doesn't touch code, the main agent doesn't touch code (the Spec Mode rule).

**Production code discipline**: when `spec-implementer (Mode 2)` fixes code it may not leave `// WAIVED:` / `# HACK: reviewer accepted` / `# ⓘ ... — see review-log`-style review-residue comments (footnote pointers are also fully abolished). The full waiver rationale lives in `review-log.md` §3; if the code needs to explain a design choice, use a **neutral semantic comment** (system invariant / precondition / dependency pointer) that does not reveal the reviewer source. See `references/review-log-bad-examples.md` Pattern E for examples. The next round of `implementation-reviewer` will open code that violates this rule as a new Smell issue.

---

#### Stage 3: Summary

Before reporting, batch-process the accumulated Steering Candidates / findings from implementation per the "Steering Evolution Mechanism." Report: completed tasks, the implementation-reviewer multi-round history, Mode 2 fixes, user-decided Decisions, steering updates, and build status. Let the user decide the next step (diff / commit / next phase / something else).

---

## Calibrate for Cognitive Load (global communication principle)

**Any output** the main agent produces for the user — mode declaration, progress report, problem explanation, review conclusion, summary, Decision escalation, briefing — must be **digested and abstracted** before it's presented; don't dump a raw flood of information at the user. This isn't the rule of one checkpoint; it's the communication baseline that runs through the entire flow.

**Why**: the mental map an agent can hold up instantly is far larger than what a human can absorb in the moment. Dumping un-abstracted bulk on the user → cognitive overload → the important point gets buried → misunderstandings only surface after implementation, where fixing them costs an order of magnitude more. Lowering cognitive load isn't a courtesy; it moves "trigger the discussion" to the cheapest possible moment.

**Core practice — one lens serving both analysis and communication**: "**use cases + execution flow + data structures**" is one lens used two ways:

- **Analysis (review)** uses it to find "the core design concepts driven by real scenarios," ruling out theoretical edge cases with no scenario (see `references/review-protocol.md`, "Review method")
- **Communication (briefing / any explanation)** presents those core concepts through the same lens: walk through it with an actual use case, introducing components, data structures, and execution flow only as they appear on stage in the scenario

The bridge is the "**core design concept**" — review decides what's important (scenario-driven is what's important), and communication spends its words on what's important, skipping the theoretical noise. **Review and briefing have different jobs but share the same underlying lens.**

**Three concrete disciplines**:

1. **Narrate with an actual use case riding the execution flow** — a bare concept list (stacking component names + pattern names) builds no mental picture; scenario narration ("when the user does X, because of some decision, they go through Y") lands instantly.
2. **Don't assume the user remembers earlier context** — humans forget across conversation turns, and forget a project's full architecture over time. When explaining, don't casually omit data structures, execution flows, or abstractions raised a few turns back; restate them proactively when needed, to help the user rebuild the mental model.
3. **Just the right amount of information** — too little and the user can't judge; too much and they can't absorb it; when detail is needed, point at the location in the docs (design.md §X / the plan file's section) rather than re-pasting the whole thing.

**Three downstream applications** (concretizations of this principle, each with its own detailed guide):

| Application | Guide |
|---|---|
| Spec / Plan Briefing before implementation | `references/briefing-guide.md` |
| Escalating an Architecture Decision / waiver / steering candidate to the user | `references/decision-escalation-guide.md` |
| Review analysis (using the same lens to find core design concepts) | `references/review-protocol.md`, "Review method" |

---

## Plan / Design Document Content Guide

When writing a plan file (Quick Fix Mode) or design.md (Spec Mode), **focus on substance, no process narration**:

| ✅ Write | ❌ Don't write |
|---|---|
| Context (why the change) | Process narration ("I'll invoke X and then X will...") |
| Change list (specific file + change) | Restating skill discipline ("per review-protocol.md...") |
| Risk assessment | Mode comparison table ("why not the other mode") |
| Architecture Decisions (Options + Trade-offs) | Estimating how many review rounds (the reviewer decides, not the plan) |
| Verification approach | Definition of Done (the exit condition the skill runs automatically) |

**Why**: the reviewer / spec-implementer already know the skill flow; the plan needn't restate it. Verbose process narration = noise that blurs the substance the user actually needs to see.

Detailed guide + length recommendations + example comparisons: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/plan-content-guide.md`

---

## Architecture Decision Presentation Discipline

When the main agent uses `AskUserQuestion` to hand a reviewer-escalated Decision to the user, it must do the "reviewer-machine-parsable → user-human-digestible" translation. The reviewer's four raw inputs (Option 1 / Option 2 / why there's no consensus / what the user should consider) **must not be copied over verbatim**.

**Two-beat = two turns (applies to every AskUserQuestion in this skill — Decision / waiver batch / steering candidates)**: (1) briefing turn — output the question briefing as conversational text (review context + **state the problem with an actual use case** + code comparison, per briefing-guide.md), **delivered as the turn-final message, then end the turn**; (2) question turn — only after the user replies, send an AskUserQuestion with a **very short stem** (skip if the user already took a position in their reply). Why split into two turns: stuffing context into the question stem makes it hard to read in the dialog box; mid-turn text wedged before a tool call renders unreliably (both the CLI and remote-control will make it invisible) — only the turn-final message is guaranteed visible.

| ✅ Do | ❌ Don't |
|---|---|
| End the briefing turn and wait for the user's reply, then ask with a short stem next turn | Briefing + AskUserQuestion in the same turn (mid-turn text invisible); stuffing the stem with context; dropping options without explaining their origin |
| Brief the problem with an actual use case; explain a term the first time it appears | Bare conceptual proposition + unexplained project jargon |
| Paste the code snippet directly for a function / SQL / config + a same-codebase comparison (in the first beat) | Prose-describing the code ("returns a bool at line 142") |
| Each Option `description` covers at least the 3 core dimensions (architecture / consistency / functional risk), plus others by the nature of the Decision | Only writing single-dimension consequences ("will break X"); forcing "N/A" into the blanks |
| Use the `preview` field for a before/after diff or the full function | Describing code details in prose without showing them |
| Split independent Decisions into multiple calls; parallel-related ones in one call with multiple questions; conditionally-coupled ones via a composite option or a sequence | Cramming conditionally-coupled (B depends on A) ones into one call's multiple questions (the tool doesn't support that dependency) |

**Why**: a human can't hold up the reviewer's kind of vast mental map on the spot. The context per interaction must be just right — too little and the user can't judge, too much and they can't absorb it. The reviewer's inputs are raw material that the main agent must translate into human-friendly conversation.

Detailed guide + full has_related example: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/decision-escalation-guide.md`

---

## Multi-Round Review Mechanism

`design-reviewer` and `implementation-reviewer` share one multi-round review loop. The **detailed protocol** (severity grading, letter-numbering rules + D/I prefix, Architecture Decision discipline, output format, convergence determination, shared reviewer discipline, Review Log handshake) is recorded in `references/review-protocol.md`.

**Lazy-loading design**: the reviewer agent reads review-protocol.md itself on startup. The main agent needn't pre-read it — understanding the Quick Summary below is enough to drive the loop.

### Quick Summary

- **Severity**: Critical / High / Medium / Low — Critical+High must be fixed, Medium+Low are the user's call
- **Numbering**: accumulates across rounds within a reviewer type and never resets; **design (D) and implementation (I) accumulate independently** (always cite with the Round prefix: `D2 Smell C` / `I1 Bug A`)
- **Convergence**: the loop exits only when the reviewer outputs `0 issues` and there's no accumulated pending Medium/Low; it can't exit early with Critical/High present; **the fuse** — new Critical/High still present at Round 5 stops the loop and reports a structural problem to the user (not counted as convergence)
- **Medium/Low defer-and-batch**: don't ask the user every round — accumulate to the round where Critical/High hits zero and ask once in a batch
- **Architecture Decision**: a design choice the reviewer has no consensus on → the main agent hands it to the user via AskUserQuestion, **doesn't decide it itself**
- **Steering Candidates**: the reviewer finds a project-level principle not recorded in steering → a non-blocking `SC` section (doesn't count against convergence); the main agent batch-processes it per the "Steering Evolution Mechanism"
- **Review/Fix split**: the reviewer doesn't touch code, doesn't write the review log; in the design phase the main agent edits design.md / the plan file, in the implementation phase Spec Mode dispatches `spec-implementer (Mode 2)` while Quick Fix Mode has the main agent fix directly
- **Review Log maintenance**: after each review round the main agent folds the issue list into the review log (see the "Review Log Mechanism" below + `references/review-log-guide.md`)

---

## Review Log Mechanism

Every spec / Quick Fix task has a review log recording the five kinds of artifact from the review/resolve process: the cross-round issue audit trail / Architecture Decisions / Waivers / False Positives / Steering Updates.

**Core idea**: the formal docs (requirements / design / tasks / production code) describe "**what the world looks like after decisions**"; the review log describes "**why it's this world, what was rejected along the way, which principles were deliberately waived**." The two are fully separate but may cite each other both ways.

### Why it's needed

In the old review/resolve process, the agent would leave the review-process audit trail inside the formal docs — for instance an 8-line "SRP exception (known and accepted): ..." block tucked into a tasks.md task description. The content itself is reasonable, but it's **in the wrong place**: tasks.md should answer "what does this task do," not carry "we accept violating some principle." The review log keeps these artifacts together, returning the formal docs to single-source-of-truth readability.

### File location

| Mode | Location | Committed? |
|---|---|---|
| Spec Mode | `.spec/specs/{feature}/review-log.md` | yes |
| Quick Fix Mode | the `## Review Log` section at the end of the plan file | no (the plan file is ephemeral) |

### The four discipline rules (100% isolation)

1. **Formal docs contain no review-log content or reference at all** — forbidden: ADR / Decisions sections, reviewer letter tags (`per Decision X`), round-process narration, review-log citations, footnote pointers, waiver blocks. `spec-verifier`'s "cross-file Review-Residue check" auto-detects the full pattern list
2. **No review-residue comments in production code** — forbidden: `// WAIVED:` / `# HACK: reviewer accepted` / `# ⓘ ... — see review-log`. Violations are opened by `implementation-reviewer` as a new Medium Smell. Exception: pure code semantic comments (system invariant / precondition / dependency pointer) are allowed
3. **Formal docs explain design rationale with neutral prose** — weave technical constraints / codebase conventions / adverse consequences into the relevant section, without revealing the reviewer / Decision letter / Round / user-decision process (❌ "Synchronous per Decision AL accepted in Round 3" → ✅ "Synchronous for atomicity — async would leave intermediate states violating schema invariants")
4. **The reviewer doesn't write the log; the main agent integrates it** — the reviewer only produces the issue list; each round the main agent appends §1, updates Status once handled, and fills the corresponding subsection; after a Decision is resolved it writes §2 **and** weaves the resulting content into design.md as neutral prose

**Why even footnote pointers are forbidden**: in practice, once you allow any back door for "the formal doc just mentioning the review-log," the agent gradually degrades into writing whole ADR blocks, letter tags, round narration (the industry ADR pattern is deeply trained in). 100% zero-citation + neutral design rationale is the only reliable discipline boundary.

### Detailed conventions

- Writing conventions / ID rules / Status values / examples: `references/review-log-guide.md`
- Bad / Good comparisons (5 patterns + a general rewrite formula): `references/review-log-bad-examples.md`
- The reviewer/main-agent handshake protocol: the "Review Log integration" section of `references/review-protocol.md`

---

## Steering Evolution Mechanism

Steering is a living document — the principles / conventions that truly **run through the whole project** keep surfacing during development, and **the best moment to promote one is the moment it surfaces** (context is still fresh, the user just decided), not some big later review.

**But the bar is high, and the default is not to promote**: the vast majority of things that come up during review / implementation are spec-specific, implementation details, or project-memory-level facts — **none of which belong in steering**; only promote the few core principles where "not recording it would almost certainly cause future inconsistency or difficulty" (the full bar and exclusion list are in `references/review-protocol.md`, "Steering Candidates"). When in doubt, leave it out — padding dilutes the guardrails and floods the user's attention.

Three hook points:

| Hook point | When | Form |
|---|---|---|
| 1. Reviewer | during design / implementation review | the `📌 Steering Candidates` section after the issue list (non-blocking, doesn't count against convergence) |
| 2. After a Decision is resolved | the moment the user finishes the AskUserQuestion | the main agent judges immediately: "a choice for this feature only" or "a project-level principle"? The latter is proposed for promotion right away (the user is still in context, lowest follow-up cost) |
| 3. During implementation | spec-implementer's completion report / when the Quick Fix main agent is working | findings are listed in the report and the main agent collects them |

**Lightweight update path** (not the full Plan Mode of `/update-steering`):

1. Dedupe the accumulated candidates, then hand them to the user in a batch via AskUserQuestion (hook point 2 is handled at decision time; the rest are handled before Summary at the latest)
2. User confirms → the main agent Edits the corresponding steering document directly (usually tech.md / structure.md) — steering records only the principle itself (the world after decisions), not its source
3. Run the `checklists.md` "Steering completeness check" consistency check (the three docs have no contradictions)
4. Record it in review log §5 Steering Updates (principle / where written / source)

**Boundary**: this mechanism handles "add a principle / convention entry"-level increments; directional overhauls (swapping architecture patterns, changing the tech stack) still go through `/update-steering`. Quick Fix Mode applies the same way if the project already has steering.

**Why immediate, but restrained**: steering goes stale gradually — if a genuinely cross-feature core convention goes unrecorded, six months later steering and the codebase have drifted apart and the alignment check is toothless, so what should be promoted should be promoted on the spot. But conversely, **over-promotion (cramming spec-specific / detail / one-off decisions into steering) is the more common failure in practice** — it dilutes the guardrails, buries the truly important clauses, and wastes the user's attention every round. Both directions must be avoided, and **the default leans restrained**: promote the few that truly run through the whole project, not something every round.

---

## Error Handling

| Situation | Handling |
|------|------|
| Steering doesn't exist | Block /create-spec, guide to /create-steering |
| Spec doesn't exist | Block /load-spec, guide to /create-spec |
| Tasks vs Design verification fails | Show the inconsistencies, ask how to fix |
| Design flaw found during implementation | Pause, recommend updating design.md |
| New feature inconsistent with Steering | Prompt to update steering first, then continue |
| Design change affects completed tasks | Run the implementation-sync flow, mark affected tasks `[~]` |
| Design change deletes a feature | Mark tasks `[-]`; the reviewer is responsible for removing the code |
| Review finds design / implementation conflicts with steering | The reviewer opens an Architecture Decision; the user decides: fix the design or update steering (steering may be stale) |
| Review still has new Critical/High after 5 straight rounds | Trip the convergence fuse: stop the loop, gather the cross-round pattern, report the structural problem to the user |
| Agent communication failure | Retry once; if it still fails, escalate the report |
| Circular dependency detected | Stop execution and report the problem |
| design.md missing or incomplete | Ask for clarification, then continue |

---

## Core Principles

**Shared**:
1. **Plan Before Code** — have a plan first (Quick Fix: plan file / Spec: design.md), don't go straight to writing
2. **Research Before Design** — research existing solutions before designing
3. **Self-Verify + Verify Before Deliver** — the implementer self-verifies; before delivery it must pass the reviewer + the build
4. **Review Until Convergence** — multi-round to 0 issues, no accepting "good enough, stop"; but the reviewer is honest both ways (no fake convergence, no inventing issues), and 5 straight rounds with new Critical/High trips the fuse to escalate to the user
5. **No Architectural Overreach** — the reviewer doesn't decide a design choice it has no consensus on; it hands it to the user
6. **Separate "What Is" from "Why"** — the formal docs describe "the world after decisions"; the review log describes "why it's this world." Waivers / Decisions / cross-round audit trail all go in the review log, never polluting the formal docs
7. **Steering is Living (but restrained)** — a core principle that surfaces during development and truly runs through the whole project is promoted right away once the user confirms (see "Steering Evolution Mechanism"), without waiting for a big review; but **the bar is high and the default is not to promote** — spec-specific / implementation detail / one-off decisions / project memory all stay out of steering; when in doubt, leave it out
8. **Brief Before Build** — before implementation starts, output a conversational summary of the spec / plan's key points (`briefing-guide.md`), so the user gets up to speed cheaply and the discussion is triggered at the cheapest moment
9. **Calibrate for Cognitive Load** — the main agent digests and abstracts **any output** to the user before presenting it, narrating with an actual use case riding the execution flow, not assuming the user remembers the data structures / flows / concepts raised a few turns back. This is the shared root of #8 Brief Before Build and the "Architecture Decision Presentation Discipline" (see the "Calibrate for Cognitive Load" section)

**Spec Mode specific**:
10. **No Steering, No Spec Mode** — steering must exist before entering Spec Mode, and it evolves continuously with the project
11. **Design is Truth** — design.md is the single source of truth
12. **Implementation by Agent Only** — the main agent is forbidden from working directly; it must dispatch `spec-implementer`

**Quick Fix Mode specific**:
13. **Plan File is Truth** — the plan file is the source of truth (including its embedded `## Review Log` section; the path is confirmed at EnterPlanMode)
14. **Main Agent May Implement** — the main agent is allowed to work directly (a special case, but the review loop is still mandatory)
15. **Escalate When Scope Grows** — when the scope is found to exceed range, stop and recommend upgrading to Spec Mode

---

## Reference Documents

| Document | Content |
|------|------|
| `references/mode-selection.md` | Quick Fix Mode vs Spec Mode criteria and up/downgrade rules |
| `references/plan-content-guide.md` | Plan / Design document content guide (substance vs process narration) |
| `references/steering-guide.md` | Steering document writing guide (Spec Mode) |
| `references/spec-workflow.md` | Spec document writing workflow (Spec Mode) |
| `references/checklists.md` | All checklists (including Design Review / Implementation Review) |
| `references/review-protocol.md` | The reviewer agents' shared protocol (read by the reviewer; the main agent needn't pre-read) |
| `references/review-log-guide.md` | Review Log writing conventions (format / ID / neutralization principle / examples) |
| `references/review-log-bad-examples.md` | Bad / Good comparisons of the 5 review-residue patterns + a general rewrite formula |
| `references/decision-escalation-guide.md` | Architecture Decision Presentation Discipline (including writing to review log §2 after a decision + neutralized reflection in design.md) |
| `references/briefing-guide.md` | Spec / Plan Briefing guide (conversational summary before implementation — trigger timing / content structure / cognitive calibration) |
| `templates/review-log-template.md` | The minimal review-log.md skeleton (used by /create-spec and Quick Fix Mode) |

All paths are prefixed with: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/`
