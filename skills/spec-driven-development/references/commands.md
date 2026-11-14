# Flows (the less frequent ones)

The full flows for `/load-spec`, `/create-steering`, `/update-steering`, `/verify-spec`, `/backlog`, `/roadmap` and `/design-view`. The flows the main agent runs constantly (Quick Fix Mode, `/create-spec`, `/update-spec`, `/implement`) stay in SKILL.md. Only `/backlog`, `/roadmap` and `/design-view` are typed slash commands; the others start from what the user asks for in plain words (SKILL.md "Flows and commands"). Read this file when one of these flows starts, by command or by request, or when you are about to do what one of them does (list the backlog, pick a ticket, edit the roadmap, serve the designs).

> **`board` and `design` below are shorthand** for the board command and the design command stated in SKILL.md "File Structure" (`node "<plugin root>/scripts/board.mjs"`, `node "<plugin root>/scripts/design.mjs"`). Use the absolute paths SKILL.md and the slash command give, exactly. `${CLAUDE_PLUGIN_ROOT}` is **not** set in the shell — it is only substituted inside SKILL.md and the slash commands — so never type the variable into a Bash call.

---

## /load-spec \<feature\>

Load a feature spec and show progress.

**Steps**:

1. Load steering (product.md, tech.md, structure.md)
2. Load requirements.md, design.md, tasks.md, review-log.md (if review-log.md is missing, mark it as missing but do not abort)
3. Parse tasks.md to tally task status
4. Parse review-log.md to tally: counts of §2 Decisions, §3 Waivers, §4 False Positives, §5 Steering Updates
5. Run `board backlog list` and count open items, noting any whose `feature` is this one; if a roadmap exists, find the node whose `spec` is this feature (`roadmap show` / `check`) and note its status and what it waits for
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
🗺️ Roadmap: {node id} {status} (waits for {…}) — /roadmap to see the tree   ← only when a node carries this spec

