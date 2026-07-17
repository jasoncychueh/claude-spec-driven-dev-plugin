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
```

**Context thickness**: the test is "could a fresh session act on this without asking the user to re-explain?" Too thin and the item is a riddle; the goal is self-contained, not exhaustive — point at files and docs rather than re-pasting them.

---

## Write discipline

- **The main agent writes items directly** — like review-log maintenance, this is arbiter bookkeeping, not long-form generation; no subagent dispatch.
- **Write silently, no per-item confirmation** — recording is cheap and reversible (items can be dropped during a later cleanup pass); asking every time adds friction that kills the habit. Mention new items in the end-of-flow summary instead, so the user always sees what accumulated.
- **Update the index in the same action** as creating the item file — the invariant must never be left half-done.

### Hook points (where items come from)

| Hook | When | What goes in |
|---|---|---|
| 1. Review Medium/Low batch | the defer-and-batch AskUserQuestion round | the user's third option besides fix-now / waive: "handle later" → backlog item citing the review round |
| 2. Implementer report | `spec-implementer`'s completion report (both modes) | out-of-scope findings (pre-existing bug next door, adjacent tech debt) — the implementer reports; the main agent records |
| 3. Conversation | any moment in any flow | the user says "note this for later" / "let's not block on this now", or the main agent itself spots an unresolvable-now issue worth keeping |

### What does NOT go in the backlog

- Things fixed on the spot (they're just work, not debt)
- Accepted-as-is decisions → review-log §3 Waivers
- Project-level principles → Steering Evolution Mechanism
- Facts about the user or session → project memory

---

## Claiming an item (picking it up)

Unique ids stop two sessions from *recording* the same id. They do nothing to stop two sessions from *working on the same item* — that's a separate race, and the claim marker is what closes it.

When an item is picked up (`/backlog pick <id>`, after the user confirms the briefing), mark it claimed **before starting the work**, in the same action, both places:

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

**Mark first, work second.** A claim written after the work starts protects nothing during the window where the collision actually happens.

**On encountering a `[~]` item**: do **not** silently take it over, and do **not** silently skip it. Report the claim to the user — id, since when, which branch, what's being done — and let them decide: pick something else, take it over (the other session was abandoned), or coordinate. This is a genuine user call with no safe default: whether an old claim is dead or is someone's live in-flight work is knowledge that only exists outside the repo.

**No expiry rule on purpose.** "A claim older than N days is stale, take it over freely" is tempting and wrong — N has no defensible value, a two-week claim can be an active long-running branch, and a two-day one can be dead. The stale-looking claim still gets surfaced; the human resolves it in one sentence. A `/backlog list` already flags likely-stale items as prune candidates, which covers the cleanup need without a rule that guesses.

**Releasing a claim** (the work was abandoned, not finished): drop `picked_up`, set `status: open`, revert the index line to `[ ]`. An item is only ever *closed* by the close rule below — abandoning is not closing.

---

## Close rule (one uniform rule for done AND dropped)

Closing an item is three steps, always together:

1. **Update the item file's frontmatter**: set `status: done` (or `dropped`) and add a `resolution:` line — for `done`, where it landed ("quick fix, commit abc123" / "folded into feature X's spec"); for `dropped`, one sentence on why not ("measured, the async gain doesn't justify the migration risk").
2. **Move the file into `archive/`**.
3. **Remove the item's line from BACKLOG.md**.

**Why archive instead of delete**: `dropped` items are lightweight ADRs — "we considered X and decided no, because Y." Deleting them guarantees the same idea resurfaces months later (often re-discovered by a reviewer) and the whole discussion reruns. A grep over `archive/` answers "did we already consider this?" without git archaeology. `done` items get the same treatment purely to keep one rule — two close rules would drift in execution.

**Cleanup pass**: because writes are silent, noise accumulates by design. Periodically (typically when `/backlog` shows the list), the user prunes: stale or superseded items get dropped into archive with a one-line resolution. Physical deletion of `archive/` wholesale is always safe — it never touches the index.
