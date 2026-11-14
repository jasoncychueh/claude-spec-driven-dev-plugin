---
name: spec-driven-development
description: "Disciplined development workflow with multi-round architecture review loops. MUST use for any task that writes or modifies code — bug fixes, refactors, config tweaks, new features, anything (sole exception: trivial pure-text edits like a README typo). Auto-routes: (a) Quick Fix Mode for bug fixes / refactors / small extensions — Plan Mode + mandatory review loops, no spec docs; (b) Spec Mode for new features / large refactors / cross-component work — full steering + requirements + design + tasks docs before implementation. Both modes run design-reviewer and implementation-reviewer loops until 0 issues — non-negotiable regardless of task size. Steering docs are living: review loops surface unrecorded project principles for user-confirmed promotion into steering. Triggers: fix bug / refactor / add feature / change behavior / modify config / create or edit spec / implement feature. Deferred discoveries — issues found mid-flow that can't be resolved now — are recorded silently to the project backlog (.spec/backlog/) so nothing is lost to session end. Work picked out of the backlog is scheduled on a roadmap tree (.spec/roadmap/) — architecture-shaped, ordered, dependency-aware — queried and edited through a script rather than read as Markdown. Also use when asked about steering / requirements / design / tasks docs, the backlog / recording something for later, the roadmap / what to work on next, /create-spec, /implement, /load-spec, /verify-spec, /backlog, /roadmap."
---

# Spec-Driven Development

Two routing modes, both backed by multi-round architecture review: **Quick Fix Mode** (bug fix / refactor / small extension) runs Plan Mode plus review loops; **Spec Mode** (new feature / large refactor / cross-component) writes steering and spec docs before implementation. In either mode the `design-reviewer` and `implementation-reviewer` loops run until 0 issues. Review is the quality line of defense, so it does not bend for task size.

The main agent is orchestrator, arbiter and the user's single interlocutor: it discusses requirements, distills briefs, challenges subagent conclusions, escalates decisions and maintains the review log. It never writes production code or long-form documents, in either mode. Long-form generation lives in persistent subagent sessions, each tier pinned in its agent's frontmatter: `spec-author` and the two reviewers on opus at medium effort, `spec-implementer` and `spec-verifier` on sonnet at high, `spec-tester` and `tasks-design-verifier` on haiku at xhigh, `spec-researcher` on haiku at high. A session is spawned once per loop and resumed via SendMessage across rounds, so nothing already in its context is re-read. A resume is justified by a named asset (tacit knowledge, or a corpus this dispatch re-reads), not by the session merely existing; and a new spec, a new quick fix or an unrelated task always spawns fresh (`review-protocol.md` "Persistent sessions"). The arbiter's per-round scrutiny, with a challenge when the round warrants one, is what keeps review deep at whatever effort it runs (`review-protocol.md` "Persistent sessions and the challenge exchange").

Reference paths in this file, and every path inside the reference and template files, are relative to `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/` (those files are read as plain text, so the variable would not be filled in there). The "Reference Documents" table at the end says when to read each one.

## Route first (before anything else)

On any request to write or modify code, decide the mode first (`references/mode-selection.md`):

| Signal | Mode |
|---|---|
| bug fix / refactor / small extension / typo / config change | **Quick Fix Mode** |
| new feature / large refactor / cross-component / introduces a new concept | **Spec Mode** |
| unsure | the main agent decides and tells the user; the user can adjust |

Then tell the user which route you are taking and why, e.g. "I'm planning to run this as a quick fix — scope is a single-component bug fix. Tell me if you'd rather go through the spec-level flow."

Quick Fix Mode runs its flow directly (below). Spec Mode needs steering: without it, the create-steering flow runs first; then `/create-spec` (or `/load-spec`) → `/implement`.

## Flows and commands

The flows below are named like commands (`/create-spec`, `/implement` …) because the docs refer to them by those names, but **only the four marked "slash" are typed commands**. The rest start from what the user asks for, in plain words: the main agent recognizes the request and runs the flow.

| Flow | Starts when | Description | Where |
|------|------|------|------|
| `/create-spec <feature>` | the user asks for a new feature (Spec Mode route) | Create the three spec documents for a feature | below |
| `/update-spec <feature>` | the user asks to change a feature that has a spec | Update a feature spec | below |
| `/implement <feature>` | the user asks to build a feature whose spec is approved | Implement it phase by phase | below |
| `/load-spec <feature>` | the user asks where a feature stands | Load a spec and show its progress (no verification) | `references/commands.md` |
| `/verify-spec <feature>` | the user asks to check a spec | Spec completeness + tasks vs design alignment | `references/commands.md` |
| `/create-steering` | Spec Mode is needed and `.spec/steering/` doesn't exist, or the user asks for it | Create the three steering documents | `references/commands.md` |
| `/update-steering <type>` | the user asks to change product / tech / structure steering | Update a steering document | `references/commands.md` |
| `/backlog [args]` | slash, or the user asks about the backlog | List / pick up / close items in the unsorted backlog basket (works in both modes) | `references/commands.md` |
| `/roadmap [args]` | slash, or the user asks about the roadmap or what to do next | Show the scheduled roadmap tree, what can start next, and promote items onto it | `references/commands.md` |
| `/design-view [feature]` | slash, or the user asks to see the designs | Serve the visual designs locally and open them in the browser: one feature's canvas, or a home page of every design (either mode, but not inside Quick Fix Plan Mode, where the background server and the viewer install cannot run) | `references/commands.md` |
| `/advise [topic]` | slash only | Form a position, take it to the advisor, then answer | `commands/advise.md` |

Read `references/commands.md` when one of the flows it holds starts, whether by slash command or by request.

---

## File Structure

```
.spec/steering/          # project level
├── product.md           # Product vision, target users, success metrics
├── tech.md              # Tech stack, architecture patterns, deployment
└── structure.md         # Directory layout, naming conventions, module boundaries
```

```
.spec/specs/{feature}/   # feature level
├── requirements.md      # User Story + Acceptance Criteria
├── design.md            # Architecture, component boundaries, data models: the intent layer (the contract during a change; code is the truth after)
├── tasks.md             # Executable task list
└── review-log.md        # Record of the review/resolve process (audit trail / decision / waiver / FP / steering updates)
```

The formal docs (r/d/t/code) describe the world after decisions; review-log.md describes why it is this world, what was rejected along the way, and which principles were deliberately waived ("Review Log Mechanism" below).

### Backlog and roadmap (project level)

```
.spec/backlog/
├── backlog.json            # the ticket registry — every ticket's record, open or closed, never deleted
├── bl-a3f9c1-{slug}.md     # one body per open ticket — long-form content, no frontmatter
└── archive/                # bodies of closed tickets
.spec/roadmap/
└── roadmap.json            # structure only — the tree of scheduled work, referencing tickets by id
```

The backlog is the unsorted basket for anything found mid-flow that can't be resolved now; the roadmap is the work picked out of it and scheduled (placed in the architecture, ordered, with dependencies). `backlog.json` holds every ticket's record, `roadmap.json` holds only structure and references tickets by id, the basket is the open tickets no node references, and `promote` adds a reference and moves nothing. Both are read and written only through the board script, which always operates on the main worktree's copy:

**Board command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/board.mjs"`** — the references abbreviate it as `board`. Use this path exactly as it appears here; the variable is resolved when this skill loads, and is **not** set in the shell, so never type `${CLAUDE_PLUGIN_ROOT}` into a Bash call.

### Visual designs (feature level)

```
.spec/design/
├── _viewer/                # the Design type's runtime and authoring format, installed from a canvas you own; ignored by its own .gitignore
│   ├── viewer.json         # the installed runtime's build stamp, whether the authoring format came with it, and the canvas it came from
│   └── mirrors.json        # yours only: the claude.ai artifact each design was last published to
└── {feature}/              # the design: the canvas's own files at their published paths
    ├── project/canvas.json # board placement and order
    └── project/*.dc.html   # one per board
```

For a feature with UI, the boards are the visual contract of what a change alters, drawn by the agents into the repo and committed like a spec. One script serves them offline; it always resolves the feature directories in the current worktree and `_viewer/` in the main worktree.

**Design command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/design.mjs"`** — use this path exactly as it appears here; the variable is resolved when this skill loads, and is **not** set in the shell, so never type `${CLAUDE_PLUGIN_ROOT}` into a Bash call. Subcommands: `list`, `install-viewer --from <dir> --source <url>`, `set-mirror <feature> <url>`, `view [<feature>] [--port <n>] [--no-open]`. See "Visual Design" below.

---

## Agents

