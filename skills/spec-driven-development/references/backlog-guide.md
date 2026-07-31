# Backlog Guide

Format conventions and lifecycle rules for the project backlog — the durable parking lot for anything discovered during planning, implementation, review, or plain conversation that can't be resolved now or needs deeper discussion later.

**Why it exists**: without a backlog, deferred discoveries die in three graves — a review waiver buried in one spec's review-log, an out-of-scope finding that only ever existed in an implementer's completion report, a "worth rethinking later" remark that evaporates when the session ends. The backlog gives all three a single durable home that the next session can scan in one read.

**Backlog vs Waiver — the semantic line**: a waiver (review-log §3) means "we accept the current state; this is not a debt." A backlog item means "this is a debt; we intend to repay it." When the user defers a Medium/Low review issue, ask which of the two they mean — the answer decides where it's recorded. One issue never lives in both places.

---

## Directory structure

`.spec/backlog/` is anchored at the **project root** (beside `.spec/steering/` and `.spec/specs/`) and is created on demand the first time an item is recorded — in **either mode**. Note the deliberate asymmetry with Quick Fix Mode's plan file: the plan is ephemeral and lives outside the repo, but a backlog item is project-durable debt, so it lands in the repo even when the quick fix itself leaves no other `.spec/` artifact.

```
.spec/backlog/
├── BACKLOG.md                  # index — lists open / in-progress items ONLY
├── bl-a3f9c1-{slug}.md         # one item per file, thick context
├── bl-7d2e04-{slug}.md
└── archive/
    └── bl-91b0ff-{slug}.md     # closed items (done / dropped), frontmatter updated
```

**The single invariant**: `BACKLOG.md` always equals the exact set of unresolved items. Scanning the index answers "what do we still owe" — no cross-checking item files, no git archaeology. Everything below serves this invariant. If index and item files are ever found to disagree (a listed id with no file, a root-level file with no index line), **the item files are authoritative — rebuild the index from them** and mention the repair to the user.

**Why index + one-file-per-item** (instead of one flat backlog.md): the index gives the cheap scan (one line per item); the item file carries context thick enough for a reader two weeks later — the two needs pull a single file in opposite directions. Separate files also keep git diffs clean: closing one item never collides with recording another.

---

## Index format (BACKLOG.md)

```markdown
# Backlog

- [ ] bl-a3f9c1 (tech-debt, 2026-07-11) — payment module error handling should be unified; out of scope for the sync fix → [detail](bl-a3f9c1-unify-payment-error-handling.md)
- [~] bl-7d2e04 (design-question, 2026-07-11) — revisit whether the export pipeline should go async — in progress since 2026-07-17, branch `feat/async-export` → [detail](bl-7d2e04-async-export-question.md)
```

One line per item: checkbox, id, `(type, date)`, a one-sentence hook (enough to decide whether to open the file), link to the item file. `in-progress` items change `[ ]` to `[~]` and carry their claim inline (see "Claiming an item"). Closed items are **removed from the index**, not checked off — see the close rule.

Ordering is **chronological by `date`**, which every line already carries — ids are unique, not ordered, and carry no sequence meaning.

## Item file format

Filename: `bl-{hash}-{slug}.md`, where `{hash}` is 6 hex characters.

**Generating the id — run the command, never invent the characters:**

```powershell
[guid]::NewGuid().ToString('N').Substring(0,6)
```

This is **not optional and not a suggestion**. An id you produce by "picking six random-looking hex characters" is not random — model-generated strings repeat and cluster, which reintroduces exactly the collision this design removes, except silently. Run the command; use what it returns. (POSIX equivalent, if PowerShell is unavailable: `uuidgen | tr -d - | head -c 6`.)

**Why a random hash instead of a sequential number**: a counter forces every writer to first read global state ("scan for the highest existing id"), and two sessions that scan concurrently — two branches, two worktrees, two terminals — both see `bl-0008` and both write `bl-0009`. The id generation is the race. A random id needs no coordination at all, so there is nothing to race on. Ids are never reused.

**Cheap belt-and-suspenders**: if the generated id already exists in the root or `archive/`, generate another. This costs one glob and catches the within-branch freak case.

