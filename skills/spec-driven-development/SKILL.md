---
name: spec-driven-development
description: "Disciplined development workflow with multi-round architecture review loops. MUST use for any task that writes or modifies code — bug fixes, refactors, config tweaks, new features, anything (sole exception: trivial pure-text edits like a README typo). Auto-routes: (a) Quick Fix Mode for bug fixes / refactors / small extensions — Plan Mode + mandatory review loops, no spec docs; (b) Spec Mode for new features / large refactors / cross-component work — full steering + requirements + design + tasks docs before implementation. Both modes run design-reviewer and implementation-reviewer loops until 0 issues — non-negotiable regardless of task size. Steering docs are living: review loops surface unrecorded project principles for user-confirmed promotion into steering. Triggers: fix bug / refactor / add feature / change behavior / modify config / create or edit spec / implement feature. Deferred discoveries — issues found mid-flow that can't be resolved now — are recorded silently to the project backlog (.spec/backlog/) so nothing is lost to session end. Also use when asked about steering / requirements / design / tasks docs, the backlog / recording something for later, /create-spec, /implement, /load-spec, /verify-spec, /backlog."
---

# Spec-Driven Development

A development workflow with **two routing modes**, both backed by multi-round architecture review:

- **Quick Fix Mode**: bug fix / refactor / small extension — Plan Mode + review loops
- **Spec Mode**: new feature / large refactor / cross-component — full steering + spec docs + implementation

**Detailed mode-selection guidance**: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/mode-selection.md`

**Core discipline**: regardless of mode, the `design-reviewer` + `implementation-reviewer` multi-round loops are mandatory and run until 0 issues. Review discipline is the quality line of defense — **it does not bend for task size**.

**Execution architecture (who generates, who arbitrates)**: the main agent — running the session's top-tier model — acts as orchestrator, arbiter, and the user's single interlocutor: it discusses requirements, distills briefs, challenges subagent conclusions, escalates decisions, and maintains the review log. **All long-form generation lives in persistent subagent sessions** on a capable-but-cheaper tier: `spec-author` writes plans and spec documents, `spec-implementer` writes code (both modes), the two reviewers review — each session spawned once per loop and **resumed via SendMessage across rounds** instead of respawned, so nothing gets re-read that's already in a session's context. The arbiter's mandatory per-round challenge is what keeps the cheaper review deep (mechanics in `review-protocol.md`, "Persistent sessions and the challenge exchange"). The main agent never writes production code or long-form documents in either mode.

## Quick Reference

### Route first (**do this before anything else**)

When the main agent receives any request to write / modify code, the first step is to decide which mode to take (see `mode-selection.md`):

| Signal | Mode |
|---|---|
| bug fix / refactor / small extension / typo / config change | **Quick Fix Mode** |
| new feature / large refactor / cross-component / introduces a new concept | **Spec Mode** |
| unsure | main agent decides first and tells the user; the user can adjust |

After deciding, **tell the user explicitly which route you're taking**, e.g.: "I'm planning to run this as a quick fix — scope is a single-component bug fix. Tell me if you'd rather go through the spec-level flow."

### Commands (Spec Mode + shared)

| Command | Description |
|------|------|
| `/load-spec <feature>` | Load spec, verify, then show progress |
| `/create-steering` | Create the three steering documents |
| `/create-spec <feature>` | Create the three spec documents for a feature |
| `/update-steering <type>` | Update steering (product/tech/structure) |
| `/update-spec <feature>` | Update a feature spec |
| `/verify-spec <feature>` | Verify spec completeness + tasks vs design alignment |
| `/implement <feature>` | Start implementation |
| `/backlog [args]` | List / pick up / close backlog items (works in both modes) |

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

### Backlog (project level)

```
.spec/backlog/
├── BACKLOG.md              # index — open / in-progress items only
├── bl-0001-{slug}.md       # one item per file, thick context
└── archive/                # closed items (done / dropped)
```

> **The role of the backlog**: the durable parking lot for anything discovered mid-flow that can't be resolved now or needs deeper discussion later — deferred review issues the user intends to repay (as opposed to waivers), out-of-scope findings from implementation, unresolved threads from conversation. See the "Backlog Mechanism" section below and `references/backlog-guide.md`.

---

### Agents

This skill uses the agents defined in the plugin to carry out each phase.

| Agent | Purpose | Trigger | Action |
|-------|------|---------|------|
| `spec-researcher` | Search existing solutions, libraries, best practices | /create-spec planning phase | review only |
| `spec-verifier` | Verify spec file **completeness and format** (cookie-cutter check) | /verify-spec Stage 1, /create-spec | review only |
| `tasks-design-verifier` | Verify **alignment** between tasks.md and design.md | /verify-spec Stage 2, /create-spec, /update-spec | review only |
| `spec-author` | Author / revise planning & spec docs per the main agent's brief (two modes; **persistent session** across the authoring + review cycle) | Plan Mode in both modes (plan file); /create-spec + /update-spec (requirements/design/tasks); design-review fix dispatch (Mode 2) | **writes / fixes docs** |
| `design-reviewer` | Review **design quality** from a senior engineer's perspective (multi-round to 0 issues) | /create-spec design phase; /update-spec when design changes; Quick Fix Mode reviewing the plan file | review only (produces issue list) |
| `spec-implementer` | Write / fix code + self-verify + build (two modes; **persistent session** across the implementation + review cycle) | /implement Stage 1 + Quick Fix implement step (Mode 1); taking a reviewer issue list (Mode 2) | **write / fix code** |
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
Plan Mode (spec-author drafts plan) + design-reviewer loop
→ ExitPlanMode → spec-implementer implements → implementation-reviewer loop
```