| Agent | Purpose | Trigger | Action |
|-------|------|---------|------|
| `spec-researcher` | Search existing solutions, libraries, best practices | /create-spec planning phase | review only |
| `spec-verifier` | Verify spec file **completeness and format** (cookie-cutter check) | /verify-spec Stage 1, /create-spec | review only |
| `tasks-design-verifier` | Verify **alignment** between tasks.md and design.md | /verify-spec Stage 2, /create-spec, /update-spec | review only |
| `spec-author` | Author / revise planning & spec docs per the main agent's brief (two modes; **persistent session** across the authoring + review cycle) | the plan file (Quick Fix Mode's Plan Mode; the /create-spec planning phase); /create-spec + /update-spec (requirements/design/tasks); drawing or redrawing a UI feature's design in the /create-spec or /update-spec planning phase; design-review fix dispatch (Mode 2); **approach settlement** — diagnosing an implementation issue whose root cause or direction isn't settled, and writing the resolved approach into the design basis | **writes / fixes docs** (never code, including during diagnosis) |
| `design-reviewer` | Review **design quality** from a senior engineer's perspective (multi-round to 0 issues) | /create-spec planning phase (Mode A, optional) and design phase (Mode B); /update-spec when design changes; Quick Fix Mode reviewing the plan file | review only (produces issue list) |
| `spec-implementer` | Write / fix code + self-verify + build (two modes; **persistent session** across the implementation + review cycle) | /implement Stage 1 + Quick Fix implement step (Mode 1); taking a reviewer issue list, or a `spec-author`-settled approach, to implement (Mode 2) | **write / fix code** |
| `spec-tester` | Write / fix **test code** from design.md: unit tests from the public interfaces, plus the Test Cases table's integration and E2E rows (two modes; **persistent session**) — dispatched **in parallel with `spec-implementer` and blind to the code it is writing** | /implement Stage 1, alongside the implementer groups (Mode 1); test issues from the review loop (Mode 2). **Spec Mode only** — in Quick Fix Mode the implementer writes the tests the plan lists | **writes / fixes tests** (never production code) |
| `implementation-reviewer` | Review **implementation quality and the test suite** from a senior engineer's perspective (multi-round to 0 issues) | /implement Stage 2; after Quick Fix Mode implementation | review only (produces issue list) |

---

## Quick Fix Mode (no slash command; the main agent auto-routes)

For a task that meets the Quick Fix bar (`mode-selection.md`), run the steps below. No steering / requirements / design / tasks documents are created.

**Upfront declaration**: first tell the user "I'm planning to run this as a quick fix, because {basis for the call}. Let me know if you need the spec-level flow."

