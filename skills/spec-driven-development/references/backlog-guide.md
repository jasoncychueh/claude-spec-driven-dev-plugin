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
├── bl-0001-{slug}.md           # one item per file, thick context
├── bl-0002-{slug}.md
└── archive/
    └── bl-0000-{slug}.md       # closed items (done / dropped), frontmatter updated
```

**The single invariant**: `BACKLOG.md` always equals the exact set of unresolved items. Scanning the index answers "what do we still owe" — no cross-checking item files, no git archaeology. Everything below serves this invariant. If index and item files are ever found to disagree (a listed id with no file, a root-level file with no index line), **the item files are authoritative — rebuild the index from them** and mention the repair to the user.

**Why index + one-file-per-item** (instead of one flat backlog.md): the index gives the cheap scan (one line per item); the item file carries context thick enough for a reader two weeks later — the two needs pull a single file in opposite directions. Separate files also keep git diffs clean: closing one item never collides with recording another.

---

## Index format (BACKLOG.md)

```markdown
# Backlog

- [ ] bl-0007 (tech-debt, 2026-07-11) — payment module error handling should be unified; out of scope for the sync fix → [detail](bl-0007-unify-payment-error-handling.md)
- [ ] bl-0008 (design-question, 2026-07-11) — revisit whether the export pipeline should go async → [detail](bl-0008-async-export-question.md)
```

One line per item: checkbox, id, `(type, date)`, a one-sentence hook (enough to decide whether to open the file), link to the item file. `in-progress` items change `[ ]` to `[~]`. Closed items are **removed from the index**, not checked off — see the close rule.

## Item file format

Filename: `bl-{NNNN}-{slug}.md`. IDs are zero-padded, sequential, never reused (scan both the root and `archive/` for the highest existing ID before assigning).

```markdown
---
id: bl-0007
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

## Close rule (one uniform rule for done AND dropped)

Closing an item is three steps, always together:

1. **Update the item file's frontmatter**: set `status: done` (or `dropped`) and add a `resolution:` line — for `done`, where it landed ("quick fix, commit abc123" / "folded into feature X's spec"); for `dropped`, one sentence on why not ("measured, the async gain doesn't justify the migration risk").
2. **Move the file into `archive/`**.
3. **Remove the item's line from BACKLOG.md**.

**Why archive instead of delete**: `dropped` items are lightweight ADRs — "we considered X and decided no, because Y." Deleting them guarantees the same idea resurfaces months later (often re-discovered by a reviewer) and the whole discussion reruns. A grep over `archive/` answers "did we already consider this?" without git archaeology. `done` items get the same treatment purely to keep one rule — two close rules would drift in execution.

**Cleanup pass**: because writes are silent, noise accumulates by design. Periodically (typically when `/backlog` shows the list), the user prunes: stale or superseded items get dropped into archive with a one-line resolution. Physical deletion of `archive/` wholesale is always safe — it never touches the index.