```markdown
---
id: bl-a3f9c1
title: Unify payment module error handling
type: tech-debt            # bug | tech-debt | design-question | idea
status: open               # open | in-progress | done | dropped
date: 2026-07-11
source: review I2 (feature: payment-sync)   # or: conversation | implementer report | plan discussion
feature: payment-sync      # optional — the related spec, if any
---

**Problem:** What was discovered, stated concretely.

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

---

## Write discipline

### The triage ladder (run it before every write)

The backlog's failure mode is being used as an **escape hatch**: mid-execution, a bug or a gap turns out to be inconvenient, someone declares it "out of scope", opens an item, and skips it — and the skip *looks* diligent because a record was left behind. So a new discovery is **triaged, not declared**, and **the finder never adjudicates**: the implementer/reviewer reports, the main agent — who owns the cycle's goal — walks the ladder in order. The backlog is the ladder's *residual*, never its first stop.

1. **This cycle's own problem → back into the cycle, mandatory.** A defect **introduced or exposed by this cycle's changes** (that's an unfixed bug — fix it now or blocker-report it; parking it is shipping a known bug with a receipt), anything **the deliverable needs to actually work** (in scope by definition, wherever the code lives), or a **gap in this cycle's own plan/design** (a design-basis flaw → blocker report → plan/design revision → the review loop; backlogging it means knowingly implementing a flawed design).
2. **Trivial → just fix it, in passing.** Small, self-evident, no design ripple (a few lines, verifiable on sight): the main agent adds it to the current dispatch as an **explicit one-line scope extension** and the implementer fixes it. Opening a debt file for something cheaper than the file itself is process overhead inverted.
3. **Related and at most quick-fix scale → absorb it, pre-existing or not.** If the discovery is genuinely adjacent to what this cycle is touching **and** handling it stays within quick-fix scale (no new spec-level design questions, no sprawl across unrelated files), fold it into this cycle when circumstances allow (schedule/risk don't forbid it): extend the plan's change list / add a task, explicitly, so the reviewer sees it as in-scope work. Pre-existing status is irrelevant here — relevance and scale decide. The context is already loaded *now*; a backlog item pays the full re-orientation cost later for work that was one step away today.
4. **The rest → backlog.** Weakly related, or spec-scale (it needs its own requirements/design discussion), or circumstances genuinely don't allow absorption — this is the honest residual the backlog exists for.

**Absorption is explicit, never silent** — it is the main agent *extending the sanctioned scope* (plan change list / task list updated), which keeps the implementer's No Scope Creep discipline intact: the implementer still never self-absorbs; it reports, and the scope comes back extended. Absorbed extras are listed in the Summary so the user sees what the cycle grew to include.

The item file must show the ladder was walked: its **Why deferrable** line states why it isn't rung 1 (pre-existing / independent — with the evidence) *and* why it wasn't absorbed at rungs 2–3 (scale / relevance / circumstances). If you cannot honestly write both, the item doesn't go in — the problem goes back up the ladder.

(Hook 1 — the user choosing "handle later" in the Medium/Low batch — is the user overriding scope himself; it needs no triage. Hook 3 user requests likewise. The ladder guards the *self-serve* writes: implementer findings and the main agent's own discoveries.)

- **The main agent writes items directly** — like review-log maintenance, this is arbiter bookkeeping, not long-form generation; no subagent dispatch.
- **Write silently, no per-item confirmation** — recording is cheap and reversible (items can be dropped during a later cleanup pass); asking every time adds friction that kills the habit. Mention new items in the end-of-flow summary instead, so the user always sees what accumulated.
- **Update the index in the same action** as creating the item file — the invariant must never be left half-done.

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

---

## Claiming an item (picking it up)

Unique ids stop two sessions from *recording* the same id. They do nothing to stop two sessions from *working on the same item* — that's a separate race, and the claim marker is what closes it.

The claim lands **the moment the item enters focused discussion** — on `/backlog pick <id>`, that is right when the item file is opened to brief the user, *before* the briefing, not after their confirmation. The discussion itself is contention: while one session briefs, debates, and plans around an item, a second session must already see `[~]`. Mark it in the same action, both places:

```markdown
--- item file frontmatter ---
status: in-progress
picked_up: 2026-07-17 (branch: feat/async-export) — reworking the export pipeline to async
```

```markdown
--- BACKLOG.md ---
- [~] bl-7d2e04 (design-question, 2026-07-11) — revisit whether the export pipeline should go async — in progress since 2026-07-17, branch `feat/async-export` → [detail](bl-7d2e04-async-export-question.md)
```

The claim carries three things, and each earns its place: **the date** (is this claim minutes old or a month stale?), **the branch** (where the work lives — the reader can go look at it), and **one sentence on what's being done** (whether it overlaps with what *this* session was about to do).

**Mark first, everything second — "the work" starts at discussion, not planning, and certainly not implementation.** A claim written after the collision window opens protects nothing — and the window opens as soon as the user engages with the item: the briefing, the debate about whether/how to do it, Plan Mode, spec authoring, initial exploration are all contention. At claim time nothing may be decided yet — that's fine: write `branch: TBD` and a sentence like *"under discussion"*, then update both once the direction and branch exist. A cheap, early, vague claim beats a precise, too-late one; its whole job is making the second session stop and ask.

**Every entry path claims, not just `/backlog pick`.** The pick command is not the only way an item enters focused discussion: the user may simply say "let's do X" where X matches an open backlog item, or a new task's scope may turn out to subsume one. Whenever the main agent recognizes that what's being discussed or started covers an open item — however it arrived — the same claim is written at that same moment (and a `[~]` found this way is reported exactly like in the pick flow). The claim rule follows the *item*, not the command; the release rule follows it too (the discussion ends in "skip it" → release in the same turn).

**On encountering a `[~]` item**: do **not** silently take it over, and do **not** silently skip it. Report the claim to the user — id, since when, which branch, what's being done — and let them decide: pick something else, take it over (the other session was abandoned), or coordinate. This is a genuine user call with no safe default: whether an old claim is dead or is someone's live in-flight work is knowledge that only exists outside the repo.

**No expiry rule on purpose.** "A claim older than N days is stale, take it over freely" is tempting and wrong — N has no defensible value, a two-week claim can be an active long-running branch, and a two-day one can be dead. The stale-looking claim still gets surfaced; the human resolves it in one sentence. A `/backlog list` already flags likely-stale items as prune candidates, which covers the cleanup need without a rule that guesses.

**Releasing a claim** — the mirror obligation of claiming early: because the claim now lands before the user has even said yes, a decision **not** to proceed must release it in the same turn. Two cases, same mechanics: the user hears the briefing and skips the item ("not now, show me something else"), or work that did start gets abandoned. Either way: drop `picked_up`, set `status: open`, revert the index line to `[ ]` — immediately, not "later"; a claim left behind by a skipped item is a phantom lock that blocks every other session for nothing. An item is only ever *closed* by the close rule below — abandoning is not closing.

---

## Close rule (one uniform rule for done AND dropped)

Closing an item is three steps, always together:

1. **Update the item file's frontmatter**: set `status: done` (or `dropped`) and add a `resolution:` line — for `done`, where it landed ("quick fix, commit abc123" / "folded into feature X's spec"); for `dropped`, one sentence on why not ("measured, the async gain doesn't justify the migration risk").
2. **Move the file into `archive/`**.
3. **Remove the item's line from BACKLOG.md**.

**Why archive instead of delete**: `dropped` items are lightweight ADRs — "we considered X and decided no, because Y." Deleting them guarantees the same idea resurfaces months later (often re-discovered by a reviewer) and the whole discussion reruns. A grep over `archive/` answers "did we already consider this?" without git archaeology. `done` items get the same treatment purely to keep one rule — two close rules would drift in execution.

**Cleanup pass**: because writes are silent, noise accumulates by design. Periodically (typically when `/backlog` shows the list), the user prunes: stale or superseded items get dropped into archive with a one-line resolution. Physical deletion of `archive/` wholesale is always safe — it never touches the index.