---

## Operating Instructions

### Quick Fix Mode (no slash command; main agent auto-routes)

When a task meets the Quick Fix Mode bar (see `mode-selection.md`) — bug fix / refactor / small extension / typo / config change — run the flow below, with **no need to create steering / requirements / design / tasks documents**:

**Upfront declaration**: after receiving the task, the main agent first tells the user: "I'm planning to run this as a quick fix, because {basis for the call}. Let me know if you need the spec-level flow."

**Steps**:

1. **EnterPlanMode** — confirm the actual path of this run's plan file (Claude Code usually creates it automatically; if the environment provides no plan file, `spec-author` will create one under `~/.claude/plans/<slug>.md` — **plan files never live inside the repo**). If the project already has `.spec/steering/`, load it too — the reviewer will do a steering alignment check, and any new conventions discovered go through the "Steering Evolution Mechanism."
2. **Dispatch the plan draft to `spec-author` (Mode 1)** — the main agent distills the discussion into a brief (context, decided direction, constraints, steering pointers) and hands it over together with the plan file's absolute path. The author writes the plan per `plan-content-guide.md` (focus on substance, no process narration) and appends a `## Review Log` section at the end (using the five-block skeleton from `review-log-template.md`) — in Quick Fix Mode the review log lives inside the plan file, not in a separate file. When the draft returns, the main agent reads it in full and runs the **fidelity challenge** (per `review-protocol.md`): drift from the brief → one exchange in the author session.
3. **design-reviewer multi-round loop (mandatory)** — give the reviewer the plan file path and run to 0 issues per `review-protocol.md`: the reviewer session stays alive across rounds (resumed via SendMessage), and after each round's issue list the main agent runs the **challenge exchange** before acting — the final post-challenge list is the round's record (Medium/Low use defer-and-batch; new Critical/High still present at Round 5 trips the convergence fuse). Architecture Decisions are routed through the advisor gate (the advisor settles clear-cut technical ones → plan-file review log `advisor-resolved`, confirmed at the briefing; genuine user calls → AskUserQuestion) — see "Advisor Gate Mechanism"; Bugs/Smells → resume the `spec-author` session (Mode 2) to fix the plan file; Steering Candidates accumulate for batch handling. **After each round, the main agent updates the plan file's `## Review Log` section per `review-log-guide.md`** (add a new row to §1 Audit Trail, fill in the corresponding Decisions/Waivers subsections).
4. **Plan Briefing (mandatory, delivered as the turn-final message)** — after review converges and **before** ExitPlanMode: per `briefing-guide.md`, output the plan summary as text — **walk through it with the actual use case / bug-trigger scenario**: "what happens now → what it becomes after the fix → what risk remains," surfacing the key decisions (not a bare concept list), and end with "anything here that doesn't match what you expected?" — **the briefing must be the turn-final message; after sending it, end the turn immediately** (no AskUserQuestion / ExitPlanMode / any tool in the same turn — mid-turn text wedged before a tool call renders unreliably and the whole block can go invisible). Only after the user replies with no objection do you ExitPlanMode in the next turn; if there are issues → clarify verbally or resume the `spec-author` session to fix the plan file (and add a review round if the design substance changes).
5. **ExitPlanMode** — submit the converged plan for the user to approve.
6. **Dispatch the implementation to `spec-implementer` (Mode 1)** — after exiting Plan Mode, hand it the plan file's absolute path as the design basis (the plan's change list is its task list; it ignores the `## Review Log` section) plus steering pointers if the project has steering. It implements, self-verifies, and confirms the build before reporting. **Keep the session resumable** — the review loop's fix dispatches resume it.
7. **implementation-reviewer multi-round loop (mandatory)** — run to 0 issues per `review-protocol.md`, with the same persistent reviewer session + per-round challenge exchange. Bugs/Smells → resume the `spec-implementer` session (Mode 2) to fix the code. **After each round, update the plan file's `## Review Log` section the same way.**
8. **Summary** — before reporting, batch-process the accumulated Steering Candidates per the "Steering Evolution Mechanism." Report changed files, review history (pointing at the plan file's `## Review Log`), user-decided Decisions, **the decisions resolved via the advisor this run — as a "confirm or override" block (any surfaced after the pre-ExitPlanMode briefing, e.g. during the implementation-review loop, get their review here; per "Advisor Gate Mechanism")**, steering updates, new backlog items recorded this run (backlog writes are silent — the summary is where the user sees what accumulated), and build status.

**Key constraint**: the main agent never writes production code in either mode — Quick Fix Mode differs from Spec Mode only in the document layer (a plan file instead of spec docs), not in who implements. Plan authoring and plan fixes go through `spec-author`; code goes through `spec-implementer`.

**Mid-flow escalation**: if you find the scope exceeds Quick Fix Mode (e.g., touching 5+ files, needing a formal design doc), stop and recommend the user upgrade to Spec Mode. The plan already written can serve as a starting point for design.md.

---

### /load-spec \<feature\>

Load a feature spec and show progress.

**Steps**:

1. Load steering (product.md, tech.md, structure.md)
2. Load requirements.md, design.md, tasks.md, review-log.md (if review-log.md is missing, mark it as missing but do not abort)
3. Parse tasks.md to tally task status
4. Parse review-log.md to tally: counts of §2 Decisions, §3 Waivers, §4 False Positives, §5 Steering Updates
5. Read `.spec/backlog/BACKLOG.md` (if it exists) and count open items, noting any related to this feature
6. Show a status summary and a recommended next step

> **Note**: loading does not run verification. Verification runs only when `/create-spec` or `/update-spec` completes.
> For standalone verification, use `/verify-spec`.

**Output format**:

```
📋 Spec Context loaded: {feature}

✅ Steering Documents: product.md ✓ | tech.md ✓ | structure.md ✓
✅ Spec Files: requirements.md ✓ | design.md ✓ | tasks.md ✓ | review-log.md ✓

📊 Progress: ✅ {n} completed | 🔄 {current} in progress | ⏳ {m} pending
📒 Review Log: {n} Decisions resolved | {m} Waivers | {k} False Positives | {s} Steering Updates
📥 Backlog: {n} open ({m} related to this feature) — /backlog to review

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
6. Discuss and settle the spec direction with the user, folding the researcher's findings into design considerations; then distill the outcome into a **brief** and dispatch `spec-author` (Mode 1) to draft the plan file (hand it the harness plan-file path). When the draft returns, run the **fidelity challenge** per `review-protocol.md`
7. **(Optional) `design-reviewer` Mode A — Plan Mode sparring partner**:
   - While drafting the design direction, **proactively ask the user**: "Want to invite design-reviewer in to challenge this design?"
   - If the user agrees, invoke the `design-reviewer` agent and hand it the current design draft (it need not be finished)
   - The agent returns a **challenge list + Architecture Decisions**
   - For each Architecture Decision, **route it through the advisor gate** (the advisor settles the clear-cut technical ones; genuine user calls go to the user via AskUserQuestion) — the main agent never decides one alone (see "Advisor Gate Mechanism")
   - After revising the design direction you can resume it (this is an optional, non-mandatory loop)
   - The sparring session doesn't end here — **the same reviewer session continues into the Mode B mandatory loop** (step 11), carrying everything it already read
8. **Plan Briefing (mandatory, delivered as the turn-final message)** — **before** ExitPlanMode: per `briefing-guide.md`, with an actual use case / scenario, output "what I plan to build for this feature, the core design direction, the key trade-offs surfacing so far," ending with "does the direction match what you expected?" → **end the turn and wait for the user's reply → only then ExitPlanMode** (no tool in the same turn). This is a "direction confirmation" briefing (design isn't written yet, so it's lightweight); the full one is at the end of step 15.
9. Create the `.spec/specs/{feature}/` directory
10. Dispatch `spec-author` (Mode 1 — **resume the same session from step 6**) to write in order (it Reads each template first, then writes to the template's format):
    - `requirements.md` — template: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/requirements-template.md`
    - `design.md` — template: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/design-template.md`
    - `review-log.md` — template: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/review-log-template.md` (create the minimal skeleton; the later review loop fills in content — the main agent, not the author, maintains it from here on)

    When the author reports back, the main agent reads the documents **in full once** (later rounds read only diffs) and runs the **fidelity challenge** against the brief + plan
11. **`design-reviewer` Mode B — mandatory multi-round review (until 0 issues)**:
    - **This step is mandatory** and cannot be skipped
    - Loop start (from Round D1):
      - Round D1 spawns the `design-reviewer` (or continues the Mode A sparring session if one exists); **every later round resumes the same session via SendMessage**
      - The agent returns an issue list (Bugs / Smells / Decisions + non-blocking Steering Candidates, graded Critical/High/Medium/Low, rounds named `D{N}`)
      - **Challenge exchange (mandatory, exactly one per round)**: before acting on the list, the main agent challenges it in the reviewer session — dispute suspected false positives, probe suspected misses, question severity (per `review-protocol.md`). The reviewer's **final post-challenge list** is the round's official record; a surviving disagreement escalates as an Architecture Decision
      - **Append the final post-challenge list to `review-log.md` §1 Audit Trail, Status initially `pending`** (per `review-log-guide.md`)
      - **If there are Architecture Decisions**: route each through the advisor gate (see "Advisor Gate Mechanism") — the advisor settles the clear-cut technical ones (**write to `review-log.md` §2 as `advisor-resolved`**, surfaced at the briefing to confirm/override), and genuine user calls go to the user via AskUserQuestion (presentation format per the "Architecture Decision Presentation Discipline" section below / decision-escalation-guide.md). After either resolution, **write it to `review-log.md` §2** + update the corresponding §1 row + make a promotion judgment (hook point 2 of the "Steering Evolution Mechanism")
      - **If there are Bugs/Smells (Critical/High)**: resume the `spec-author` session (Mode 2) to fix design.md (the main agent may also invoke the researcher for supplementary research and fold the findings into the fix dispatch); once done, update that §1 row's Status to `fixed`
      - Medium/Low: **defer-and-batch** — don't ask every round; accumulate to the round where Critical/High hits zero and ask once via AskUserQuestion (per `review-protocol.md`'s "Loop convergence rules"); the batch offers three outcomes per issue — fix now / accept as-is (waiver → **write it to `review-log.md` §3** + update §1) / handle later (→ backlog item per the "Backlog Mechanism", §1 marked `backlogged`)
      - If an issue is judged a false positive after discussion → **write it to `review-log.md` §4** + update §1
      - **If there are Steering Candidates**: accumulate them (they don't count against convergence) and batch-process per the "Steering Evolution Mechanism"
      - Enter Round D{N+1} by resuming the reviewer session
    - **End the loop only when a round has 0 issues (and no accumulated pending Medium/Low)**; new Critical/High still present at Round 5 → trips the `review-protocol.md` convergence fuse — stop, run one fresh-eyes reviewer round, and report to the user
    - **100% isolation of formal docs** — design.md carries no Decisions / Waivers / round process / reviewer citations / footnote pointers at all. Express design rationale as **neutral prose** (technical constraints / codebase conventions / adverse consequences) woven into the Component descriptions. Full conventions and bad/good comparisons: `review-log-guide.md` + `review-log-bad-examples.md`
12. **Dispatch `spec-author` (same session) to write `tasks.md`** (only after design.md has converged) — template: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/tasks-template.md`
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
6. Dispatch `spec-author` (Mode 1) with a brief of the agreed changes to apply them (to requirements / design / tasks); when it reports back, run the **fidelity challenge** against the brief (per `review-protocol.md`)
7. **Steering sync check**: if the design change involves a shift in technical direction, update steering in sync
8. **design.md changed substantively → mandatory `design-reviewer` Mode B multi-round review loop (until 0 issues)** — the **same protocol** as /create-spec step 11: persistent reviewer session + per-round challenge exchange, append the final post-challenge list to review-log §1, route Architecture Decisions through the advisor gate (advisor settles clear-cut technical ones → §2 `advisor-resolved`, confirmed at the briefing; genuine user calls → two-beat AskUserQuestion) then write §2 + promotion judgment, Critical/High fixed by resuming the `spec-author` session (Mode 2), Medium/Low defer-and-batch, Steering Candidates batched, false positives to §4, new Critical/High still present at Round 5 trips the fuse, 100% isolation of formal docs. **Pure requirements wording clarification (design untouched) or pure tasks status bookkeeping may skip this loop.**
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
3. Launch `spec-implementer` agents (Mode 1) — spawn multiple independent groups in parallel within the same message; each agent receives the feature name, its task list, the `Mode 1` marker, and reads design.md via the `Design ref` field. **Keep each group's session resumable** — Stage 2 fix dispatches prefer resuming the session that owns the affected files
4. Agent reports completion → immediately update tasks.md to `[x]`
5. After all groups finish, enter Stage 2

---

#### Stage 2: Review Loop (review only, multi-round to 0 issues)

`spec-implementer`'s self-verification can't catch the "things that only blow up in production" (async race, weak-ref GC, idempotency, leak, test gap) — that's Stage 2's job.

1. Round I1 spawns `implementation-reviewer`; **every later round resumes the same session via SendMessage**. Each round it reviews the implementation from a senior engineer's perspective, producing an issue list (interpret it per `review-protocol.md`'s Quick Summary, rounds named `I{N}`). **Challenge exchange (mandatory, exactly one per round)**: before acting on the list, the main agent challenges it in the reviewer session; the **final post-challenge list** is the round's official record, and a surviving disagreement escalates as an Architecture Decision
2. **Append the final post-challenge list to `review-log.md` §1 Audit Trail, Status initially `pending`** (per `review-log-guide.md`)
3. Process the issue list (update that §1 row's Status + Resolution as soon as each issue is handled):
   - **Architecture Decisions** → route through the advisor gate (see "Advisor Gate Mechanism"): the advisor settles clear-cut technical ones (**§2 `advisor-resolved`**, confirmed at the Summary), genuine user calls → AskUserQuestion (presentation format per the "Architecture Decision Presentation Discipline" section / decision-escalation-guide.md; may trigger /update-spec) → after either resolution, **write it to `review-log.md` §2** + update §1 + make a promotion judgment (hook point 2 of the "Steering Evolution Mechanism")
   - **Critical/High Bugs/Smells** → dispatch `spec-implementer (Mode 2)` to fix, preferring to **resume the Mode 1 session whose group owns the affected files** (it remembers why the code is shaped the way it is); spawn fresh only when ownership is unclear or the session is gone (the main agent does not touch code directly) → once fixed, change that §1 row to `fixed`
   - **Medium/Low** → **defer-and-batch** — don't ask every round; accumulate to the round where Critical/High hits zero and ask once via AskUserQuestion; three outcomes per issue — fix now / accept as-is (waiver → **write it to `review-log.md` §3 Waivers** + update §1) / handle later (→ backlog item per the "Backlog Mechanism", §1 marked `backlogged`)
   - **False positive** → confirmed a false positive after discussion → **write it to `review-log.md` §4** + update §1
   - **Steering Candidates** → accumulate (they don't count against convergence) and batch-process per the "Steering Evolution Mechanism"
4. After fixes, enter Round I{N+1}, until a round has 0 issues (and no accumulated pending Medium/Low); new Critical/High still present at Round 5 → trips the `review-protocol.md` convergence fuse — stop, run one fresh-eyes reviewer round, and report to the user

**Only `spec-implementer` writes / fixes code** — the reviewer doesn't touch code, the main agent doesn't touch code (the Spec Mode rule).

**Production code discipline**: when `spec-implementer (Mode 2)` fixes code it may not leave `// WAIVED:` / `# HACK: reviewer accepted` / `# ⓘ ... — see review-log`-style review-residue comments (footnote pointers are also fully abolished). The full waiver rationale lives in `review-log.md` §3; if the code needs to explain a design choice, use a **neutral semantic comment** (system invariant / precondition / dependency pointer) that does not reveal the reviewer source. See `references/review-log-bad-examples.md` Pattern E for examples. The next round of `implementation-reviewer` will open code that violates this rule as a new Smell issue.

---

#### Stage 3: Summary

Before reporting, batch-process the accumulated Steering Candidates / findings from implementation per the "Steering Evolution Mechanism." Report: completed tasks, the implementation-reviewer multi-round history, Mode 2 fixes, user-decided Decisions, **the decisions resolved via the advisor this run — as a "confirm or override" block (per "Advisor Gate Mechanism")**, steering updates, new backlog items recorded this run (backlog writes are silent — the summary is where the user sees what accumulated), and build status. Let the user decide the next step (diff / commit / next phase / something else).

---

### /backlog [list | pick \<id\> | close \<id\> | drop \<id\>]

Manage the project backlog (`.spec/backlog/` — structure and formats per `references/backlog-guide.md`). Works in both modes; needs no steering or spec to exist.

**Steps**:

- **No argument / `list`**: read `BACKLOG.md` (the index alone answers "what's outstanding" — item files are opened only on pick). Show the open items digested per "Calibrate for Cognitive Load" (group by type; flag likely-stale items — e.g. older than a month, or whose related feature has since shipped — as prune candidates), and suggest 1–2 pickup candidates. If the directory doesn't exist or the index is empty, say so — don't create anything.
- **`pick <id>`**: open the item file, brief the user on Problem / Context / Suggested next step (use-case-driven, per `briefing-guide.md` — assume they've forgotten the original discussion). After the user confirms, mark the item `in-progress` (frontmatter + index `[~]`), then **route it like any incoming task**: decide Quick Fix Mode vs Spec Mode per `mode-selection.md` and run the normal flow — the item file's content seeds the brief. When the work completes, close the item as `done`.
- **`close <id>` / `drop <id>`**: run the three-step close rule from `backlog-guide.md` — frontmatter `status` + `resolution:` line → move the file to `archive/` → remove the index line. For `drop`, capture the user's one-sentence reason in `resolution:` (that sentence is what prevents the same idea from being re-litigated months later).

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

> **This is reached only for the Decisions the advisor gate passes through.** Every reviewer-escalated Decision first goes through the advisor (see "Advisor Gate Mechanism"): the advisor resolves the ones with a defensible technical answer (those are recorded as `advisor-resolved` and surfaced at the briefing / Summary for the user to confirm or override, never via a mid-flow AskUserQuestion), and only the genuine preference / product / irreversible calls arrive here as a two-beat AskUserQuestion.

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
- **Persistent sessions**: one reviewer session per loop, spawned at Round 1 and **resumed via SendMessage** each later round (no respawning, no re-reading); `spec-author` / `spec-implementer` sessions likewise stay alive for fix dispatches. Resume fails → fresh spawn rebuilt from review-log §1 (see `review-protocol.md`)
- **Challenge exchange**: after every round's issue list (including `0 issues` rounds), the main agent sends exactly one substantive challenge in the reviewer session — dispute false positives, probe misses, question severity; the **final post-challenge list** is the round's official record; surviving disagreements escalate as Architecture Decisions. The **fidelity challenge** (brief-vs-document drift) guards each `spec-author` handoff
- **Numbering**: accumulates across rounds within a reviewer type and never resets; **design (D) and implementation (I) accumulate independently** (always cite with the Round prefix: `D2 Smell C` / `I1 Bug A`)
- **Convergence**: the loop exits only when the reviewer outputs `0 issues` and there's no accumulated pending Medium/Low; it can't exit early with Critical/High present; **the fuse** — new Critical/High still present at Round 5 stops the loop; before reporting, spawn **one fresh reviewer instance for a single fresh-eyes round** (confirms structural problem vs. persistent-session churn), then report the structural problem + fresh-eyes verdict to the user (not counted as convergence)
- **Medium/Low defer-and-batch**: don't ask the user every round — accumulate to the round where Critical/High hits zero and ask once in a batch; each issue's outcomes are fix now / waive (review-log §3) / handle later (backlog item — waiver means "accepted, not a debt", backlog means "a debt we intend to repay")
- **Architecture Decision**: a design choice the reviewer has no consensus on → the reviewer **doesn't decide it itself**; it hands the raw material up to the main agent, which routes it through the **advisor gate** (see "Advisor Gate Mechanism") — the advisor settles the clear-cut technical ones (recorded `advisor-resolved`, pending the user's review), and genuine preference / product / irreversible calls reach the user via the two-beat AskUserQuestion
- **Steering Candidates**: the reviewer finds a project-level principle not recorded in steering → a non-blocking `SC` section (doesn't count against convergence); the main agent batch-processes it per the "Steering Evolution Mechanism"
- **Review/Fix split**: the reviewer doesn't touch code, doesn't write the review log; in the design phase the main agent resumes `spec-author (Mode 2)` to fix design.md / the plan file, in the implementation phase both modes dispatch `spec-implementer (Mode 2)` — Spec Mode prefers resuming the owning group's session, Quick Fix Mode resumes its single implementer session
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
4. **The reviewer doesn't write the log; the main agent integrates it** — the reviewer only produces the issue list; each round the main agent appends §1, updates Status once handled, and fills the corresponding subsection; after a Decision is resolved it writes §2 **and** dispatches the `spec-author` session to weave the resulting content into design.md as neutral prose

**Why even footnote pointers are forbidden**: in practice, once you allow any back door for "the formal doc just mentioning the review-log," the agent gradually degrades into writing whole ADR blocks, letter tags, round narration (the industry ADR pattern is deeply trained in). 100% zero-citation + neutral design rationale is the only reliable discipline boundary.

### Detailed conventions

- Writing conventions / ID rules / Status values / examples: `references/review-log-guide.md`
- Bad / Good comparisons (6 patterns + a general rewrite formula): `references/review-log-bad-examples.md`
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
| 3. During implementation | spec-implementer's completion report (both modes) | findings are listed in the report and the main agent collects them |

**Lightweight update path** (not the full Plan Mode of `/update-steering`):

1. Dedupe the accumulated candidates, then hand them to the user in a batch via AskUserQuestion (hook point 2 is handled at decision time; the rest are handled before Summary at the latest)
2. User confirms → the main agent Edits the corresponding steering document directly (usually tech.md / structure.md) — steering records only the principle itself (the world after decisions), not its source
3. Run the `checklists.md` "Steering completeness check" consistency check (the three docs have no contradictions)
4. Record it in review log §5 Steering Updates (principle / where written / source)

**Boundary**: this mechanism handles "add a principle / convention entry"-level increments; directional overhauls (swapping architecture patterns, changing the tech stack) still go through `/update-steering`. Quick Fix Mode applies the same way if the project already has steering.

**Backlog vs steering**: a discovery that is *a principle to follow* is a steering candidate; a discovery that is *work to do later* is a backlog item (see "Backlog Mechanism"). The two channels have opposite defaults — steering promotion is restrained and user-confirmed; backlog recording is liberal and silent — because a wrong steering entry misleads every future feature, while a wrong backlog item costs one line in a cleanup pass.

**Why immediate, but restrained**: steering goes stale gradually — if a genuinely cross-feature core convention goes unrecorded, six months later steering and the codebase have drifted apart and the alignment check is toothless, so what should be promoted should be promoted on the spot. But conversely, **over-promotion (cramming spec-specific / detail / one-off decisions into steering) is the more common failure in practice** — it dilutes the guardrails, buries the truly important clauses, and wastes the user's attention every round. Both directions must be avoided, and **the default leans restrained**: promote the few that truly run through the whole project, not something every round.

---

## Backlog Mechanism

Anything discovered mid-flow that **can't be resolved now or needs deeper discussion later** — in either mode, or in plain conversation — is recorded to the project backlog (`.spec/backlog/`) instead of dying with the session. Formats, lifecycle, and full rationale: `references/backlog-guide.md`.

**The semantic line vs waivers**: a waiver (review-log §3) means "we accept the current state — not a debt"; a backlog item means "this is a debt we intend to repay." When the user defers a Medium/Low issue, which of the two they mean decides where it's recorded (never both). A backlogged issue's review-log §1 row gets Status `backlogged` citing the item id.

**Structure** (MEMORY.md-style progressive disclosure — scan the index cheaply, open an item only when picking it up): `BACKLOG.md` is the index listing **open / in-progress items only**; each item is its own `bl-{NNNN}-{slug}.md` file with frontmatter (id / title / type / status / date / source / feature) and a body thick enough for a reader two weeks later (Problem / Context / Suggested next step). Closed items live in `archive/`.

**Write discipline — the main agent writes, silently**:

- Recording is arbiter bookkeeping (like review-log maintenance) — the main agent writes the item file + index line directly, no subagent, **no per-item confirmation** (recording is cheap and reversible; a later cleanup pass prunes noise — asking every time kills the habit). New items are surfaced in the end-of-flow Summary so the user always sees what accumulated.

| Hook point | When | What goes in |
|---|---|---|
| 1. Review Medium/Low batch | the defer-and-batch AskUserQuestion | the "handle later" outcome (vs fix-now / waive) |
| 2. Implementer report | `spec-implementer`'s completion report (both modes) | out-of-scope findings — pre-existing bugs, adjacent tech debt; the implementer reports, the main agent records |
| 3. Conversation | any moment in any flow | the user says "note this for later" / "don't block on this now", or the main agent itself spots an unresolvable-now issue worth keeping |

**Not backlog material**: things fixed on the spot; accepted-as-is decisions (→ review-log §3); project-level principles (→ Steering Evolution Mechanism).

**Close rule (one rule for done and dropped)**: update frontmatter `status` + add a `resolution:` line → move the file to `archive/` → remove the index line. Archive, don't delete — a `dropped` item's resolution ("considered X, decided no, because Y") is a lightweight ADR that stops the same idea from being re-discovered and re-litigated months later. The invariant: **`BACKLOG.md` always equals the exact set of unresolved items.**

**Consumption**: `/load-spec` shows the open count; `/backlog` lists, picks up (routing the item through normal mode selection), and closes items.

---

## Advisor Gate Mechanism

Before the main agent stops to ask the user **any** decision, it consults the **advisor** first — a stronger reviewer model that sees the full transcript. The goal is to spend the user's attention only on the choices that genuinely need a human, instead of interrupting them for every "which of these two equivalent paths" call the main agent is reluctant to make on a premium tier.

**The three-tier ladder** (run in order; drop a rung only when the one above genuinely fails):

1. **Consult the advisor.** A clear, usable answer → apply it, record it, keep working.
2. **No usable answer** (the advisor calls it a genuine user preference / product / irreversible-high-risk call, is itself uncertain, **or the advisor tool is unavailable**) → **pick the most defensible default and keep going**, recording the assumption for the briefing (if it's deferrable *work* rather than a *decision*, a backlog item is the right home).
3. **Genuinely blocking, no safe default** → stop and ask the user — today's behavior (the two-beat AskUserQuestion / the briefing).

Interrupting the user is the most expensive outcome, so it's the **last** resort, not the reflex.

**What the advisor resolves vs passes through**: it settles decisions with a defensible technical answer (codebase consistency, the standard idiom, disambiguating an unclear requirement); it passes through genuine preference / product / business-priority calls, irreversible / high-blast-radius choices (schema migration, data loss, external API contract, security posture), and anything it flags as uncertain. When you consult it, ask both "what would you do" and "is this yours to resolve or the user's".

**This refines Principle #5, it doesn't replace it.** The reviewer still never resolves an Architecture Decision itself — it hands the raw material up unchanged. What changes is only what the *main agent* does on receipt: it routes through this gate instead of going straight to `AskUserQuestion`. The clear-cut technical Decisions the advisor settles; the genuine user calls arrive at the same two-beat `AskUserQuestion` as always.

**Graceful degradation**: the advisor tool isn't guaranteed to exist, and a call can error. Attempt the consult; on **absent / disabled / error**, treat it as tier-1 producing no answer and fall through. **When the advisor is unavailable the behavior collapses to exactly today's** — defer where safe, otherwise ask. The gate only ever *reduces* interruptions; it never makes the user worse off.

**What it does NOT intercept**: Plan / Spec briefings and the ExitPlanMode approval stay with the user (the advisor is a technical reviewer, not the product owner — it can't sign off on *what gets built*); the convergence fuse still reports to the user. The advisor absorbs *decisions taken along the way*; the user keeps *approving the plan* and *the escalations that mean something is structurally wrong*.

**Recording (silent, reuses review-log)**: an advisor-resolved decision is a decision made on the user's behalf, so it lands in `review-log.md` §2 tagged **`[advisor-resolved · pending your review]`** with rationale attributed **`(advisor, YYYY-MM-DD)`**; its §1 Audit Trail row Status is **`advisor-resolved`**. Quick Fix Mode uses the plan file's embedded `## Review Log`. No per-decision confirmation (that would reintroduce the interruption the gate removes) — the confirmation happens in one batch at the briefing.

**Surfacing (the safety valve)**: every briefing and Summary includes a **"Decisions I resolved via the advisor — confirm or override"** block (each as a one-line scenario-grounded consequence citing its §2 letter). The user can override any of them in their reply — an override is then handled like a fresh user Decision (re-record §2 with `(user, date)`, drop the `pending` tag, reflect into design.md as neutral prose via `spec-author`). This one consolidated review point is what makes autonomous resolution safe.

**Detailed guide**: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/advisor-gate-guide.md`.

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
| Review still has new Critical/High after 5 straight rounds | Trip the convergence fuse: stop the loop, spawn one fresh reviewer for a single fresh-eyes round, gather the cross-round pattern + fresh-eyes verdict, report the structural problem to the user |
| Agent communication failure | Retry once; if it still fails, escalate the report |
| Circular dependency detected | Stop execution and report the problem |
| design.md missing or incomplete | Ask for clarification, then continue |

> **Every row above that stops to ask or clarify runs through the Advisor Gate first** (consult the advisor → defer-and-continue → ask the user), per the "Advisor Gate Mechanism." The verification-failure / design-flaw / missing-doc pauses are exactly the mid-flow "what next" stops the gate is meant to absorb — when the advisor can settle them or a safe default exists, the user isn't interrupted; when the advisor is unavailable, the handling above is unchanged.

---

## Model Economy for Exploration

The generator/arbiter split (Principle #10) moves long-form **generation** off the premium session model onto a deliberate cheaper tier. The same reasoning applies to **reading**: broad codebase exploration — sweeping many files to locate something, map a subsystem, or trace callers before distilling a brief — is bulk work whose cost is driven by how much gets read, not by how much judgment it needs. When the main agent (or any subagent) fans that out to a built-in `Explore` / `general-purpose` agent, that agent **inherits the session model by default** — which may be the session's top tier (e.g. Fable). A broad sweep on the top tier burns tokens out of all proportion to the judgment it actually requires.

So whenever you delegate a broad search to a built-in exploration agent, **pin its model explicitly instead of letting it inherit**:

| Search shape | Pin | Examples |
|---|---|---|
| Simple / mechanical | `model: sonnet` | locate a file, find a symbol's definition, enumerate callers, grep-style pattern hunts across the tree |
| Needs reasoning / synthesis | `model: opus` | understand how a subsystem fits together, judge which of several candidates is the real one, summarize a design spanning many files |

The ceiling is **opus** — never let a broad sweep ride the session's top tier by default. Simple searches drop to sonnet; searches that must reason cap at opus.

**A known target needs no subagent at all.** When you already know the file or symbol, read it directly (codebase-memory MCP graph tools / a targeted `Grep` + `Read`). Spawning an agent to fetch one known thing pays the agent's fixed startup overhead for nothing.

**Why a cheaper sweep is safe here**: the initial exploration is for orientation, not the last word. The downstream review loop re-reads the code on opus and the per-round challenge backstops it, so a slightly shallower cheap-tier sweep gets caught long before it can mislead the design.

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
10. **Generation in Subagents, Arbitration in the Main Agent** — the main agent (top-tier model) converses, distills briefs, challenges, escalates, and keeps the review log; long-form generation (plans, spec docs, code, reviews) runs in **persistent subagent sessions** on a cheaper tier, resumed across rounds via SendMessage. The mandatory challenge exchange is what keeps the cheaper generation trustworthy (see `review-protocol.md`). The same tier discipline extends to **reading**: broad codebase exploration is delegated to a built-in agent on a **pinned** cheaper tier (sonnet for mechanical search, opus at most), never left to inherit the session's top model — see "Model Economy for Exploration"
11. **Implementation by Agent Only** — the main agent is forbidden from writing production code in either mode; it must dispatch `spec-implementer` (Spec Mode: tasks.md-driven; Quick Fix Mode: plan-file-driven)
12. **Backlog the Unresolved** — anything discovered mid-flow that can't be handled now or needs deeper discussion later is recorded to `.spec/backlog/` by the main agent, silently (recording is cheap and reversible; the Summary surfaces what accumulated). A deferred issue is a debt to repay — distinct from a waiver, which accepts the current state (see "Backlog Mechanism")
13. **Consult the Advisor Before Asking** — before stopping to ask the user any decision, consult the advisor first; it resolves the calls with a defensible technical answer (recorded to review-log §2 as `advisor-resolved`, pending the user's review), and only genuine preference / product / irreversible calls pass through to the user. Interrupting the user is the last resort, after "advisor" and "defer-and-continue," not the reflex. Degrades to exactly today's behavior when the advisor is unavailable; never intercepts the briefings / ExitPlanMode approval (refines #5 — see "Advisor Gate Mechanism")

**Spec Mode specific**:
14. **No Steering, No Spec Mode** — steering must exist before entering Spec Mode, and it evolves continuously with the project
15. **Design is Truth** — design.md is the single source of truth

**Quick Fix Mode specific**:
16. **Plan File is Truth** — the plan file is the source of truth (including its embedded `## Review Log` section; the path is confirmed at EnterPlanMode, and the file lives outside the repo)
17. **Escalate When Scope Grows** — when the scope is found to exceed range, stop and recommend upgrading to Spec Mode

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
| `references/review-log-bad-examples.md` | Bad / Good comparisons of the 6 review-residue patterns + a general rewrite formula |
| `references/decision-escalation-guide.md` | Architecture Decision Presentation Discipline (including writing to review log §2 after a decision + neutralized reflection in design.md) |
| `references/advisor-gate-guide.md` | Advisor Gate — consult the advisor before interrupting the user; the three-tier ladder, triage criteria, graceful degradation, recording advisor-resolved decisions, surfacing them at the briefing |
| `references/briefing-guide.md` | Spec / Plan Briefing guide (conversational summary before implementation — trigger timing / content structure / cognitive calibration) |
| `references/backlog-guide.md` | Backlog formats and lifecycle (index + item files / write hook points / close rule / backlog-vs-waiver semantics) |
| `templates/review-log-template.md` | The minimal review-log.md skeleton (used by /create-spec and Quick Fix Mode) |

All paths are prefixed with: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/`