🎯 Suggestion: continue with task #{next}: {description}
```

> If review-log.md is missing (an old spec not yet upgraded), the output becomes `⚠️ review-log.md does not exist — recommend creating it manually (see templates/review-log-template.md)`.

---

## /create-steering

Create the project steering documents.

**Preconditions**: none

**Flow**:
1. Read `references/steering-guide.md`
2. **Plan in an ordinary session** — no Plan Mode (see SKILL.md "Planning Phase and Approval Gate")
3. Plan the steering content and confirm it with the user before writing: a briefing as the turn-final message, then wait for the reply (no approval script — no implementer or tester follows)
4. Create the `.spec/steering/` directory
5. Write in order (first Read the template, then write to the template's format):
   - `product.md` — template: `templates/product-template.md`
   - `tech.md` — template: `templates/tech-template.md`
   - `structure.md` — template: `templates/structure-template.md`
6. Run the Steering completeness check

---

## /update-steering \<type\>

Update a steering document.

**Argument**: `type` = product | tech | structure

**Flow**:
1. Load the specified steering document
2. **Plan in an ordinary session** — no Plan Mode (see SKILL.md "Planning Phase and Approval Gate")
3. Plan the changes and confirm them with the user before applying: a briefing as the turn-final message, then wait for the reply (no approval script — no implementer or tester follows)
4. Apply the changes
5. Re-run the Steering completeness check
6. Check consistency with the other steering documents

---

## /verify-spec \<feature\>

Run Spec completeness verification and Tasks vs Design alignment verification standalone.

**Important**:
- **Stage 1 Spec completeness verification** must run via the `spec-verifier` agent
- **Stage 2 Tasks vs Design alignment check** must run via the `tasks-design-verifier` agent
- **Dispatch both verifiers in the same message.** If Stage 1 fails, report Stage 1's failures and discard the Stage 2 result (don't act on it — its input may change when Stage 1's fixes land); if Stage 1 passes, use both reports

**Steps**:

1. Confirm the `.spec/specs/{feature}/` directory exists and contains requirements.md, design.md, tasks.md, and review-log.md (a missing review-log.md is a warning but does not block verification)
2. **Stage 1: Spec completeness verification**
   - Run the completeness check via the `spec-verifier` agent
   - Verify requirements.md (content completeness + responsibility-boundary check + review-residue check)
   - Verify design.md (content completeness + boundary-contract completeness + responsibility-boundary check + review-residue check)
   - Verify tasks.md (numbering format + content completeness + review-residue check)
   - **If any item fails, report the failures** (Stage 2's result is then discarded, per the rule above)
3. **Stage 2: Tasks vs Design alignment check** (dispatched in the same message as Stage 1; its result counts only if Stage 1 passes)
   - Run the alignment check via the `tasks-design-verifier` agent
4. Show the full verification report

**Output format**: detailed format is decided by the `spec-verifier` / `tasks-design-verifier` agents (pass rate per item + a table of failing items + conclusion).

---

## /backlog [list | pick \<id\> | close \<id\> | drop \<id\>]

Manage the unsorted backlog basket (`.spec/backlog/` — scope, storage and rules per `backlog-guide.md`). Works in both modes; needs no steering or spec to exist. Every read and write is a call to `board backlog …`; never edit `backlog.json` by hand.

**Steps**:

- **No argument / `list`**: `backlog list` (the basket; `--all` adds open tickets already on the roadmap, `--closed` lists closed ones). Show the tickets digested per SKILL.md "Calibrate for Cognitive Load" (group by type; flag likely-stale items and claims — e.g. older than a month, or whose related feature has since shipped — as prune candidates; flag any item that bundles several questions as a split candidate), and suggest 1–2 pickup candidates — or, if a roadmap exists, whether an item looks ready to `promote`. An empty basket: say so, create nothing.
- **`pick <id>`**: `backlog claim <id> --branch TBD --note "under discussion"` **first, before the briefing** — the briefing and the debate that follow are already contention. If the claim is refused (exit 3), stop and report who holds it — since when, which branch, what's being done — and let the user decide (pick something else / take it over with `--force` / coordinate); never silently take it over. Then read the body (`backlog show <id>` gives its path) and brief the user on Problem / Context / Suggested next step (use-case-driven, per `briefing-guide.md` — assume they've forgotten the original discussion). Three outcomes: the user **skips** ("not now") → `backlog release <id>` in the same turn; the user **schedules** it → `promote` it onto the roadmap (see `/roadmap`); the user **proceeds now** → update the claim's branch and note (`claim --force`) as they materialize and **route it like any incoming task**: Quick Fix Mode vs Spec Mode per `mode-selection.md`, the body seeding the brief. When the work completes, `backlog close <id> --resolution "…"`.
- **`close <id>` / `drop <id>`**: `backlog close|drop <id> --resolution "…"` — the record gains a `closed` field and the body moves to `archive/`. For `drop`, the resolution is the user's one-sentence reason (that sentence is what prevents the same idea from being re-litigated months later). For a split, the resolution names where each part went.

---

## /roadmap [show \<id\> | next | promote \<id\> … | walk \<id\> | any edit]

Work with the scheduled roadmap tree (`.spec/roadmap/roadmap.json` — model and rules per `roadmap-guide.md`). Every read and write is a call to `board roadmap …` (and `board promote …`); never read or edit the JSON by hand when a command answers the question.

**Steps**:

- **No argument / `next`**: `roadmap next`. Report what can start now — the lowest-ordinal batch whose dependencies are done, with how many design questions each still has open — and, in one line each, what is next behind them and what is blocked. If no roadmap exists yet, say so and offer `roadmap init <title>` when the user wants to start one.
- **`show [<id>]`**: `roadmap show [<id>] [--full]`. For a whole tree, digest it — the layers, where the active work is, what is blocked on what — rather than pasting the output.
- **`promote <id> …`**: move a backlog item onto the tree — `promote <id> <parentNodeId> <newNodeId> [--ordinal n] [--depends …] [--summary …]`, or `promote <id> --into <nodeId>`. Agree the placement, ordinal and dependencies with the user first; the script refuses an ordinal that contradicts a dependency. Only a single-question item can be promoted — split a bundled one first (`backlog-guide.md` → "Scope").
- **`walk <id>`** — a planning discussion over one branch: take its work items top-down, and for each, expand its open design questions as child nodes, settle them one at a time with the user, and write each conclusion into the item's body **as it is reached**, setting the question `decided`. An item met during the walk that has no ticket gets one on the spot (`backlog add` + `promote --into`), listed in the summary rather than asked about individually.
- **Editing the tree** — every change has a command; hand-editing `roadmap.json` is never the way around a missing one (the script validates the whole board before it saves, the hand edit does not):
  - structure: `roadmap add <parent> <id> <title>`, `roadmap move <id> <newParent> [--before <sibling>]` (re-parent or reorder; the root is `root`), `roadmap rename <id> <newId>` (dependencies follow), `roadmap remove <id> [--force]` (unfinished branches only)
  - fields: `roadmap set <id> <field> <value>` — status, ordinal, title, summary, detail, spec, dependsOn, updated; `-` clears. History: `roadmap note <id> <text>`. The root: `roadmap root title|intro|now …`
  - tickets: `promote <ticket> --into <node>` attaches, `demote <ticket>` returns it to the basket — demote then promote to move it between nodes
  - a closed ticket's record: `backlog set <id> resolution <text>` (e.g. a commit hash that changed in a rebase)
- **Starting and finishing work**: when an item starts, `roadmap set <id> status active` and route it like any task (Quick Fix Mode / Spec Mode per `mode-selection.md`, its body as the seed; `set <id> spec <feature>` once a spec exists). When it finishes, `roadmap finish <id> --resolution "<where it landed>"` — it refuses while any design question or child item under it is unfinished, folds the settled question nodes away (their conclusions are already in the body), and archives the body; the node stays as part of the architecture. `show` folds finished parts to one line (`--done` expands). Update the root's `now` paragraph whenever the focus changes: `roadmap root now "<paragraph>" …` (`title` and `intro` likewise) — never edit `roadmap.json` by hand.

---

## /design-view [feature]

Serve the visual designs (`.spec/design/` — model and rules per `visual-design.md`) locally and open them in the browser. Works in both modes. Every call is `design …`.

**Steps**:

- **No argument**: `design view` (opens the home page listing every design). **`<feature>`**: `design view <feature>` (opens `/d/<feature>/`). Never ask which feature.
- **Start it as the main agent's own background task**: Bash with `run_in_background: true`. The main agent is woken when the task exits, so the executor ban on backgrounding does not apply here. Wait for the `Design viewer at` line with `Monitor` running an until-loop over the task's output, ending early if the task exits (then report its stderr). Give the URL to the user, and stop the server with `TaskStop` when asked.
- **A server of this session still running**: give `/d/<feature>/` on its port instead of starting another.
- **No designs**: say so. **Exit 3** (no viewer installed): offer to install it per `visual-design.md` "Installing the viewer".
- **Inside Quick Fix Plan Mode** neither the server nor the install can run; say so and offer it once the plan is approved.
