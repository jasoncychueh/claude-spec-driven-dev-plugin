# Backlog Guide

Scope rules, format conventions and lifecycle for the project backlog — the unsorted basket for anything discovered during planning, implementation, review, or plain conversation that can't be resolved now or needs deeper discussion later.

**Why it exists**: without a backlog, deferred discoveries die in three graves — a review waiver buried in one spec's review-log, an out-of-scope finding that only ever existed in an implementer's completion report, a "worth rethinking later" remark that evaporates when the session ends. The backlog gives all three a single durable home that the next session can list in one call.

**Backlog vs Waiver — the semantic line**: a waiver (review-log §3) means "we accept the current state; this is not a debt." A backlog item means "this is a debt; we intend to repay it." When the user defers a Medium/Low review issue, ask which of the two they mean — the answer decides where it's recorded. One issue never lives in both places.

**Backlog vs Roadmap — the other line**: `backlog.json` is the **ticket registry** — every ticket's record, open or closed, never deleted. The roadmap (`roadmap-guide.md`) is **structure only** — the tree of scheduled work, which references tickets by id. The **unsorted basket** is not a third store but a query: the open tickets no roadmap node references. `promote` adds a reference; it never moves or copies a record, so nothing a ticket carries can be lost on the way onto the tree, and a finished node's tickets resolve forever. A ticket's attributes live only in the registry; scheduling status lives only on the tree.

---

> **`board` below is shorthand for `node "<plugin root>/scripts/board.mjs"`.** The absolute command is stated in SKILL.md ("Backlog and roadmap") and injected at session start; use it exactly. `${CLAUDE_PLUGIN_ROOT}` is **not** set in the shell — it is only substituted inside SKILL.md and the slash commands — so never type the variable into a Bash call.

## Scope: one item, one question

**A backlog item holds exactly one question — one thing that could be decided, scheduled, or done on its own.** The test is concrete and applied at the moment of writing: *could this item, exactly as written, become one node on the roadmap?* If the honest answer is "it would need to be split first", it is already several items, and it is recorded as several.

This matters because the basket feeds the tree. An item that bundles nine topics cannot be promoted — it has no single place in the architecture, no single order, no single status — and each of its topics gets a sentence or two instead of room to grow. The failure is not visible when the item is written; it surfaces weeks later, when someone tries to schedule it or to record a discussion's conclusion in it and finds there is nowhere to put it.

- **At write time**: when a finding, a deferral, or a conversation thread touches several separable questions, record one item per question, each with its own body. Link them to each other in their bodies if they are related; relation is not a reason to merge.
- **An item found bundling several questions** (written before this rule, or grown by accretion): split it **before** it is promoted — `promote` never converts. Record each question as its own item, moving the relevant text into its body rather than rewriting it; then `drop` the original with a resolution naming where each part went ("split into bl-…, bl-…, bl-…"). The archived original keeps the mapping, so anyone who remembers the old id can follow it.
- **A body that keeps growing is fine.** One question can accumulate a long discussion; that is what the body is for. What is not fine is a body that accumulates *new questions*. When a discussion surfaces a second question, it gets its own item on the spot.

---

## Storage

`.spec/backlog/` is anchored at the **project root** (beside `.spec/steering/`, `.spec/specs/` and `.spec/roadmap/`) and is created on demand the first time an item is recorded — in **either mode**. Quick Fix Mode's plan file is ephemeral and lives outside the repo, but a backlog item is project-durable debt, so it lands in the repo even when the quick fix itself leaves no other `.spec/` artifact.

```
.spec/backlog/
├── backlog.json                # the registry: every ticket's record — open, on the roadmap, or closed
├── bl-a3f9c1-{slug}.md         # the body of an open ticket — long-form content, no frontmatter
├── bl-7d2e04-{slug}.md
└── archive/
    └── bl-91b0ff-{slug}.md     # the body of a closed ticket
```

**Records live only in `backlog.json`; long-form content lives only in the body file.** Listing, filtering, and checking claims is a script call over the JSON — fast and exact, with no Markdown to read. The body is opened only when a ticket is being discussed or picked up. Closing never deletes a record: it adds a `closed` field and moves the body into `archive/`, so `.spec/backlog/` holds exactly the bodies of work still in play while every ticket ever recorded — and every roadmap reference to it — still resolves.

