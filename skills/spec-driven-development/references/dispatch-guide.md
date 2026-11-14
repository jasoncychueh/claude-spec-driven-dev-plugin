# Dispatch Guide

How the main agent hands work to subagents: which tier a broad search runs on, how much goal goes into one dispatch, who settles a fix that isn't landing, and how long a worktree lives. SKILL.md "Dispatching" keeps the summary and the lines every executor dispatch prompt carries; this file holds the full rules and their reasons.

Read it:

- before delegating a broad codebase search to a built-in agent ("Model Economy for Exploration")
- before grouping a review round's or a test run's fix items ("Fix dispatches fan out the same way")
- when a fix isn't landing, an executor returns a blocker report, or the same issue survives two fix dispatches ("Stepwise dispatch", "The fix escalation ladder")
- when an executor report says it is waiting for a background task ("The asymmetry the executors can't see")
- when starting or finishing a work cycle in a git worktree ("Worktree Lifecycle")

---

## Model Economy for Exploration

The generator/arbiter split (Principle #10) moves long-form **generation** into subagents at a deliberate effort level. The same reasoning applies to **reading**: broad codebase exploration — sweeping many files to locate something, map a subsystem, or trace callers before distilling a brief — is bulk work whose cost is driven by how much gets read, not by how much judgment it needs. When the main agent (or any subagent) fans that out to a built-in `Explore` / `general-purpose` agent, that agent **inherits the session model by default** — which may be the most expensive model and effort the account runs. A broad sweep at that tier burns tokens out of all proportion to the judgment it actually requires.

So whenever you delegate a broad search to a built-in exploration agent, **pin its model explicitly instead of letting it inherit**:

| Search shape | Pin | Examples |
|---|---|---|
| Simple / mechanical | `model: haiku` | locate a file, find a symbol's definition, enumerate callers, grep-style pattern hunts across the tree |
| Needs reasoning / synthesis | `model: opus` | understand how a subsystem fits together, judge which of several candidates is the real one, summarize a design spanning many files |

The ceiling is **opus** — never let a broad sweep ride the session's top tier by default. Simple searches drop to haiku; searches that must reason cap at opus.

**A known target needs no subagent at all.** When you already know the file or symbol, read it directly (codebase-memory MCP graph tools / a targeted `Grep` + `Read`). Spawning an agent to fetch one known thing pays the agent's fixed startup overhead for nothing.

**Exploration spawns are one-shot — a different search gets a fresh agent.** The "resume, don't respawn" discipline belongs to the *persistent worker sessions* (author / implementer / reviewer), whose accumulated context is the whole point. An `Explore` / `general-purpose` search has no such asset: its context is whatever it happened to read for the last question. Resume one only when the follow-up genuinely digs deeper into the **same** question it just answered (drill into a file it already found); a different question — even a nearby one — spawns fresh, because the leftover reading list biases where the new search looks and pays context for nothing.

**Tell a spawned `Explore` / `general-purpose` agent not to use the advisor.** Nothing can remove the advisor from a subagent's reach — it is served from outside the client tool registry, so frontmatter can't strip it and a hook can't intercept it — and for a *built-in* agent we can't edit the definition at all. The spawn prompt is the **only** lever. Add a line like *"Do not use the advisor tool — that is the main agent's, not yours; just return your findings."* Same reasoning as the main-agent-only rule (`advisor-gate-guide.md`): a cheap-tier bulk search must not reach for the most-premium tier.

**Why a cheaper sweep is safe here**: the initial exploration is for orientation, not the last word. The downstream review loop re-reads the code on opus and the per-round challenge backstops it, so a slightly shallower cheap-tier sweep gets caught long before it can mislead the design.

---

## Dispatch Granularity (how much goal per dispatch, and who settles it)

The generator/arbiter split says *who* executes; this section says **how much to hand an executor per dispatch** — and, in "The fix escalation ladder" below, **which tier settles a fix that isn't landing**. A third axis — *how many executors at once* — is decided separately by the file-disjointness grouping procedure (`/implement` Stage 1; Quick Fix's conditional fan-out; each round's fix items, below). **The axes meet in one direction, and only one**: batch dispatch is where parallel grouping applies; **stepwise dispatch is inherently serial** — when the leash is tight because of thrashing or an unsettled basis, you are decomposing one path, not fanning out several. Never read "parallel is the default" as license to fan out during stepwise recovery.

**Every dispatch is bounded by the arbiter, and watched by a checkpoint.** Nothing truncates an over-large dispatch — hand over a whole phase and it runs until it is done, however far it has drifted. What catches that is a hook inside the executor's own session: past a per-agent threshold it asks the executor to `SendMessage` a status to you and keep working, repeating every threshold. Those reports land in your context on your next turn; answer only when the direction is wrong, and the answer reaches the executor mid-work (`review-protocol.md`, "Progress reports arrive mid-dispatch"). That is visibility, not a substitute for sizing — it tells you a dispatch has drifted, it does not make an over-large one safe. So size the chunk deliberately: one task group, one review round, one settled approach, each with an explicit deliverable, then resume for the next. The measured shape this avoids is a 285-turn implementer dispatch that, had it misread the design, would have burned all 285 turns before the arbiter saw a line of it. **An incomplete return is not a result** — resume it, and never read it as a finished list or a `0 issues` round (`review-protocol.md`, "A round is one completed issue list"). **And it is not a stall**: an executor that spent the dispatch reading was doing the part of the task that comes first — reading the design basis and the target files *is* the work. Resume with "continue" or a narrower target (which file, which function); never with a reading ban, nor an instruction to write on facts it has not verified, which is spec drift by dispatch prompt (`spec-tester` Mode 1's ban on reading the implementer's files is a coupling rule and stands). Reordering or scoping the reading is fine; removing the basis while keeping the output demand is not, and if reading must be cut short the executor lists what it did not verify rather than guessing. A stall is two consecutive returns with the same files re-read or no state change on disk — one incomplete return means only that the dispatch was bigger than one pass (`review-protocol.md`, "How to read an incomplete return").

**Fan out wide, in one message.** Groups whose `File:` sets are disjoint run concurrently only when spawned **in the same message** — separate messages serialize them, which is the difference between a phase finishing in one wall-clock block and finishing in four. Measured across real cycles, the work ran overwhelmingly phase-by-phase and serial: the parallelism this skill already specifies was mostly left unused. Be honest about the trade it buys, though — the same work compressed into fewer wall-clock hours draws harder on a rolling usage window, so wide fan-out trades rate-limit headroom for elapsed time. That is usually the right trade, and it is a trade, not a free win.

### Fix dispatches fan out the same way

After a Stage 2 round's final post-challenge list, or a Stage 3 test-run failure classification, group the fix items **by owning session first, then by `File:`-disjointness** (the Stage 1 rule):

- Items owned by the same session merge into **one** dispatch to it — never two concurrent dispatches to one session. In Quick Fix Mode with its default single implementer, that is one dispatch.
- Groups owned by different sessions with disjoint files are dispatched **in the same message**; one fix per message serializes a round that has no dependency forcing it.
- An item whose files span two owners is dispatched on its own (to one of them, or a fresh spawn) after the groups touching its files have reported.
- Test fixes go to `spec-tester`. If a test-fix item depends on the interface a code-fix item produces (a rename or reshape), dispatch the implementer first and the tester after its report — not in the same message.
- An item that needs `spec-author` to settle an approach first is settled first and its implementation dispatched afterwards; it does not hold back independent groups, which read the basis as it was at their dispatch. A settlement that changes a cross-component contract does hold back the groups that depend on that contract. When the settled item's implementation is dispatched, check its file set against groups still in flight: overlap means wait, or the same session. In Quick Fix Mode the plan file is both the settlement target and the Review Log's home, so don't edit the Review Log while `spec-author` revises the plan in parallel — sequence the two.
- Each fix dispatch lists the files that executor may change, and each fix group builds only its own scope (`verification-scope.md`, which also covers the whole-solution build points and what happens when one fails).

Stepwise dispatch (below) stays serial.

### Batch dispatch and stepwise dispatch

Two shapes, chosen by how clear the path is — not by task size:

**Batch dispatch (the default)** — when the design basis is explicit and the work decomposes cleanly (a Stage 1 task group, a plan file's change list, a post-challenge fix list): hand the executor the whole scoped list, then judge the result. The design basis is doing the guiding, so the executor can run on a long leash. This is the standard flow everywhere else in this skill.

> **Say that the list is the turn's work, not a preview of it.** A batch handed over as a list is often executed one item deep and then reported on — the rest read as context rather than instructions, which turns a batch into an accidental stepwise dispatch that costs a main-agent round trip per item. Close it in the prompt with the batch line in SKILL.md "Dispatching" ("Work the list to exhaustion in this turn…"). Its last clause, "or you hit a blocker", matters: without it, "don't stop" collides with the stop-instead-of-thrash rule, and a genuinely blocked executor will grind rather than report.

**Stepwise dispatch (tight leash)** — switch on either trigger:

1. **Thrashing**: the same problem survives two consecutive fix dispatches — the same issue re-opens round after round, the build keeps failing at the same place, or the executor's report shows repeated attempts at one wall. More retries of the same big goal will not converge, because the *path* is what's missing, not effort.
2. **No settled basis**: an ad-hoc user request or a mid-flight goal change whose plan is still thin or volatile — no explicit design basis is doing the guiding yet.

In stepwise mode the main agent does the pathfinding **itself, before dispatching** — that is arbiter judgment, not executable legwork, so it belongs with the arbiter. Think through the concrete route, break it into the smallest independently verifiable goals (one file's change, one failing test made green, one interface stubbed), then dispatch **one goal at a time** to the *same resumed executor session*; verify the outcome, and only then issue the next. Give each step stronger guidance than a batch dispatch would carry — expected outcome, the specific files, what "done" looks like, known traps. The executor runs at low effort: when the path is unclear, **precision of instruction substitutes for depth of thought**.

Two boundaries keep this honest:

- Stepwise dispatch is **not** a license to skip planning — an ad-hoc task still routes through Quick Fix Mode's plan-first flow. Stepwise governs how the *dispatching* happens once work starts, not whether a plan exists.
- The main agent still never executes: even the smallest step goes to the executor session. Decomposing is judgment; implementing the fragment is still execution.

### The asymmetry the executors can't see — they cannot be woken

The main agent may hand work to the background and end its turn: the harness wakes it with a completion notification. **A subagent has no such mechanism.** It is a transcript, not a live process — the instant it ends its turn it stops completely, and the only thing that can ever restart it is the main agent sending it a message. A command it starts with `run_in_background` genuinely keeps running and genuinely finishes; nothing then exists to tell it. Nothing in the tools signals that the two cases differ, so the executors are told explicitly (in `spec-implementer.md` / `spec-author.md`): **foreground everything, narrow what is too slow, escalate what can't be narrowed.** **The executors are actively told the opposite by their own tool guidance**, which is why prose in their definitions was not enough on its own: the harness tells its reader that a backgrounded task notifies on completion and that polling is therefore wasteful. That text is written for *you*; it reaches them as injected boilerplate and is false about them. Observed failure: an executor backgrounds `dotnet test`, ends its turn "waiting for the notification per the no-polling discipline", and the dispatch stalls until a human notices — repeatedly, in one session, even with the rule spelled out in the dispatch prompt. Their definitions now name that guidance and override it, and tell them that a task *already* backgrounded must be polled to completion **within the turn**.

The main agent's side of this:

- **Scope or absorb the long runs.** When a dispatch will need a genuinely long build or test suite, either bound the executor's run, or run the command yourself and hand the result into the session — you have the wake-up they lack.
- **Every executor dispatch prompt carries the rule** — the exact line, together with the other lines every dispatch prompt carries (the files a fix may change, the design basis), is in SKILL.md "Dispatching". It is redundant with their definitions by design: this is the failure that costs the most when it slips, since it stalls the whole line rather than degrading one result.
- **Recognize the symptom instantly.** An executor report containing "waiting for the background task to complete" is a **stalled dispatch, not a status update**. Resume it immediately with the instruction to poll in-turn; don't wait, and don't treat the promised follow-up as something that will arrive.

### The executor's side of the contract — stop instead of thrash

A subagent cannot message the main agent mid-run; its only channel back is ending its turn. So the executors (`spec-implementer`, `spec-author`) are instructed: after two genuinely different failed attempts at one obstacle, **stop and return a blocker report** (what was tried, the evidence, the hypotheses, the concrete question) instead of trying a third variation. The session stays alive — the main agent answers via SendMessage with guidance or a decomposed next step, and work continues in-context. A blocker report is a *successful* outcome of a dispatch, never a failure to paper over. **Receiving one routes to classification, not to a fixed response**: the main agent reads the report and picks the rung from the ladder below — a report that says "the path was unclear, here's where I got stuck" is rung 2 (stepwise); one that says "the root cause isn't what we assumed" or "this can't be done without changing X's contract" is rung 3 (approach settlement), and the executor never picks for itself.

### The fix escalation ladder (who settles a fix that isn't landing)

A fix dispatch has one more axis: **how much judgment the fix needs before code is written**. `spec-implementer` runs on the execution tier (sonnet) by design — it implements faithfully against a settled basis, which is exactly right for the initial build and for mechanical review fixes, and exactly wrong for diagnosis. When a fix needs a root cause found or a direction chosen, sending it to the implementer is asking the execution tier to do the judgment part. So a fix that isn't landing escalates by rung, on observable triggers:

| Rung | Trigger | Who settles it |
|---|---|---|
| 1 | Reviewer item is **mechanical** — the landing point is explicit, the fix direction is stated and obviously right | `spec-implementer` Mode 2, direct (the unchanged default — most fixes stop here) |
| 2 | **Path unclear, scope local** — the target is known but attempts keep missing | **Stepwise dispatch** to the same implementer session (above) |
| 3 | **Root cause unknown**, or **multiple viable directions**, or the fix **touches framework / a cross-component contract** | **`spec-author`** (judgment tier) investigates and settles the approach into the design basis; the implementer then implements the settled approach |
| 4 | The judgment layer already tried and missed (triggers below) | **The main agent diagnoses it itself**, then dispatches `spec-author` to write the conclusion down |
| 5 | Round 5 with new Critical/High still surfacing | **Convergence fuse → the user** (`review-protocol.md`, unchanged) |

**Rung 4's triggers — any one suffices.** They are per-*problem* signals, unlike the fuse's per-*loop* one, and rung 4 exists precisely so the loop doesn't have to reach the fuse:

1. **A rung-3 settlement didn't hold** — `spec-author` investigated, settled an approach, the implementer executed it, and the next round re-opens the same issue or an obvious mutation of it. The judgment layer has had its shot and missed; sending it back to the same layer repeats the same failure.
2. **Two failed fix attempts on one problem, cumulatively** — the 1.15.0 thrashing definition counted per dispatch; at this rung it accumulates per issue across dispatches and rungs.
3. **Rounds accumulating without the Critical/High count trending down** (watch from Round 3) — the "many rounds, still not converging" signal. The evidence is already in review-log §1's audit trail; no new counter.

**What "the main agent diagnoses it itself" means**: not writing the fix — that stays forbidden in both modes. It means the arbiter stops working from the reviewer's *summary* and goes to the primary evidence itself — reads the actual code, the failing output, the cross-round issue pattern — forms the diagnosis and decides the direction, then dispatches `spec-author` to record it in the design basis and the implementer to execute. Spending the arbiter's own tokens on the diagnosis *is* its job; delegating the hardest judgment to the execution tier is what inverts the economy.

**The technique to use first — attack the premise.** When two fixes that share one premise have both failed, the third fix will fail for the same reason, because it is built on the same assumption. Before any third fix, write that premise down in one sentence ("the value is already normalized by the time it reaches here", "only the sync worker writes this") and test it against the primary evidence — run the repro, read the code path, check the data. Usually the premise is false, and the real fix is somewhere neither failed attempt looked.

**This also sharpens the fuse.** By the time Round 5 trips it, the top judgment layer has personally been down there and still failed — which is what makes "this is structural, the user must decide" a conclusion rather than a shrug.

**Does a settled approach need its own design review?** Name the line rather than exempting silently: an approach settlement that **stays within the existing architecture** (the fix's shape changes, no structure or interface does) rides the implementation loop — the next round reviews the fix against the revised basis, which is what that loop is for. One that **changes structure or a public/cross-component interface** is a genuine design change and takes the existing path (`/update-spec`'s mandatory design-review loop in Spec Mode; a design-reviewer round on the revised plan in Quick Fix Mode). Routing every complex bug fix through a full design loop would rebuild the ceremony problem the challenge rule just removed; routing a real interface change around one would be the opposite error.

---

## Worktree Lifecycle (one work cycle, one worktree)

When the environment uses git worktrees (an isolation tool the harness may provide, or ones created manually), the same scoping instinct as persistent sessions applies: **a worktree belongs to exactly one work cycle** — one feature spec, one quick fix — created fresh at its start and **deleted after its branch merges**. Never reuse a previous task's worktree for new work.

Why fresh-per-cycle wins:

- **Leftover state is a liability, not an asset** — untracked files, build artifacts, and half-finished experiments from the last task sit invisible to git but fully visible to the executor, and silently steer the new work (the same reasoning as the session-resume boundary: what another task left behind is contamination, not context).
- **A worktree is cheap** — its creation cost is one checkout. There is nothing worth salvaging from an old one that a fresh checkout doesn't already give you.
- **Branch mapping stays legible** — one worktree ↔ one feature branch, created together, merged and deleted together. Reuse is how "which branch is this worktree even on" confusion starts.

The one legitimate long-lived worktree is a **long-running cycle** (a large spec spanning many sessions): its worktree lives until that spec completes — still one cycle, one worktree, just a longer cycle. What is never legitimate is carrying a worktree *across* cycles.

Cleanup is part of Done: the Summary stage's "completed" report assumes the merged branch's worktree has been removed (`git worktree remove` + branch delete after merge). A worktree whose branch is gone (`[gone]` upstream) is garbage to collect, not a resource to keep.
