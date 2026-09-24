# Roadmap Guide

The roadmap is the project's **scheduled tree**: the work that has been picked out of the backlog basket and given a place in the architecture, an order, and its dependencies. The backlog answers "what have we noticed that we owe?"; the roadmap answers "what are we building, in what order, and what is it waiting for?"

**Why a tree and not a list**: planning a system is planning an architecture, and work items relate the way components do — this safety check is part of that motion layer, which is part of that runtime. A flat list loses that shape, so a nine-topic discussion ends up in one ticket because there was nowhere else to put the eight sub-questions. A tree gives every question a place under the work it belongs to, and lets a discussion walk the architecture top-down, settling one node at a time.

**Why a data file and a script, not a Markdown document**: the tree is edited, queried and validated far more often than it is read end to end. "What can start now?", "what is this waiting for?", "does any dependency point backwards?" are exact questions with exact answers, and a script answers them in one call where reading a long Markdown table answers them approximately. There is no committed Markdown copy — a generated file that must be re-rendered after every edit is a second copy waiting to go stale. `render` prints one on demand when a human wants a document.

---

> **`board` below is shorthand for `node "<plugin root>/scripts/board.mjs"`.** The absolute command is stated in SKILL.md ("Backlog and roadmap") and injected at session start; use it exactly. `${CLAUDE_PLUGIN_ROOT}` is **not** set in the shell — it is only substituted inside SKILL.md and the slash commands — so never type the variable into a Bash call.

## Storage

```
.spec/roadmap/
└── roadmap.json     # the tree — structure, status, order, dependencies, one-line summaries
```

Neither tickets nor long-form content live here — only structure. A node's `tickets` field holds ticket ids; each ticket's record is in `.spec/backlog/backlog.json` and its problem statement, context and discussion conclusions are in its body file, `.spec/backlog/<id>-<slug>.md`. The node carries a one-line `summary`, a short `detail`, and `notes`; anything longer belongs in the body.

All reads and writes go through the same script as the backlog, and it always operates on the **main worktree's copy** (`backlog-guide.md` → "Storage"):

```
board roadmap <command> ...
```

**Do not hand-edit `roadmap.json`** as a matter of habit — every script command validates the whole board and refuses a change that would leave a problem. If a large restructuring is genuinely easier by hand, run `roadmap format` and `check` immediately afterwards.

---

## The model

**Parent/child means "is part of".** Top-level nodes are the major layers or areas of the system; below them, their components; below those, the work.

**Two families of status**, and a node without a status is a pure grouping node:

| Family | Status | Meaning |
|---|---|---|
| Work item | `done` ✅ | finished |
| | `active` 🔄 | being worked on — the roadmap's equivalent of a backlog claim |
| | `planned` ⏳ | scheduled; has its ticket |
| | `unplanned` ❌ | known to be needed, not yet planned |
| Design question | `decided` ● | settled — the conclusion is in the parent item's body |
| | `open` ○ | not yet designed |
| | `ruling` ◇ | options laid out, waiting for the user's call |
| | `proposed` ◆ | a proposal made, waiting for confirmation |

**Design questions are children of the work item they belong to.** That is what "expanding" a work item means: when discussing it surfaces three sub-questions, they become three child nodes, each settled in turn. `next` reports how many unsettled questions an item still has, so "ready to start" never hides "not yet designed".

**`ordinal` — the order we want.** Smaller first; equal numbers can run in parallel, deliberately. Leave gaps of ten so work can be inserted without renumbering. A node without one inherits its parent's; ties break by depth (shallower first), then by position in the tree.

**`dependsOn` — what must be finished first**, technically, and it may cross branches. A node also waits for whatever its ancestors wait for — otherwise a design sub-question would show as ready while its parent is blocked.

**The two do different jobs.** `dependsOn` decides whether something *can* start; `ordinal` decides what goes *first* among the things that can. Validation enforces that they agree: a node's ordinal must be greater than every dependency's, and a node with an ordinal cannot depend on one without.

**Other fields**: `tickets` (ticket ids in `backlog.json` — set only by `promote`), `spec` (the feature spec once one exists), `summary` (one line), `detail` (where it landed, short), `updated` (set to today by any edit), `notes` (history). The root carries `title`, `intro` (what this roadmap covers) and `now` — a paragraph or two on what is currently being worked on; `roadmap root` edits them, and `show` opens with `now`.

---

## Commands