1. **EnterPlanMode.** Confirm the actual path of this run's plan file (Claude Code usually creates it; if the environment provides none, `spec-author` creates `~/.claude/plans/<slug>.md`). Plan files never live inside the repo. If the project has `.spec/steering/`, load it too: the reviewer checks steering alignment, and new conventions go through the Steering Evolution Mechanism.
2. **Dispatch the plan draft to `spec-author` (Mode 1)** with a brief distilled from the discussion (context, decided direction, constraints, steering pointers) and the plan file's absolute path. The author writes per `plan-content-guide.md` (substance, no process narration), applies `design-principles.md` as it designs, and ends the plan with a `## Review Log` section using the five-block skeleton of `templates/review-log-template.md`; in Quick Fix Mode the review log lives in the plan file, not a separate file. Read the draft in full and run the **fidelity challenge** (`review-protocol.md`): drift from the brief → one exchange in the author session. The plan is the implementer's only design basis, so per file it states the behavior change, the contract others rely on, and the tests as behaviors to verify; the internals are the implementer's (`plan-content-guide.md`). Known limitation: in Plan Mode a subagent's write to the plan file can be refused; then `spec-author` writes its draft to a side file next to the plan file and the main agent copies it in.
3. **`design-reviewer` loop (mandatory)** on the plan file path, to 0 issues per `review-protocol.md`. The reviewer session stays alive across rounds (resumed via SendMessage); after each round's issue list run the **challenge exchange** before acting, and the final post-challenge list is the round's record. Medium/Low defer-and-batch; new Critical/High still present at Round 5 trips the convergence fuse. Architecture Decisions go through the advisor gate (the advisor settles clear-cut technical ones → plan-file review log `advisor-resolved`, confirmed at the briefing; genuine user calls → AskUserQuestion). Bugs/Smells → resume the `spec-author` session (Mode 2) to fix the plan file. Steering Candidates accumulate for batch handling. After each round, update the plan file's `## Review Log` per `review-log-guide.md` (a new §1 Audit Trail row; fill the Decisions / Waivers subsections).
4. **Plan Briefing (mandatory, turn-final)** after review converges and before ExitPlanMode, per `briefing-guide.md`: walk through the actual use case or bug-trigger scenario ("what happens now → what it becomes after the fix → what risk remains"), surfacing the key decisions rather than a bare concept list, and end with "anything here that doesn't match what you expected?". End the turn right after it, with no tool call (no AskUserQuestion, no ExitPlanMode), because mid-turn text before a tool call renders unreliably and the whole block can go invisible. Only after the user replies with no objection, ExitPlanMode in the next turn. If there are issues, clarify verbally or resume `spec-author` to fix the plan file, adding a review round if the design substance changes.
5. **ExitPlanMode** to submit the converged plan for approval. If the user instead leaves plan mode themselves (shift+tab) and replies, the transcript holds no ExitPlanMode approval: run `approve.mjs <label>` as the first action of the turn that answers that reply ("Planning Phase and Approval Gate"), or ask for a one-word plain-text confirmation first if you already wrote text this turn or the reply was a slash command.
6. **Dispatch the implementation to `spec-implementer` (Mode 1)**, which the approval gate allows after an approved ExitPlanMode or after the `approve.mjs` call of step 5. Hand it the plan file's absolute path as the design basis (the change list is its task list; it ignores `## Review Log`) and steering pointers if the project has steering. It implements, self-verifies and builds its own scope (`verification-scope.md`) before reporting: a build, not a test run, since tests run after the review loop (step 8). Once every implementer has reported, build the whole solution (same file). Quick Fix has no separate tester: the change list names the tests to add or change and the implementer writes them, still asserting the behavior the plan specifies, never the shape of the code just written (`testing-guide.md`). Keep the session resumable for the review loop's fixes. One session is the default, because a quick fix is usually one coherent edit and one session keeps resume simple; fan out to a second implementer only when the change list splits into 2+ areas whose files are genuinely disjoint (Spec Mode's `File:`-disjointness invariant, applied to the change list). Three or more groups means the task was mis-routed: reconsider Spec Mode.
7. **`implementation-reviewer` loop (mandatory)** to 0 issues per `review-protocol.md`, with the same persistent session and per-round challenge exchange. Bugs/Smells are triaged by rung ("Dispatching"): mechanical → resume `spec-implementer` (Mode 2) to fix the code; root cause unknown / several directions / framework or contract impact → resume `spec-author` to settle the approach into the plan file first, then the implementer implements it. Update the plan file's `## Review Log` after each round. Group and dispatch fix items per `dispatch-guide.md` "Fix dispatches fan out the same way" (with the default single implementer that is one dispatch); while `spec-author` revises the plan, don't edit its Review Log in parallel, sequence the two. Each fix dispatch builds only its own scope and runs no tests; when the loop converges, build the whole solution (`verification-scope.md`).
8. **Test run (after the review loop converges)**: run the tests yourself, scoped per `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/verification-scope.md`. The tests the plan names first, then the affected tier (the full suite only under that file's significant-risk rule); anything needing a live host last, once, only the relevant subset. A failure → resume `spec-implementer` (Mode 2) with it, build, re-run the failing tests plus the tests covering the files the fix changed, until green; then the conditional whole-solution build. Once the fix loop has converged, decide the full suite by the significant-risk rule. Tests verify the code that will ship, so they run after review has stopped changing it (as in Spec Mode Stage 3).
9. **Summary.** First batch-process the accumulated Steering Candidates (Steering Evolution Mechanism). Report: changed files; review history (pointing at the plan file's `## Review Log`); user-decided Decisions; the decisions resolved via the advisor this run as a "confirm or override" block (including any surfaced after the pre-ExitPlanMode briefing, e.g. during implementation review); steering updates; new backlog items recorded this run (backlog writes are silent, so the summary is where the user sees what accumulated); build status; and the test scope that ran (which tiers, and whether the full suite ran and why or why not).

**Key constraint**: Quick Fix Mode differs from Spec Mode only in the document layer (a plan file instead of spec docs), not in who implements. Plans and plan fixes go through `spec-author`; code goes through `spec-implementer`.

**Mid-flow escalation**: if the scope exceeds Quick Fix Mode (e.g. 5+ files, or it needs a formal design doc), stop and recommend Spec Mode to the user. The plan already written can seed design.md.

---

## /create-spec \<feature\>

**Preconditions**: steering documents exist and are complete.

1. Load the steering documents.
2. Read `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/spec-workflow.md`.
3. **Steering sync check**: does the feature's tech choice conform to tech.md? Does it introduce an undocumented technology or framework? Does the code organization conform to structure.md? On any inconsistency, update steering first, then continue.
4. **Start the planning phase**: an ordinary session, no Plan Mode ("Planning Phase and Approval Gate").
5. **Launch `spec-researcher`** in the background to search existing solutions, libraries and best practices.
6. **Settle the use cases first.** Before any design direction, agree with the user on who uses the feature and the main flows they walk, each as a user story with its main flow from trigger to outcome. They are what requirements.md records, what the briefings walk through, and what the E2E tests run, so a vague use case here becomes a vague requirement, a misdirected design and an E2E test that verifies the wrong thing. Then discuss and settle the direction with the user, folding the researcher's findings into the design considerations. Distill the outcome into a **brief** and dispatch `spec-author` (Mode 1) to draft the plan file (give it the path `~/.claude/plans/<feature>.md`; it creates the file). The plan settles the direction and the rough framework design, not the detail (`plan-content-guide.md`, "Spec Mode plan"). When the draft returns, run the **fidelity challenge** (`review-protocol.md`). For a feature with UI, when `quickstart` with intent `design` offers the Design type, the design is drawn and iterated as part of the plan per `references/visual-design.md`, and the step-8 Plan Briefing points the user at `/design-view <feature>`.
7. **(Optional) `design-reviewer` Mode A, a planning-phase sparring partner.** While drafting the direction, ask the user: "Want to invite design-reviewer in to challenge this design?" If they agree, hand it the plan file (it need not be finished). It returns a **challenge list + Architecture Decisions**, challenging the direction and the framework only, in one pass, with no Bug/Smell grading of details. Route each Architecture Decision through the advisor gate (the advisor settles clear-cut technical ones; genuine user calls go to the user via AskUserQuestion); the main agent never decides one alone. If the direction changes, resume it once more (an optional loop). A direction settled here is not re-litigated in Mode B, which reviews whether design.md realises it well. The same reviewer session continues into the Mode B loop (step 11), carrying what it already read.
8. **Plan Briefing (mandatory, turn-final)** before any spec document is written, per `briefing-guide.md`: list the use cases agreed in step 6, then with one of them, "what I plan to build, the core design direction, the key trade-offs so far", ending with "do these use cases and the direction match what you expected?". End the turn and wait for the reply, with no tool in the same turn. This lightweight briefing approves only the direction: no spec exists yet and planning dispatches no implementer, so nothing is recorded here. The full briefing, and the approval it earns, comes at step 15.
9. Create `.spec/specs/{feature}/`.
10. **Resume the same `spec-author` session from step 6** (Mode 1) to write, in order, each after reading its template:
    - `requirements.md` — `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/requirements-template.md`
    - `design.md` — `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/design-template.md`
    - `review-log.md` — `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/review-log-template.md` (the minimal skeleton; from here on the main agent, not the author, maintains it)

    When `.spec/design/<feature>/project/canvas.json` exists as design.md is written, `spec-author` writes the design.md pointer line (`references/visual-design.md`). When the author reports back, read the documents **in full once** (later rounds read only diffs) and run the fidelity challenge against the brief + plan.
11. **`design-reviewer` Mode B: mandatory multi-round review until 0 issues.** This step cannot be skipped. Each round:
    - Round D1 spawns the reviewer (or continues the Mode A session); every later round resumes the same session via SendMessage. It returns Bugs / Smells / Decisions plus non-blocking Steering Candidates, graded Critical/High/Medium/Low, rounds named `D{N}`.
    - **Challenge exchange** (scrutiny every round; at most one challenge message, when warranted): read and judge the list, and challenge in the reviewer session when the round requires it (Critical/High present, any disagreement, a convergence exit worth probing, or a list miscalibrated against the change's risk). An all-Medium/Low list of directly-verifiable items you agree with may be accepted without a challenge, recorded `accepted without challenge` (full rule in `review-protocol.md`). The final post-challenge list (or the accepted list) is the round's official record; a surviving disagreement escalates as an Architecture Decision.
    - Append that list to `review-log.md` §1 Audit Trail, Status `pending` (`review-log-guide.md`).
    - **Architecture Decisions** → the advisor gate: the advisor settles clear-cut technical ones (write `review-log.md` §2 as `advisor-resolved`, surfaced at the briefing to confirm or override); genuine user calls go to the user via AskUserQuestion, presented per `decision-escalation-guide.md`. After either resolution, write §2, update the §1 row, and make a promotion judgment (Steering Evolution hook point 2).
    - **Critical/High Bugs/Smells** → resume the `spec-author` session (Mode 2) to fix design.md (the researcher may be invoked for supplementary research, folded into the fix dispatch); then set the §1 row to `fixed`.
    - **Medium/Low** → defer-and-batch: accumulate until the round where Critical/High reaches zero and ask once via AskUserQuestion (`review-protocol.md` "Loop convergence rules"). Three outcomes per issue: fix now / accept as-is (waiver → §3, update §1) / handle later (backlog item per "Backlog Mechanism"; §1 `backlogged`). **Low never opens a round**: a round whose post-challenge list carries only Low issues ends the loop, and the Lows the user chooses to fix are applied without another review round. A Low is by definition a nit with no behavior at stake, so a re-review buys nothing; Medium still loops.
    - A false positive confirmed after discussion → §4, update §1.
    - **Steering Candidates** accumulate (they don't count against convergence) for batch processing.
    - Enter Round D{N+1} by resuming the reviewer session.

    End the loop on a round with no Critical, High or Medium issues and no accumulated pending Medium (Lows go to the end batch). New Critical/High still present at Round 5 trips the convergence fuse (`review-protocol.md`): stop, run one fresh-eyes reviewer round, report to the user. **Formal docs stay 100% isolated**: design.md carries no Decisions, Waivers, round process, reviewer citations or footnote pointers; rationale is neutral prose (technical constraints / codebase conventions / adverse consequences) woven into the Component descriptions (`review-log-guide.md`, `review-log-bad-examples.md`).
12. Once design.md has converged, have the same `spec-author` session write `tasks.md` (template `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/tasks-template.md`).
13. **`spec-verifier`**: the Spec completeness check, including the cross-file Review-Residue check that keeps inline waiver / decision blocks out of formal docs. Dispatch it **in the same message** as step 14's verifier; both are cheap, and waiting for one before starting the other buys nothing.
14. **`tasks-design-verifier`**: the Tasks vs Design alignment check. A Foundation-first finding is advisory: it comes with a suggested reorder and does not block; decide whether to resume `spec-author` to reorder tasks.md. If `spec-verifier` fails, report its failures and discard this result, because its input (the spec files) may change when the fixes land; if it passes, use both reports.
15. **Spec Briefing (mandatory, turn-final)** after both verifiers pass, per `briefing-guide.md`: walk through 1–2 actual use cases to surface the architecture highlights, new concepts, the scenario consequences of the resolved Decisions, the Waivers and their cost, and the implementation outlook, ending with "anything here that doesn't match what you expected?". State the test plan in one line: how many E2E rows, integration rows and bound interfaces, the runtime they need, and whether it is available during implementation; the user may cut rows here, the cheapest moment. For a feature with a design, name the boards changed since the Plan Briefing and point at `/design-view <feature>`. End the turn right after it. Only after the user replies with no objection is /create-spec complete, and **that confirmation is the approval the gate records**: run `approve.mjs <feature>` as the first action of the turn that answers it. If there are issues, clarify, or fix the spec (re-triggering the corresponding verifier), and run the script only after a later confirmation.

---

## /update-spec \<feature\>

Changing a completed spec is no less risky than building one, often more: it can break invariants of the original design and affect code already implemented. So when design.md changes substantively, /update-spec runs the same mandatory design-review loop as /create-spec, with the same planning-phase and end-of-flow briefings.

1. Load the steering documents.
2. Load the feature's spec documents, including review-log.md.
3. **Start the planning phase**: an ordinary session, no Plan Mode.
4. Plan the changes (which parts of r/d/t to touch, and why). When the change adds or alters what users do, settle the affected use cases with the user first, as in /create-spec step 6; optionally invite `design-reviewer` Mode A to challenge the direction. When the agreed change needs drawing, `spec-author` redraws only that part of the feature's design (or draws a first one) per `references/visual-design.md` before the Plan Briefing, which points at `/design-view <feature>`.
5. **Plan Briefing (mandatory, turn-final)** before any spec document changes, per `briefing-guide.md`: with an actual use case, "what's changing → what it becomes → where it affects the existing design and already-implemented code", ending with "anything that doesn't match what you expected?". End the turn and wait, with no tool in the same turn. This approves only the direction; there is nothing to record yet, so no approval script.
6. Dispatch `spec-author` (Mode 1) with a brief of the agreed changes to apply them to requirements / design / tasks; when it reports, run the **fidelity challenge** against the brief. The brief also carries the **reconciliation** rule ("Docs for Agents, Code as Truth"):
    - Before a design.md section becomes this change's basis, compare it, the Test Cases rows anchored to it and the requirements.md acceptance criteria it realizes with the current code (found via the `Code location` line, or the files design.md names). Where they disagree, correct that existing text to match the code first, unless the user's requested change is exactly that behavior, and report each correction.
    - Reconciliation only corrects existing text and existing rows; it never adds rows. It compares only what completed (`[x]`) tasks built: design text, Test Cases rows and acceptance criteria that only realize still-pending (`[ ]`/`[~]`) tasks are planned work, not drift, and are left as they are. In a section realized by both, doc text the code contradicts in the `[x]` part is corrected to the code, and code that simply lacks what pending tasks will add is not a disagreement.
    - Only this /update-spec's agreed change may remove or edit a row that a pending test task claims; reconciliation never does. Behavior that exists only in code stays outside the spec until a change deliberately adds it.
    - At the fidelity challenge, a correction that changes stated behavior the agreed change builds on goes back to the user before the step-8 review loop; other corrections are reported in the Spec Briefing.
    - If `.spec/design/<feature>/project/canvas.json` exists and design.md has no pointer line, the brief tells `spec-author` to add it (`references/visual-design.md`), even when the agreed change does not otherwise touch design.md.
7. **Steering sync check**: if the design change shifts technical direction, update steering in step.
8. **design.md changed substantively → the mandatory `design-reviewer` Mode B loop until 0 issues**, with the same protocol as /create-spec step 11: persistent reviewer session and per-round challenge exchange; the final post-challenge list appended to review-log §1; Architecture Decisions through the advisor gate (advisor settles clear-cut technical ones → §2 `advisor-resolved`, confirmed at the briefing; genuine user calls → two-beat AskUserQuestion), then §2 + promotion judgment; Critical/High fixed by resuming `spec-author` (Mode 2); Medium/Low defer-and-batch; Steering Candidates batched; false positives to §4; new Critical/High at Round 5 trips the fuse; formal docs 100% isolated. A pure requirements wording clarification (design untouched) or pure tasks status bookkeeping may skip this loop.
9. **Design-change impact assessment** (when implementation code exists): identify the affected scope and update tasks.md markers (affected → `[~]`, deleted → `[-]`, new tasks added); detailed flow in `checklists.md` "Design-change impact assessment". **Settle the invalidated tests in the same edit** (`testing-guide.md`): when this revision removes or redesigns a public interface, mark the test task that names it under `Interfaces:` `[~]` (rewrite against the new interface) or `[-]` (removed); when it removes a use case or an external assumption, strike that row from the Test Cases table and mark its test task the same way. A row anchored to a **use case that still stands is never struck**; if the refactor breaks it, that is a regression, not an invalidation. Deciding it here turns "which tests should die" into a recorded design decision instead of a guess by whoever later stares at a red suite.
10. Re-run the corresponding verifier: changed requirements.md → `spec-verifier` (Spec completeness, including the review-residue check); changed design.md or tasks.md → `tasks-design-verifier` (Tasks vs Design alignment). When both apply, dispatch both in the same message, with the failure rule of /create-spec steps 13–14.
11. **Spec Briefing (mandatory, turn-final)** per `briefing-guide.md`: what changed, why, the new Decisions / Waivers the review resolved, and the impact on existing tasks and implemented code (use-case-driven). When the Test Cases table changed, state the test plan in one line as in /create-spec step 15. For a feature with a design, name the boards changed since the Plan Briefing and point at `/design-view <feature>`. End the turn and wait. Only after the user confirms is /update-spec complete, and **that confirmation is the approval the gate records**: run `approve.mjs <feature>` as the first action of the turn that answers it. If there are issues, clarify or fix again (re-triggering the verifier, or an extra design-review round if needed), and run the script only after a later confirmation.

/update-spec only updates documents and task status; the code changes happen in /implement.

**Task status markers**: `[ ]` pending | `[x]` done | `[~]` needs rework (design-change impact) | `[-]` removed

---

## /implement \<feature\>

**Preconditions**: `.spec/specs/{feature}/` contains requirements.md, design.md and tasks.md. Implementation runs only through agents; the main agent does not implement code itself.

**Pre-step (drift check)**: find the spec directory's last commit (`git log -1 --format=%H -- .spec/specs/{feature}/`), then list the commits since it that touch the pending (`[ ]` / `[~]`) tasks' `File:` paths or the paths under design.md's `Code location` (`git log --oneline <that commit>..HEAD -- <paths>`; a design.md without the line uses the `File:` paths only). If any exist, stop and ask the user whether to run `/update-spec` first, listing the hit commits. It is a question, not a block: the user may continue. Measuring from the spec directory's last commit means a committed `/update-spec` or a committed phase clears it, and a false positive costs one question. If the briefing pre-step also fires, ask both in the same turn. If the spec directory has never been committed, skip the check.

**Phase by phase.** Each phase runs Stages 1–3 in full (implement, review to convergence, test to green) before the next phase starts; Stage 4 summarizes once at the end. A phase is the increment that gets verified: a defect in phase 1, such as a broken live fixture, surfaces before phases 2 and 3 are built on it, and each review round looks at one phase's diff instead of the whole feature's.

**Pre-step (briefing check)**: if this session hasn't given a spec briefing for this feature (typically /implement in a later session), first output a **condensed briefing** per `briefing-guide.md` (10–20 lines: positioning / one use-case walk-through / resolved Decisions / this run's task scope) to rebuild the user's context, as the turn-final message, and end the turn. Only after the user explicitly confirms, run `approve.mjs <feature>` (first action of that turn) and enter Stage 1. A session that already recorded the approval for this feature (the Spec Briefing confirmation that ended `/create-spec` or `/update-spec`, or an earlier condensed briefing) needs neither the briefing nor the script again.

### Stage 1: Initial Implementation

1. Take the pending tasks (`[ ]` / `[~]`) of the earliest phase that has any.
2. **Group them by this procedure; parallel is the default shape here, not an optimization.** A phase's tasks arrive as a numbered list, so one sequential batch is the path of least resistance, and it is the wrong one whenever the phase holds file-disjoint work: it serializes wall-clock time that no dependency forces. The split is mechanical, from fields tasks.md already carries:
   - **`File:` decides membership.** Tasks with disjoint `File:` sets may go in different groups; overlapping sets must share a group. This is the hard invariant: the cycle has exactly one worktree, so two implementers writing one file is last-writer-wins with no conflict marker.
   - **`After:` decides direction.** A task listing `After: n`, where n is still pending in this run, joins n's group and is ordered after it, which merges groups that `File:` alone would have kept apart. An `After:` naming a task already `[x]` imposes nothing. A pending task whose `After:` names a `[-]` task: that `After:` imposes nothing on grouping; the Tasks vs Design §3 check fails such a task before `/implement`.
   - **`Phase N` bounds the fan-out.** Group within a phase, never across one; phases are the sequencing the design already chose.
   - Ceiling of 4 groups. Below ~2 genuinely disjoint groups, one group is correct; say so rather than manufacturing a split.
   - **The phase's test tasks form their own group**, going to `spec-tester`. They write only test files, so they are disjoint from every implementation group by construction, and they don't count against the ceiling. A phase with no test tasks has no such group, but if it implements anything, that absence is a spec defect to raise before dispatching, not a phase to run untested.
3. **Spawn every group in parallel in the same message** (separate messages serialize them), as `spec-implementer` (Mode 1). A new phase's groups are fresh spawns: grouping is recomputed per phase, so resuming an old session there inherits an unrelated reading list, and its tacit knowledge is about other code (`review-protocol.md` "Name the asset"). Each agent receives the `.spec/specs/<feature>/` path, its task list and the `Mode 1` marker, and reads design.md for the contract its tasks' files touch. Keep each group's session resumable: Stage 2 fixes prefer the session that owns the affected files.
   - **Spawn `spec-tester` (Mode 1) in that same message** with its test tasks' `Interfaces:` and `Cases:`, its test file paths, and the list of source files the implementer groups are writing this cycle, marked off-limits. The tester must not read them: a test writer who sees the implementation asserts what it happens to do (the private helper, the call order, where state is parked), and those assertions die at the first refactor. Keeping it blind is what makes the suite survive, and it is why the two run in parallel rather than the tester running second.
   - **Live fixture first, when the runtime is available.** When the phase's integration or E2E tests share a fixture against a live system and that system is available during the cycle, tell the tester to stop after the fixture and one smoke test. Run the smoke test (the one test run Stage 1 allows), fix the fixture through the tester until it passes, then resume the tester for the remaining tests (`testing-guide.md`). Without this, every live test is stacked on an unverified fixture and fails together at the first run. When the runtime is not available, the tester writes its assigned rows directly and says so; the Spec Briefing has already told the user.
4. When an agent reports completion, mark its tasks `[x]` right away. Test tasks stay `[ ]` until Stage 3's run is green, because `[x]` means "implemented and verified to pass" and a Mode 1 tester's designed output is red.
5. **Stage 1 ends at a build, not a test run.** Once every group has reported, build the whole solution (`verification-scope.md`) and confirm the code builds and the tests compile / collect. Apart from a live fixture's smoke test (step 3), don't run the suite here, and don't chase the tester's red into green before review: review changes the code, so a run now tests a version that will not ship, and every failure fixed now is fixed again after the reviewer's changes. Mismatches the implementer or tester reported go into the Stage 2 dispatch as known items, not into a fix loop of their own.
6. Enter Stage 2, noting in the dispatch how many groups ran, since parallel groups are what the reviewer's cross-agent integration checks look for (`checklists.md` §1).

### Stage 2: Review Loop (review only, multi-round to 0 issues)

**Each phase's review is its own loop**: a fresh `implementation-reviewer` session (a new phase is a new diff, and the old session's anchors are about other code); round numbering continues across phases, so review-log IDs stay unique; the Round-5 convergence fuse counts the rounds of this phase's loop only.

The implementer's self-verification can't catch what only blows up in production (async race, weak-ref GC, idempotency, leak, test gap); that's this stage's job. The loop runs on builds, not test runs: each fix dispatch builds only its own scope, because the code is still moving; once the loop converges, build the whole solution, and the tests run once against the converged code in Stage 3 (all scoped per `verification-scope.md`).

1. Round I1 spawns `implementation-reviewer`; every later round resumes the same session via SendMessage. It produces an issue list (rounds named `I{N}`; interpret per `review-protocol.md`). Run the **challenge exchange** as in /create-spec step 11 (challenge when Critical/High are present, on any disagreement, on a convergence exit worth probing, or when the list is miscalibrated against the diff's risk; an all-Medium/Low list of directly-verifiable items you agree with may be accepted, recorded `accepted without challenge`). The final post-challenge list (or the accepted list) is the round's record; a surviving disagreement escalates as an Architecture Decision.
2. Append the final list to `review-log.md` §1 Audit Trail, Status `pending` (`review-log-guide.md`).
3. Process it, updating each §1 row's Status + Resolution as soon as the issue is handled:
   - **Architecture Decisions** → the advisor gate: clear-cut technical ones settled by the advisor (§2 `advisor-resolved`, confirmed at the Summary); genuine user calls → AskUserQuestion per `decision-escalation-guide.md` (may trigger /update-spec). After either, write §2, update §1, make a promotion judgment (Steering Evolution hook point 2).
   - **Critical/High Bugs/Smells** → triage by rung first ("Dispatching"). Mechanical items go to `spec-implementer` (Mode 2), preferring to resume the Mode 1 session whose group owns the affected files (it remembers why the code is shaped this way); spawn fresh only when ownership is unclear or the session is gone. Root cause unknown / several directions / framework or contract impact → `spec-author` settles the approach into design.md first, then the implementer implements it. Once fixed, set the §1 row to `fixed`. Group the round's fix items and dispatch the groups in the same message (`dispatch-guide.md` "Fix dispatches fan out the same way"). **Issues against the tests go to `spec-tester` (Mode 2)** (a missing case, a test asserting internals, a flaky or over-mocked test), resuming its Stage 1 session; the rungs apply there too.
   - **Medium/Low** → defer-and-batch until Critical/High reaches zero, then ask once via AskUserQuestion: fix now / accept as-is (waiver → §3) / handle later (backlog item; §1 `backlogged`).
   - **False positive** confirmed after discussion → §4.
   - **Steering Candidates** → accumulate (not counted against convergence) for batch processing.
4. After the fixes, enter Round I{N+1}, until a round has no Critical, High or Medium issues and no accumulated pending Medium; Lows go to the end batch and never open a round (as in /create-spec step 11). New Critical/High at Round 5 trips the convergence fuse: stop, run one fresh-eyes reviewer round, report to the user.

Only `spec-implementer` writes or fixes production code, and only `spec-tester` writes or fixes tests; neither the reviewer nor the main agent touches either. Keep the two dispatches separate even when an issue spans both: an implementer that "just fixes the test" destroys the independence the test was worth having.

**Production code discipline**: a Mode 2 fix may not leave review-residue comments (`// WAIVED:`, `# HACK: reviewer accepted`, `# ⓘ ... — see review-log`; footnote pointers are abolished too). The waiver rationale lives in `review-log.md` §3; code that needs to explain a design choice uses a neutral semantic comment (system invariant / precondition / dependency pointer) that doesn't reveal the reviewer source (`review-log-bad-examples.md` Pattern E). The next review round opens a violation as a new Medium Smell.

### Stage 3: Test Run (after the review loop converges)

The order is fixed: **implement → review loop to 0 issues → test**. Tests are the most expensive verification and the only one repeated whenever code changes; run against code the reviewer hasn't finished with, they get run twice.

1. **Run the affected tier yourself** (`verification-scope.md`): targeted tests first, then the affected modules / test projects; E2E and anything needing a live host last, once, only the relevant subset, after the faster runs are green. Expect red on a first run: the tester was told to leave its Mode 1 failures standing rather than soften an assertion, so failures are designed output.
2. **Classify each failure**:
   - The implementation is wrong → a fix dispatch to `spec-implementer`, triaged by rung.
   - The test is wrong about the contract → a fix dispatch to `spec-tester`.
   - The design basis doesn't settle which → the valuable case: two agents read the same basis and disagreed, which shows the basis is ambiguous. Route it to `spec-author` to settle in design.md, rather than picking the side that looks convenient.
3. **Fix, build, and re-run the failing tests plus the tests covering the files the fix changed** (a fix to a shared helper re-runs that helper's tests; never the whole tier again). Dispatch the run's classified fixes as groups in the same message (`dispatch-guide.md` "Fix dispatches fan out the same way"), each building only its own scope; when the fix loop converges, the conditional whole-solution build runs (`verification-scope.md`). The full-suite decision is made once, after the last phase's affected run is green and its fix loop has converged: by the significant-risk rule in `verification-scope.md`, run it once at the end only if skipping it carries significant risk, and not again after. No extra review round: a fix here is small, and the failing test verifies it. A failure whose settlement changed the design (it went to `spec-author`) is design work, and its code change goes through the review loop like any other (the post-convergence whole-solution build runs again when that loop converges).
4. **Repeat classify → fix → build → re-run until green**, then mark the test tasks `[x]`. A run that won't converge is a thrashing signal and escalates by rung.
5. If tasks.md has a later phase with pending tasks, return to Stage 1 for it; otherwise go to Stage 4.

### Stage 4: Summary

First batch-process the accumulated Steering Candidates and implementation findings (Steering Evolution Mechanism). Report: completed tasks; the implementation-review history; Mode 2 fixes; user-decided Decisions; the decisions resolved via the advisor this run as a "confirm or override" block; steering updates; new backlog items recorded this run (backlog writes are silent, so the summary is where the user sees what accumulated); build status; and the test scope that ran (which tiers, and whether the full suite ran and why or why not). If the work ran in a dedicated worktree, its cleanup after merge (worktree removed, branch deleted) is part of Done (`dispatch-guide.md` "Worktree Lifecycle"). Let the user choose the next step (diff / commit / next phase / something else).

---

## Planning Phase and Approval Gate (no code before the user approves)

**Spec Mode does not use the harness Plan Mode.** `/create-spec`, `/update-spec`, `/create-steering` and `/update-steering` plan in an ordinary session with the same steps Plan Mode held: discuss with the user, optionally `design-reviewer` Mode A, the Plan Briefing as the turn-final message, wait for the user. Only `/create-spec` drafts a plan file, written by `spec-author` outside the repo at `~/.claude/plans/<slug>.md`, the path the main agent gives in the dispatch. `/update-spec`, `/create-steering` and `/update-steering` plan by discussion and the briefing alone (Mode A for `/update-spec` gets the proposed changes and the current `design.md`). The session is not read-only, so roadmap writes (`board.mjs`), Artifact publishing and subagents writing the plan file all work while planning. **Quick Fix Mode keeps Plan Mode** (EnterPlanMode, Plan Briefing, ExitPlanMode approval).

What Plan Mode really protected was "no code before approval", so the hook `hooks/approval-gate.js` denies a spawn of `spec-implementer` or `spec-tester`, the skill's code-writing delegates, until the transcript shows the user approved: an approved ExitPlanMode (Quick Fix), or the approval script run right after the user's reply to a briefing. A later plan-mode entry (EnterPlanMode, or the user's shift+tab) voids earlier evidence, so a new plan cycle needs a new approval. The gate does not bind an approval to a particular plan, so brief and confirm each one as the flows require. Mechanics (what counts as evidence and as a reply, what passes untouched, fail-open, headless runs): `references/approval-gate.md`.

**Approval command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/approve.mjs" <label>`** — the same rule as the board command: use this path exactly as it appears here; the variable is resolved when this skill loads and is not set in the shell. `<label>` is a free-form record of what was approved (the feature name, the plan file's path or its slug; quote it if it has spaces). The script checks only that a label is present and prints one line; it writes nothing, and the call itself, recorded in the transcript, is the approval record.

- Run it only in the turn that answers the user's **explicit** confirmation of the final Spec Briefing that ends `/create-spec` or `/update-spec`, of the `/implement` condensed briefing in a new session, or of a Quick Fix briefing when the user left plan mode manually. A hedge, a question or an objection is not a confirmation, and the hook cannot read the reply, so this judgment is yours. The planning-phase Plan Briefing approves only the direction and does not trigger the script.
- Run it as the **first action of that turn, before any text**: the hook cannot tell a trailing acknowledgement from a briefing written in the same turn, so any text first voids the evidence and the user must confirm again. If you already wrote text this turn, or the user answered with a slash command, ask for a one-word plain-text confirmation and run the script as the first action of the next turn.
- A deny means the approval hasn't happened: deliver the briefing and wait for the user, never run the script to get past it. Steering commands dispatch no implementer or tester, so they have no approval step.

---

## Docs for Agents, Code as Truth

This section is the one home for two rules; other files point here instead of restating them.

**Two layers.** The doc layer (steering, specs, plan files, review logs) is written for agents: it keeps agents oriented in the architecture across many features and stops duplicated logic from accreting. The communication layer (briefings, and every message to the user, per "Calibrate for Cognitive Load") is written for humans. Humans steer through the communication layer, and the review loops to 0 issues are what let them skip reading every doc. Two guardrails:

- **"For agents" never means verbose.** Docs are precise, easy to navigate and non-redundant, and say each thing once (cross-reference instead of copying), because an agent's context is finite and paid for.
- **Docs stay human-auditable.** Plain Markdown prose and tables; no agent-only encodings. A human who comes back to audit a doc when something goes wrong can read it.

**Code is the system's truth.** While a change is planned and implemented, its spec or plan file is the intent contract: the implementer follows it, the reviewer checks fidelity against it, and a mismatch is fixed in the code, or the basis is corrected by `spec-author`. What the implementer follows and the reviewer checks is the **contract**, defined here and nowhere else:

1. Public interfaces.
2. Data that crosses a boundary or persists.
3. Error behavior.
4. The behavior the Test Cases table (or the plan's tests) specifies.
5. The Test Approach seams the blind tester depends on: injection points, clock control, observable state.
6. Any internal shared across components or task groups (already a boundary per the design-template Altitude rule).
7. The decisions the design states, judged by function, not by label. A sentence binds when changing it would break an invariant, an ordering, a key or a writer that another component, the tester or a requirement relies on. This is the set the design.md boundary-contract item names ("processing flow where the flow is itself a decision"). Walk-throughs and illustrative prose do not bind. Together with the no-restated-internals rule: decisions bind, descriptions don't.

Fidelity is judged at the contract. Everything else is the implementer's: the unshared internals and the approach. Departing from a design's description of them is not a fidelity defect. Tie-break: when the implementer cannot tell whether a sentence is a decision or a description, it is a boundary question and gets a blocker report. It is never decided and noted as an internal one.

One exception is stated here, and only here. Two things bind as written, internals included: an approach `spec-author` settles in response to an escalated issue (the rung 3 and rung 4 settlements of "The fix escalation ladder", `references/dispatch-guide.md`), and the mechanism a Quick Fix plan states and justifies to remove the root cause its Context names. Nothing else in an initial plan or design.md binds beyond the contract.

The reason: the tester writes against the contract blind, so a vague contract makes tests and code disagree, while unshared internals are left free because the code records them. Every other file points to this definition ("the contract as SKILL.md 'Docs for Agents, Code as Truth' defines it", with the `${CLAUDE_PLUGIN_ROOT}` path for agents) and states only the operative consequence for its reader, in a line or two. The one exception is `spec-implementer`, which acts on the list item by item and carries the seven items and the tie-break word for word, under a line naming this section as their home.

Once the change ships, the code, tests included, is the truth of what the system is. Spec docs keep only the **intent layer**: intent, boundaries (public interfaces and the data that crosses them), decisions and their rationale, the behavior contract (the Test Cases table), and a map of where things live. They do not restate what the code already says. Tests derived from spec cases are part of the code truth: they are the executable behavior contract. design.md is therefore written at the intent / contract level from the start; there is no post-implementation distillation step.

**Which docs are the intent layer.** requirements.md and design.md. tasks.md is a record of the change it was written for, maintained only by Spec Mode flows (`/update-spec` edits, `/implement` status markers) and never corrected against code; review-log.md is a per-change record. Neither record falls under the conflict rule below.

**Conflict rule.** A reader that finds requirements.md or design.md disagreeing with the code, outside an in-flight change, treats the code as authoritative and never changes code to match the doc. It may note the conflict in its report; no backlog item is recorded. The doc is corrected at the next `/update-spec` on that spec (`/implement` asks whether to run it first); until then the code wins. Two points own that correction:

- `/update-spec` step 6: `spec-author` compares each design.md section the change builds on, with the Test Cases rows and acceptance criteria tied to it, against the current code, comparing only what completed (`[x]`) tasks built, and corrects that existing text to the code first. It never adds rows.
- `/implement` drift pre-step: before implementing, it asks the user whether to run `/update-spec` first when code under the spec has changed since the spec directory was last committed.

A Quick Fix may leave a spec behind the code; that is expected, not a defect, and it is not required to keep a spec in sync. Inside an in-flight change the order flips: a mismatch between new code and that change's design basis is a fidelity issue in the code, or a basis defect routed to `spec-author`.

---

## Mechanisms (summaries; the detail lives in the references)

### Multi-Round Review (Quick Summary)

Both reviewers share one multi-round loop; the full protocol is `references/review-protocol.md`, which the reviewers read themselves (the main agent needn't pre-read it). What the main agent does each round:

- **Severity**: Critical/High must be fixed; Medium/Low are the user's call, deferred and asked once in a batch when Critical/High reaches zero (fix now / waive → review-log §3 / handle later → backlog). A waiver means "accepted, not a debt"; a backlog item means "a debt we intend to repay".
- **Sessions**: one reviewer session per loop, resumed via SendMessage each round; `spec-author` / `spec-implementer` / `spec-tester` sessions likewise stay alive for fixes. Name the asset a resume buys, or spawn fresh; mechanical work wants a fresh executor. Retire a session at 400K of context (a `SendMessage` hook notes 300K and 400K). Size dispatches in bounded chunks with an explicit deliverable. An incomplete return is neither a finished result nor `0 issues`, nor a stall: resume it with "continue" or a narrower target, never a reading ban, and don't advance the round. A failed resume → a fresh spawn rebuilt from review-log §1.
- **Challenge exchange**: scrutiny every round; at most one challenge message, required when Critical/High are present, on any disagreement, on a convergence exit after a loop that saw Critical/High or for non-trivial scope, or when the list is miscalibrated. A manufactured challenge over trivia is a defect. Before a consequential arbitration (dismissing or downgrading a Critical/High, accepting a Critical/High-bearing list essentially unchanged, declaring convergence) consult the advisor. The fidelity challenge guards each `spec-author` handoff.
- **Numbering**: letters accumulate across rounds and never reset; design (`D{N}`) and implementation (`I{N}`) sequences are independent, so always cite with the prefix (`D2 Smell C`).
- **Convergence**: exit on a round with no Critical, High or Medium issues and no pending Medium. Low never opens a round: a Low-only round ends the loop, and the Lows the user picks are fixed without re-review. New Critical/High at Round 5 trips the fuse: one fresh-eyes reviewer round, then report the structural problem to the user (not convergence).
- **Review/fix split**: reviewers only produce issue lists and never write the log. Design fixes go to `spec-author` (Mode 2); code fixes go to `spec-implementer` (Mode 2), triaged by rung; test fixes go to `spec-tester`, never to the implementer. Architecture Decisions go through the advisor gate; Steering Candidates are batched.

### Review Log Mechanism

Every spec and every quick fix keeps a review log of the five artifacts of review: the cross-round audit trail, Architecture Decisions, Waivers, False Positives, Steering Updates. It lives in `.spec/specs/{feature}/review-log.md` (committed) or the plan file's `## Review Log` section (Quick Fix; not committed). Formal docs and production code stay 100% isolated from it (no Decision letters, round narration, waiver blocks, review-log citations or footnote pointers; rationale as neutral prose), because any back door to citing the log degrades into whole ADR blocks. The main agent, not the reviewer, maintains it after every round. Read `references/review-log-guide.md` (and `review-log-bad-examples.md`) before writing review-log entries or neutral rationale.

### Steering Evolution Mechanism

Principles that surface mid-flow are promoted when they surface, but the bar is high and the default is not to promote. Steering records project decisions; operating knowledge (commands, environment traps, required sequencing) goes to CLAUDE.md, and the probe is whether the rule can be explained without recounting an incident. Candidates arrive tagged `[steering]` / `[claude-md]` from reviewers, from Decision resolution, and from implementer reports; the main agent re-judges the tags and batch-confirms with the user before writing either destination, then records review-log §5. Read `references/steering-guide.md` "Steering Evolution Mechanism" when candidates have accumulated (before the Summary at the latest) or a resolved Decision may be project-level.

### Backlog Mechanism

Anything found mid-flow that can't be resolved now is recorded to `.spec/backlog/` instead of dying with the session, but only as the residual of the triage ladder: this cycle's own problem goes back into the cycle; trivial → fix in passing; related and at most quick-fix scale → absorb by explicit scope extension, pre-existing or not; only the rest is recorded. The finder reports, the main agent adjudicates and records silently through the board script (one question per item, with a `Why deferrable` line), and the Summary surfaces what accumulated. Claim an item the moment it enters focused discussion, and release it in the same turn if the user skips it. Read `references/backlog-guide.md` before recording, claiming or closing an item, and `references/roadmap-guide.md` before scheduling one.

### Advisor Gate Mechanism

Before stopping to ask the user any decision, consult the advisor, a stronger reviewer that sees the full transcript: it settles calls with a defensible technical answer (recorded in review-log §2 as `advisor-resolved`, surfaced in a "confirm or override" block at the next briefing or Summary); with no usable answer, proceed on the most defensible default and record the assumption; ask the user only when genuinely blocked. Genuine preference, product and irreversible calls pass through to the user. It never intercepts the briefings, the plan approval or the convergence fuse, and it degrades to today's behavior when unavailable. The advisor is the main agent's tool only: subagents escalate to the main agent instead. Read `references/advisor-gate-guide.md` the first time a run hits a decision stop or a consequential arbitration.

### Visual Design

For a UI feature in Spec Mode, the screens are drawn as a Claude Design canvas in `.spec/design/<feature>/`, by `spec-author`, during the planning phase; a board is the contract only for what the change alters. Read `references/visual-design.md` before drawing, redrawing, installing the viewer or publishing a mirror, and when a design.md carries a `**Visual design:**` pointer line.

### Calibrate for Cognitive Load

Every output to the user (mode declaration, progress report, review conclusion, Decision escalation, briefing, summary) is digested before it is presented, because an agent can hold a far larger map than a person can absorb at once, and an overloaded user misses the point until after implementation. One lens serves review and communication alike: use cases + execution flow + data structures. Narrate with an actual use case, don't assume the user remembers earlier turns, and give just enough detail, pointing at doc sections for the rest. Full statement: `references/briefing-guide.md` "Calibrate for Cognitive Load".

### Decision presentation

A Decision that reaches the user is translated, not copied: two beats in two turns (a briefing that states the problem with a use case, delivered turn-final; then, after the reply, a short-stem AskUserQuestion), with code shown and each option covering at least architecture, consistency and functional risk. The two-beat rule applies to every AskUserQuestion in this skill (Decisions, the Medium/Low batch, steering candidates). Read `references/decision-escalation-guide.md` before escalating a Decision.

### Plan and design content

Plans and design.md carry substance, not process: context, the change list, risks, Architecture Decisions, verification, but no process narration, restated skill discipline, mode comparison, review-round estimates or Definition of Done, because the agents already know the flow. A Quick Fix plan carries the per-file contract; a Spec Mode plan settles the direction; design.md carries the detail at the contract level. `references/plan-content-guide.md` is read by `spec-author` and the reviewers.

### Dispatching

**Every executor dispatch prompt carries:**

- *"Nothing wakes you — no `run_in_background`. Run long commands in the foreground with the timeout at maximum, or poll to completion inside your turn; never end a turn waiting for a completion notification."* A subagent stops completely when its turn ends, so a backgrounded command stalls the whole line.
- For a fix dispatch, the files that executor may change (reason in `verification-scope.md`), next to the line above, since the executor reads the prompt first.
- For `spec-implementer` / `spec-tester`, the design basis (the `.spec/specs/<feature>/` path, or the plan file's absolute path), including Stage 2 and Stage 3 fix spawns. The executor works from that basis alone, so a prompt that omits it leaves the executor guessing which one governs.
- For a batch, that the list is the turn's work: *"Work the list to exhaustion in this turn — finish an item, start the next, and report only when the whole list is done or you hit a blocker."*

**Size and fan-out**: one bounded chunk per dispatch (one task group, one review round, one settled approach). File-disjoint groups go out in one message; fix items are grouped by owning session first, then by `File:`-disjointness. A broad search delegated to a built-in `Explore` / `general-purpose` agent gets a pinned model (haiku for mechanical search, opus at most, never inherited) and a line telling it not to use the advisor; a known target is read directly.

**Fix escalation ladder**: 1 mechanical → `spec-implementer` Mode 2; 2 path unclear, local scope → stepwise dispatch to the same session, serial; 3 root cause unknown, several directions, or framework / contract impact → `spec-author` settles the approach first; 4 the judgment layer already missed → the main agent diagnoses from primary evidence itself (attack the shared premise), then `spec-author` records it; 5 Round 5 fuse → the user. A blocker report routes to this classification. An executor report saying it is "waiting for the background task" is a stalled dispatch: resume it at once.

Read `references/dispatch-guide.md` before grouping fix items, when a fix isn't landing or a blocker report arrives, before delegating a broad search, and at the start and end of a worktree cycle (one cycle, one worktree, removed after merge).

### Testing

Tests come in three kinds, each with a coverage rule that also caps it, so the suite grows with the system's shape rather than with how detailed the design is: **unit** tests of our own code alone, offline: every public interface's normal result and each stated error, nothing private, derived by the tester and not listed; **integration** tests against the real external system: one per assumption about it (listed), plus each bound interface's normal result and the errors the system itself produces (derived, not listed); one **E2E** test per requirement's user story. design.md's Test Cases table lists only the assumption and E2E rows. Reviewers grade excess as well as gaps. The tester writes blind to the implementation; a live fixture is validated by a smoke run before tests are stacked on it; when a refactor turns tests red, the anchor decides what happens. Quick Fix runs the lightweight version. Read `references/testing-guide.md` when writing or reviewing a Testing Strategy or test tasks, when dispatching `spec-tester`, and when tests go red after a refactor or a design change.

### Verification Scope

Every build names a scope (executors build what they touched; only the main agent builds the whole solution, serially, at fixed points) and every test run names a tier: **targeted**, **affected** (the main scope of Stage 3 and Quick Fix step 8), or **full suite** (not by default; once, at the end, on one of four significant-risk conditions, decided by the main agent; executors never run it). The fix loop re-runs the failing tests plus those covering the changed files. Every report states the scope it ran. Detail: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/verification-scope.md`.

---

## Error Handling

| Situation | Handling |
|------|------|
| Steering doesn't exist | Block /create-spec, guide to /create-steering |
| Spec doesn't exist | Block /load-spec, guide to /create-spec |
| Tasks vs Design verification fails | Show the inconsistencies, ask how to fix |
| Design flaw found during implementation | Route it by the fix escalation ladder (`dispatch-guide.md`): a fix within the existing architecture is settled into design.md by `spec-author`; one that changes structure or a public interface goes through `/update-spec` |
| New feature inconsistent with Steering | Prompt to update steering first, then continue |
| Design change affects completed tasks | Run the implementation-sync flow, mark affected tasks `[~]` |
| Design change deletes a feature | Mark tasks `[-]`; `spec-implementer` removes the code, and the reviewer checks it is gone |
| Review finds design / implementation conflicts with steering | The reviewer opens an Architecture Decision; the user decides: fix the design or update steering (steering may be stale) |
| Review still has new Critical/High after 5 straight rounds | Trip the convergence fuse: stop the loop, spawn one fresh reviewer for a single fresh-eyes round, gather the cross-round pattern + fresh-eyes verdict, report the structural problem to the user |
| Agent communication failure | Retry once; if it still fails, escalate the report |
| Circular dependency detected | Stop execution and report the problem |
| design.md missing or incomplete | Ask for clarification, then continue |

Every row that stops to ask or clarify runs through the Advisor Gate first (advisor → defer-and-continue → ask the user). These mid-flow stops are what the gate absorbs; when the advisor is unavailable, the handling above is unchanged.

---

## Core Principles

**Shared**:
1. **Plan Before Code** — a plan first (Quick Fix: plan file / Spec: design.md).
2. **Research Before Design** — research existing solutions before designing.
3. **Self-Verify + Verify Before Deliver** — implement → review loop to 0 issues → test the converged code, in that order.
4. **Review Until Convergence** — multi-round to 0 issues, where a Low never opens another round (it goes to the end batch); honest both ways (no fake convergence, no invented issues); the Round 5 fuse escalates to the user.
5. **No Architectural Overreach** — the reviewer never decides a design choice it has no consensus on; it hands the raw material to the main agent, which routes it through the advisor gate (#13) and on to the user when it is genuinely theirs.
6. **Separate "What Is" from "Why"** — formal docs describe the world after decisions; the review log holds why (Waivers, Decisions, audit trail).
7. **Steering is Living (but restrained)** — promote a project-wide principle once the user confirms, but the default is not to promote; steering records decisions, operating knowledge goes to CLAUDE.md (`steering-guide.md`).
8. **Brief Before Build** — a conversational summary before implementation, so discussion happens at the cheapest moment (`briefing-guide.md`).
9. **Calibrate for Cognitive Load** — digest every output, narrate with use cases, don't assume the user remembers; the shared root of #8 and Decision presentation.
10. **Generation in Subagents, Arbitration in the Main Agent** — long-form work runs in persistent subagent sessions at pinned tiers; exploration runs on a pinned cheaper tier; dispatch granularity tracks path clarity; diagnosis escalates by rung (`dispatch-guide.md`).
11. **Implementation by Agent Only** — the main agent never writes production code, but it does diagnose; implementer count is mechanical (disjoint `File:` sets fan out, ≤4 groups in one message); test tasks go to `spec-tester`.
12. **Backlog the Residual, Absorb the Adjacent** — walk the triage ladder; only the honest residual is recorded, silently; a deferral is a debt, unlike a waiver (`backlog-guide.md`).
13. **Consult the Advisor Before a Consequential Call** — before asking the user and before consequentially overriding a reviewer or declaring convergence; the user is the last resort, never the reflex (refines #5; `advisor-gate-guide.md`).
14. **Tests Anchor to the Spec, Never to the Code** — unit tests to public interfaces (offline), integration tests to external assumptions and bound interfaces (against the real system), E2E tests to use cases, each kind capped by its anchor; a blind writer; the anchor decides a red test's fate (`testing-guide.md`).
15. **Don't Accrete — Design as if Built Right the First Time** — judge every change as if the design had the requirement from the start; the rules live in `design-principles.md` and fire only when a real scenario reaches them.
16. **Docs Are Written for Agents** — precise, non-redundant, human-auditable; humans steer through the communication layer ("Docs for Agents, Code as Truth").
17. **Code Is the System's Truth** — the spec or plan is the contract during a change; after it ships the code wins and the doc is corrected at the next `/update-spec` ("Docs for Agents, Code as Truth").

**Spec Mode specific**:

18. **No Steering, No Spec Mode** — steering exists before Spec Mode and evolves with the project.
19. **Design Is the Change's Contract** — design.md is the contract while a Spec Mode change is planned and implemented (#17).

**Quick Fix Mode specific**:

20. **Plan File Is the Quick Fix's Contract** — including its `## Review Log`; the path is confirmed at EnterPlanMode and the file lives outside the repo (#17).
21. **Escalate When Scope Grows** — recommend Spec Mode when scope outgrows the bar; the user decides (`mode-selection.md`). A from-scratch design much larger than the Quick Fix bar is flagged by the author and escalated as an Architecture Decision (`design-principles.md`).

---

## Reference Documents

All paths are prefixed with `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/`.

| Document | Content | Read it when |
|------|------|------|
| `references/mode-selection.md` | Quick Fix Mode vs Spec Mode criteria and up/downgrade rules | routing a request, or the scope changes mid-flow |
| `references/commands.md` | The flows of `/load-spec`, `/create-steering`, `/update-steering`, `/verify-spec`, `/backlog`, `/roadmap`, `/design-view` | one of those commands is invoked, or you are about to do what it does |
| `references/approval-gate.md` | The approval gate's mechanics: evidence, voiding, what the hook verifies, fail-open, headless runs | the gate denies a dispatch you expected to pass, or you change the hook |
| `references/plan-content-guide.md` | Plan / Design document content guide (substance vs process narration, altitude) | writing or reviewing a plan file or design.md (author, reviewers) |
| `references/steering-guide.md` | Steering writing guide, and the Steering Evolution Mechanism | `/create-steering`, `/update-steering`, or Steering Candidates to process |
| `references/spec-workflow.md` | Spec document writing workflow (Spec Mode) | `/create-spec` step 2 |
| `references/checklists.md` | All checklists (including Design Review / Implementation Review and the design-change impact assessment) | verifiers and reviewers; `/update-spec` step 9 |
| `references/design-principles.md` | The design principles and their default severities | read by the author, both reviewers, and the implementer |
| `references/verification-scope.md` | Build scope, whole-solution build points and failure routing, the targeted / affected / full-suite test tiers, the fix-loop re-run scope, the significant-risk rule, what each role may run | any build or test run (main agent, `spec-tester`, `spec-implementer`) |
| `references/testing-guide.md` | Test Anchoring: the Test Cases table, the blind tester, refactor triage of red tests, Quick Fix's lightweight version | tests go red after a refactor, a design change invalidates cases, or dispatching the tester |
| `references/dispatch-guide.md` | Model economy for exploration, dispatch granularity, fix fan-out, batch vs stepwise, why executors can't be woken, stop-instead-of-thrash, the fix escalation ladder, worktree lifecycle | grouping fixes, a fix isn't landing, a blocker report, delegating a search, starting or ending a worktree cycle |
| `references/review-protocol.md` | The reviewers' shared protocol (sessions, challenge exchange, severity, numbering, output format, convergence, main-agent responsibilities) | read by the reviewers; the main agent when a round's handling is unclear |
| `references/review-log-guide.md` | The Review Log mechanism: why, the four isolation rules, writing conventions, IDs, Status values, examples | writing review-log entries |
| `references/review-log-bad-examples.md` | Bad / Good comparisons of the 6 review-residue patterns + a general rewrite formula | writing neutral rationale, or checking for residue |
| `references/decision-escalation-guide.md` | Architecture Decision presentation (two beats, options, previews; writing §2 after a decision; neutral reflection into design.md) | escalating a Decision, a waiver batch or steering candidates to the user |
| `references/advisor-gate-guide.md` | Advisor Gate: the three-tier ladder, what it resolves vs passes through, degradation, recording and surfacing, co-arbitrating reviewer output, the main-agent-only rule | a decision stop or a consequential arbitration |
| `references/briefing-guide.md` | Calibrate for Cognitive Load, and the Spec / Plan Briefing (triggers, turn-final delivery, structure, condensed briefing) | before any briefing |
| `references/backlog-guide.md` | Backlog scope, storage, triage ladder, hook points, claiming, close rule | recording, claiming or closing a backlog item |
| `references/roadmap-guide.md` | The roadmap tree, its commands and finished-work rules | scheduling or walking roadmap work |
| `references/visual-design.md` | Visual design for UI features: availability, viewer install, drawing, snapshots, the pointer line, contract scope, publishing | a UI feature's planning phase, or a design.md with a visual-design pointer |
| `templates/review-log-template.md` | The minimal review-log.md skeleton | `/create-spec` step 10 and Quick Fix step 2 |