**The script is the only writer.** Every operation goes through `board` (Node 18+; the plugin's hooks already require it):

```
board backlog list                 # the basket: open tickets on no roadmap node
board backlog list --all           # every open ticket, basket and roadmap
board backlog list --closed        # closed tickets — "did we already consider this?"
board backlog add "<title>" --type <type> --source "<source>" [--feature <f>] [--slug <slug>]
board backlog show <id>            # the record, where it sits on the tree, the body path
board backlog claim <id> --branch <b> --note "<what>"
board backlog release <id>
board backlog close <id> --resolution "<where it landed>"
board backlog drop <id> --resolution "<why not>"
board check
```

Every command validates the whole board first and refuses an edit that would leave a problem behind — a roadmap reference to a ticket that does not exist, a ticket on two nodes, a finished node whose ticket is still open, a missing or misplaced body, a malformed field — without saving anything. **Do not hand-edit `backlog.json`**: the script's validation is what keeps the two tables joined correctly rather than hoped to be.

**The board is always the main worktree's copy.** The script resolves the repository's main worktree through git and reads and writes the board there, even when run from inside a linked worktree. A branch's own copy of `.spec/backlog/` is stale by construction; the script never touches it.

**Ids are generated by the script** — `bl-` plus six random hex characters, checked against every recorded ticket and every body file. Random, not sequential: a counter would force every writer to read global state first, and two sessions reading concurrently would both write the same next number. Never invent an id; `add` returns the one it made.

### Ticket fields (`backlog.json`)

```json
{
  "tickets": [
    {
      "id": "bl-a3f9c1",
      "title": "Unify payment module error handling",
      "type": "tech-debt",
      "date": "2026-07-11",
      "source": "review I2 (feature: payment-sync)",
      "feature": "payment-sync",
      "claim": { "date": "2026-07-17", "branch": "feat/payment-errors", "note": "under discussion" }
    },
    {
      "id": "bl-91b0ff",
      "title": "Revisit whether the export pipeline should go async",
      "type": "design-question",
      "date": "2026-07-02",
      "source": "conversation",
      "closed": { "status": "dropped", "date": "2026-07-20", "resolution": "measured: the async gain doesn't justify the migration risk" }
    }
  ]
}
```

`type` is one of `bug` / `tech-debt` / `design-question` / `idea` by convention (a project may use its own kebab-case types). `source` says where it came from — `review I2`, `conversation`, `implementer report`, `plan discussion`. `feature` is optional. `claim` is present only while someone is working on a basket ticket — on the roadmap, the node's `active` status is the claim. `closed` is present once the ticket is closed. `legacy` holds, verbatim, any field a migration found in an old item file that the record has no slot for.

### Body file

`add` creates `bl-{hash}-{slug}.md` with four headings and prints its path; fill them in immediately. The body has no frontmatter. `--slug` gives a readable filename when the title is not ASCII.

```markdown
**Problem:** What was discovered, stated concretely — one question.

**Context:** Enough for a reader two weeks later — the files involved, why it
wasn't handled at the time, the state of any discussion (positions taken,
constraints identified). Write for someone with no memory of the conversation.

**Suggested next step:** Where to start when picking this up — and whether it
looks like a quick fix or spec-level work.

**Why deferrable:** Pre-existing: [the evidence — reproduces on base / lives in
code this cycle never touched]. Independent: [the evidence — this cycle's goal
verifies without it]. Not absorbed because: [scale — needs its own spec-level
discussion / relevance — barely adjacent to this cycle / circumstances — schedule
or risk forbade it]. (Required for implementer-finding / self-discovered items —
see "The triage ladder". For user-directed deferrals, cite the user's call instead.)
```

**Context thickness**: the test is "could a fresh session act on this without asking the user to re-explain?" Too thin and the item is a riddle; the goal is self-contained, not exhaustive — point at files and docs rather than re-pasting them.

The body carries no status, title, date or source — those are in the record, and a second copy would drift.

---

## Write discipline

### The triage ladder (run it before every write)

The backlog's failure mode is being used as an **escape hatch**: mid-execution, a bug or a gap turns out to be inconvenient, someone declares it "out of scope", opens an item, and skips it — and the skip *looks* diligent because a record was left behind. So a new discovery is **triaged, not declared**, and **the finder never adjudicates**: the implementer/reviewer reports, the main agent — who owns the cycle's goal — walks the ladder in order. The backlog is the ladder's *residual*, never its first stop.

1. **This cycle's own problem → back into the cycle, mandatory.** A defect **introduced or exposed by this cycle's changes** (that's an unfixed bug — fix it now or blocker-report it; parking it is shipping a known bug with a receipt), anything **the deliverable needs to actually work** (in scope by definition, wherever the code lives), or a **gap in this cycle's own plan/design** (a design-basis flaw → blocker report → plan/design revision → the review loop; backlogging it means knowingly implementing a flawed design).
2. **Trivial → just fix it, in passing.** Small, self-evident, no design ripple (a few lines, verifiable on sight): the main agent adds it to the current dispatch as an **explicit one-line scope extension** and the implementer fixes it. Opening a debt file for something cheaper than the file itself is process overhead inverted.
3. **Related and at most quick-fix scale → absorb it, pre-existing or not.** If the discovery is genuinely adjacent to what this cycle is touching **and** handling it stays within quick-fix scale (no new spec-level design questions, no sprawl across unrelated files), fold it into this cycle when circumstances allow (schedule/risk don't forbid it): extend the plan's change list / add a task, explicitly, so the reviewer sees it as in-scope work. Pre-existing status is irrelevant here — relevance and scale decide. The context is already loaded *now*; a backlog item pays the full re-orientation cost later for work that was one step away today.
4. **The rest → backlog.** Weakly related, or spec-scale (it needs its own requirements/design discussion), or circumstances genuinely don't allow absorption — this is the honest residual the backlog exists for.

**Absorption is explicit, never silent** — it is the main agent *extending the sanctioned scope* (plan change list / task list updated), which keeps the implementer's No Scope Creep discipline intact: the implementer still never self-absorbs; it reports, and the scope comes back extended. Absorbed extras are listed in the Summary so the user sees what the cycle grew to include.

The body must show the ladder was walked: its **Why deferrable** line states why it isn't rung 1 (pre-existing / independent — with the evidence) *and* why it wasn't absorbed at rungs 2–3 (scale / relevance / circumstances). If you cannot honestly write both, the item doesn't go in — the problem goes back up the ladder.

(Hook 1 — the user choosing "handle later" in the Medium/Low batch — is the user overriding scope themselves; it needs no triage. Hook 3 user requests likewise. The ladder guards the *self-serve* writes: implementer findings and the main agent's own discoveries.)

- **The main agent writes items directly** — like review-log maintenance, this is arbiter bookkeeping, not long-form generation; no subagent dispatch.
- **Write silently, no per-item confirmation** — recording is cheap and reversible (items can be dropped during a later cleanup pass); asking every time adds friction that kills the habit. Mention new items in the end-of-flow summary instead, so the user always sees what accumulated.
- **One question per item** — see "Scope". A single deferral that touches three questions is three `add` calls.

### Hook points (where items come from)

| Hook | When | What goes in |
|---|---|---|
| 1. Review Medium/Low batch | the defer-and-batch AskUserQuestion round | the user's third option besides fix-now / waive: "handle later" → backlog item citing the review round |
| 2. Implementer report | `spec-implementer`'s completion report (both modes) | out-of-scope findings (pre-existing bug next door, adjacent tech debt) — the implementer reports; the main agent **walks the triage ladder** (fix in passing / absorb / backlog), records only the honest residual |
| 3. Conversation | any moment in any flow | the user says "note this for later" / "let's not block on this now", or the main agent itself spots an unresolvable-now issue worth keeping |

### What does NOT go in the backlog

- **Anything the triage ladder handles above rung 4** — this cycle's own defects, anything the goal needs to work, design-basis gaps (→ back into the cycle), trivial fixes (→ fix in passing), related quick-fix-scale discoveries (→ absorb by explicit scope extension)
- Things fixed on the spot (they're just work, not debt)
- Accepted-as-is decisions → review-log §3 Waivers
- Project-level principles → Steering Evolution Mechanism
- Facts about the user or session → project memory
- Work already on the roadmap → it has a node; its discussion goes into that node's body, not a new item

---

## Claiming an item (picking it up)

Unique ids stop two sessions from *recording* the same id. They do nothing to stop two sessions from *working on the same item* — that's a separate race, and the claim is what closes it.

The claim lands **the moment the item enters focused discussion** — on `/backlog pick <id>`, that is right when the body is opened to brief the user, *before* the briefing, not after their confirmation. The discussion itself is contention: while one session briefs, debates, and plans around an item, a second session must already see it claimed.

```
board backlog claim bl-7d2e04 --branch TBD --note "under discussion"
```

The claim carries three things, and each earns its place: **the date** (is this claim minutes old or a month stale?), **the branch** (where the work lives — the reader can go look at it), and **one sentence on what's being done** (whether it overlaps with what *this* session was about to do). Update branch and note by claiming again with `--force` once they exist.

**Mark first, everything second — "the work" starts at discussion, not planning, and certainly not implementation.** A claim written after the collision window opens protects nothing — and the window opens as soon as the user engages with the item. At claim time nothing may be decided yet — that's fine: `--branch TBD` and "under discussion", then update once the direction and branch exist. A cheap, early, vague claim beats a precise, too-late one; its whole job is making the second session stop and ask.

**Every entry path claims, not just `/backlog pick`.** The user may simply say "let's do X" where X matches an open item, or a new task's scope may turn out to subsume one. Whenever the main agent recognizes that what's being discussed or started covers an open item — however it arrived — the same claim is written at that same moment.

**On an existing claim**: `claim` refuses (exit code 3) and prints who holds it. Do **not** silently take it over, and do **not** silently skip it. Report the claim to the user — id, since when, which branch, what's being done — and let them decide: pick something else, take it over (`--force`, once they say so), or coordinate. Whether an old claim is dead or is someone's live in-flight work is knowledge that only exists outside the repo.

**No expiry rule on purpose.** "A claim older than N days is stale, take it over freely" is tempting and wrong — N has no defensible value, a two-week claim can be an active long-running branch, and a two-day one can be dead. `/backlog list` flags likely-stale claims as prune candidates; the human resolves them in one sentence.

**Releasing a claim** — the mirror obligation of claiming early: a decision **not** to proceed releases it in the same turn (`backlog release <id>`). Two cases, same mechanics: the user hears the briefing and skips the item, or work that did start gets abandoned. A claim left behind by a skipped item is a phantom lock that blocks every other session for nothing. Abandoning is not closing.

**Claims are for the basket.** Promoting a claimed ticket carries the claim's meaning onto the tree — the new node starts `active` rather than `planned`, and the claim is removed from the record, since on the tree the node's status is the claim. `claim` refuses a ticket that is already on a node.

---

## Close rule (one uniform rule for done AND dropped)

```
board backlog close bl-a3f9c1 --resolution "quick fix, commit abc123"
board backlog drop  bl-7d2e04 --resolution "measured: the async gain doesn't justify the migration risk"
```

The record stays in `backlog.json` and gains a `closed` field — status (`done` / `dropped`), date, resolution — and the body moves into `archive/`. For `done`, the resolution says where it landed; for `dropped`, one sentence on why not. A resolution is required: it is the part of the record anyone will ever read again. `backlog list --closed` lists them; `backlog show <id>` shows any one.

Tickets on the roadmap are not closed with these commands — they close when their node is finished with `roadmap finish` (`roadmap-guide.md` → "Finished work"), which does the same to each of the node's tickets and keeps the node on the tree.

**Why archive instead of delete**: `dropped` items are lightweight ADRs — "we considered X and decided no, because Y." Deleting them guarantees the same idea resurfaces months later (often re-discovered by a reviewer) and the whole discussion reruns. `backlog list --closed` and a grep over `archive/` answer "did we already consider this?" without git archaeology. `done` tickets get the same treatment purely to keep one rule.

**Cleanup pass**: because writes are silent, noise accumulates by design. Periodically (typically when `/backlog` shows the list), the user prunes: stale or superseded items get dropped with a one-line resolution. Do not delete archived bodies: their records, and any roadmap node, still point at them, and `check` will refuse the board.

---

## Migrating a project from the old layout

Projects that still have `.spec/backlog/BACKLOG.md` and per-item frontmatter move to this layout with one command, run from the main worktree:

```
board migrate --dry-run [--roadmap-from <path>]
board migrate [--roadmap-from <path>]
```

Every old item file — open ones in `.spec/backlog/` and closed ones in `archive/` — becomes a record in `backlog.json`, and its frontmatter is removed from the body once transferred. Fields are read from whatever the file has: documented frontmatter keys, aliases such as `created` / `origin`, or a `# id: title` heading with bold label lines (`**Status**:` / `**狀態**:`), with the old `BACKLOG.md` line as a fallback for title, type and date. A `[~]` in the old index becomes a claim even when the file itself says open. Nothing is dropped: a field the record has no slot for — a non-standard status such as `merged-into-…`, an extra `completed` date — is kept verbatim in the record's `legacy`. A ticket on a roadmap node that is already done is closed and archived. An index line with no body file anywhere becomes a ticket whose body is that line. **If a required field (title, type, date, source) cannot be found anywhere, the migration refuses and lists them**; `--force` accepts the fallback values. `--roadmap-from` copies an existing roadmap JSON into `.spec/roadmap/`. Always read the dry run first — every claim carried over, every legacy field and every closing is listed there — then run `check`.