```
roadmap init <title>                         create an empty roadmap
roadmap show [id] [--full] [--done]          the tree, or one branch; finished parts fold to one line unless --done
roadmap next [--all]                         what can start now — the lowest ordinal whose dependencies are done
roadmap root [title|intro|now] [p ...]       print the root, or replace one field; one argument per paragraph, "-" clears
roadmap set <id> <field> <value>             status / ordinal / title / summary / detail / spec / dependsOn / updated; "-" clears
roadmap finish <id> --resolution <text>      a work item is done — see "Finished work"
roadmap add <parentId> <id> <title> [...]    a grouping node, a design question, or a work item with no ticket yet
roadmap move <id> <newParentId> [--before s] re-parent or reorder; the root's id is "root"
roadmap rename <id> <newId>                  change a node's id — every dependsOn on it follows
roadmap remove <id> [--force]                an unfinished branch only; --force when it has children or tickets, which return to the basket
roadmap note <id> <text>                     append a history note
roadmap render [--out <path>]                a Markdown document on demand — not committed
roadmap format                               canonical key order after a hand edit
promote <ticket> <parentId> <newNodeId> [--ordinal n] [--depends a,b] [--summary s] ...
promote <ticket> --into <nodeId>             attach a ticket to an existing node
demote <ticket>                              take an open ticket off its node, back to the basket; demote + promote --into moves it
check                                        validate backlog, roadmap and every cross-reference
```

Node ids are dotted paths that echo the tree (`l0.state.publish-on-change`), lowercase with `.` and `-`.

---

## Promoting from the basket

`promote` is the only way a ticket gets onto the roadmap, and it **adds a reference, nothing more**: a node is created (or an existing one gains the ticket id in `tickets`), while the ticket's record in `backlog.json` — title, type, date, source, feature — is untouched and its body stays where it is. The ticket simply stops showing in the basket, because the basket is the open tickets no node references. The node's title defaults to the ticket's but is the node's own: give it a short architectural name with `--title`, since ticket titles tend to carry explanations that make a tree wide. A claimed ticket arrives `active` (the claim is removed from the record — on the tree, the node's status is the claim); otherwise `planned`, unless `--status` says otherwise.

**Only a single-question item can be promoted.** An item that bundles several topics has no single place on the tree — split it first (`backlog-guide.md` → "Scope"). `promote` never converts.

Work that is born directly on the roadmap — a grouping node, a design question expanded under an item, a known-needed piece of work with no discussion yet — is added with `roadmap add` and needs no ticket. When it needs a body (the discussion starts to grow), record a ticket for it (`backlog add`) and `promote --into` the node.

---

## Working through the roadmap

The roadmap is built for **discussing the architecture one node at a time**: walk it top-down, settle each design question, and write each conclusion into the item's body as it is reached — not in a batch at the end, where the reasoning behind an early decision has already been lost.

- **During a planning walk, an item without a ticket gets one on the spot** — record it, fill its body, `promote --into` its node — and the new tickets are listed in the summary rather than asked about one by one. Tickets outside the walk follow the backlog's ordinary write discipline.
- **A design question is settled** → `set <id> status decided`, and the conclusion goes into the parent item's body. The one-line `summary` on the question node says what was decided; the body says why.
- **An item starts** → `set <id> status active` and route it like any task: Quick Fix Mode or Spec Mode per `mode-selection.md`, with the body as the seed. When a spec is opened, `set <id> spec <feature>`.
- **An item finishes** → `roadmap finish <id> --resolution "<where it landed>"` — see "Finished work". `set … status done` is refused for work items.
- **The `now` paragraph** is updated with `roadmap root now "<paragraph>" …` whenever the focus changes, so a new session reads what is in flight before it reads anything else.
- **Before choosing the next piece of work**, run `roadmap next`. It already accounts for dependencies, inherited waits and ordinals; picking by eye does not.

---

## Finished work

Finished items **stay on the tree**. A roadmap is an architecture map, and "this component exists and is done" is part of the map — a tree of only pending work would no longer show what the system has. What must not accumulate is everything *around* a finished item that has stopped carrying information, so finishing is one command that does three things:

```
roadmap finish <id> --resolution "spec publish-on-change, commit abc123"
```

1. **Refuses if anything under the item is unfinished** — an open, ruling or proposed design question, or a child work item not done. An item with an open question is not done, whatever the code says.
2. **Folds the settled design questions away.** Each was written into the item's body when it was decided, so the question nodes carry nothing the body does not; they are removed, and any tickets they held close with the item.
3. **Closes the item's tickets** — each record in `backlog.json` gains a `closed` field (`done`, today, the resolution) and each body moves from `.spec/backlog/` to `archive/`. The records are never deleted, so the node's `tickets` still resolve. The resolution also becomes the node's `detail`; any previous detail moves into `notes`.

The live backlog directory therefore holds only bodies of work still in play, and the archive answers "how did we do X?" by grep.

**Views fold what is finished.** `roadmap show` prints a finished item — or a grouping whose every work item is finished — as one line with a count of what it folds away; `--done` expands everything. `next` never lists finished work. The JSON keeps everything; only the view is quiet.

**Moving whole finished branches out of the tree** is deliberately not a command yet. Folding keeps the daily view short while the map stays whole; if a tree ever grows large enough that folding is not enough, that is the time to add an archive for branches — not before.

---

## Consumption

`/roadmap` shows the tree and what can start next; `/load-spec` shows the node a feature belongs to when one exists. A feature spec's scope should match one work item — if a spec is growing to cover two nodes, that is the same signal as a ticket bundling two questions.
