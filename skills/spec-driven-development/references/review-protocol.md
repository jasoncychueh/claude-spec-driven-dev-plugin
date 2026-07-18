# Review Protocol (shared by reviewer agents)

`design-reviewer` and `implementation-reviewer` share the same review loop mechanism. This file is the "contract" that both reviewers and the main agent should understand. Each reviewer agent should read this file when it starts, then go back to the specific review dimensions in its own agent prompt.

## Core model

A reviewer's value comes from **multi-round adversarial review**: every round assumes the previous round missed something, until convergence. The difference from a "one-pass review" is this: in a complex system, design / implementation flaws usually **cannot all be caught from a single inspection angle in one go** — fixing a race condition exposes an idempotency hole, fixing idempotency reveals an invariant that wasn't upheld. Multi-round review simulates this real "fix a layer, reveal a layer" process.

The convergence condition is strict: **end only when a round reports 0 issues**. Compromising ("good enough, let's stop") lets the system accumulate technical debt, and each compromise lowers the bar for future reviews (thin-edge-of-the-wedge).

This discipline has a symmetric flip side: **a clean round outputting `0 issues` is a good result, not a dereliction of duty**. Inventing issues to look diligent (promoting a nit to High, nitpicking an already-correct design) damages the same thing as false convergence — the credibility of the review. Honesty in both directions matters equally.

**Convergence fuse**: if review reaches round 5 and **new Critical/High** still keep surfacing, continuing the loop is usually pointless — it means the design / implementation itself has a structural problem (every fix spawns another), or the review is churning. At this point the main agent stops the loop and, before reporting, **spawns one fresh reviewer instance for a single independent round** (fresh eyes — the persistent session may by then be anchored on its own history; see the next section): if the fresh round broadly confirms the pattern, it's structural; if it diverges sharply, the loop itself was churning. Then summarize the cross-round issue pattern plus the fresh-eyes verdict and report to the user, who decides: redo the design, narrow the scope, or continue with full knowledge. The fuse is "stop and escalate to the user", **not** "treat as converged".

## Persistent sessions and the challenge exchange

The loop runs on a **generator/arbiter split**: long-form work (authoring documents, writing code, reviewing) is carried by subagent sessions on a capable-but-cheaper model, while the main agent — on the most capable model — spends its tokens only on short, high-leverage reasoning: distilling briefs, challenging conclusions, escalating decisions, maintaining the review log. The reviewer's depth is deliberately backstopped by the arbiter's challenge; that's why the challenge must be substantive, not ceremonial.

### Persistent sessions

- **One reviewer session per loop**: the main agent spawns the reviewer once (Round D1 / I1) and **resumes the same session via SendMessage for every subsequent round**. The reviewer keeps its protocol, steering, design basis, and issue history in context — resumed rounds re-read only what changed. Letter numbering accumulates naturally within the session.
- **One author session per cycle**: `spec-author` (design phase) and `spec-implementer` (implementation phase — per parallel group in Spec Mode, one single session in Quick Fix Mode) likewise stay alive; fix dispatches resume the session that wrote the artifact — the fixer remembers why it wrote what it wrote. For Spec Mode implementation fixes, resume the Mode 1 session whose group owns the affected files; if ownership is unclear, spawn a fresh Mode 2 instance.
- **Resume-failure fallback**: sessions can die (context overflow, environment loss). If a resume fails, spawn a fresh agent and rebuild its context: for a reviewer, review log §1 is the memory — hand it over as "prior rounds' trail" plus the full first-round reading list; for an author/implementer, the current artifact state on disk is the memory. The review log thus doubles as the loop's disaster-recovery checkpoint at zero extra cost.
- **Main agent reading discipline**: the arbiter reads the artifact under review **in full once**, then per round reads only the diffs of what the fixes changed. Challenging requires having actually read — but it does not require re-reading the unchanged 90% every round.

### The challenge exchange (rigor challenge — reviewer, every round)

After the reviewer outputs a round's issue list, the main agent sends **exactly one challenge message** in the reviewer's session before acting on the list: dispute suspected false positives (demand the concrete scenario), probe for suspected misses (name the class of problem and where it would live), question severity grades. The reviewer answers honestly in both directions and outputs the round's **final post-challenge list** — the official record the main agent integrates into the review log and dispatches from.

- One exchange per round, no inner loops — if a disagreement survives it, that is by definition a contested design choice: escalate it as an Architecture Decision, don't relitigate
- `0 issues` rounds are challenged too (probe convergence honesty before accepting the exit)
- The challenge must engage with the artifact's substance; "are you sure?" is not a challenge
- **Consult the advisor before a consequential arbitration** (the advisor gate's second application — SKILL.md "Advisor Gate Mechanism" / `advisor-gate-guide.md`): the challenge is the main agent's own judgment of the reviewer's output, and its *outcome* decides what gets fixed vs dropped. When the main agent is about to **dismiss a reviewer-graded Critical/High as a false positive**, **downgrade its severity**, or **accept the round's list essentially unchanged**, consult the advisor **before sending the single challenge** so its view shapes that challenge. Consequential-or-uncertain trigger only (routine "confirm a Critical is real and fix it" needs no advisor); a surviving advisor dissent that implies deeper probing escalates as an Architecture Decision (not a second challenge); degrades to solo arbitration when the advisor is unavailable; the advisor's concurrence/dissent is annotated in the review log (§4 `(advisor concurred, DATE)` for a confirmed dismissal, a §1 severity-change note for a concurred downgrade, a kept-outcome §1 note on dissent)

### The fidelity challenge (author, after each authoring dispatch)

After `spec-author` delivers a Mode 1 artifact, the main agent reads it against the brief and challenges **handoff drift**: content that doesn't match what was discussed with the user, invented scope, silently dropped decisions, unflagged assumptions. This is deliberately narrower than review — design *quality* belongs to the design-reviewer loop; the fidelity challenge only protects the brief→document handoff, catching drift before reviewer rounds are spent on the wrong document. If the artifact is faithful, proceed without manufacturing a challenge; drift found → one exchange in the author session, author fixes or justifies.

## Review method: build a use-case model first, then cross-check

The review dimensions / checklists below are **check items**, not the starting point of review. The starting point is **the usage scenarios that will actually occur**. At the start of each review round, first take stock of three things as the basis for all subsequent judgments:

1. **Use cases / scenarios** — which real scenarios does this design / implementation serve? happy path + important failure / edge paths
2. **Relevant data structures** — which data models, fields, and states do these scenarios touch
3. **Execution flow** — how the scenarios flow between components, who calls whom, in what order

Then take these three and **cross-check**: does the design conform to good architecture, does it conform to the steering docs, which scenario would hit a design flaw. **Find problems from "what real scenarios go through", rather than running down the checklist item by item** — the checklist is coverage insurance, not the source of judgment.

**Why**: only by walking through scenarios can you see a flaw's real impact and priority; review detached from scenarios easily degenerates into theoretical box-ticking, or into raising issues for paths that are "reachable in theory, never happen in practice". This lens is the same lens that briefing / Decision escalation use to reduce the user's cognitive load (see SKILL.md "Calibrate for Cognitive Load") — **the "core design concepts" that review surfaces here are exactly what the briefing needs to explain to the user**.

### Overriding criterion: don't over-engineer for edge cases with no use case

Even if some edge case is theoretically reachable in terms of data structure / execution flow, if **no real usage scenario drives it and it neither will nor should happen in practice**, then **don't write excessive defensive code and protective branches for it**. The correct approach: ensure that when the program lands at that dead end it **halts and leaves the necessary error log** (fail-fast, not a silent swallow).

This criterion **overrides** the Failure Modes / Hidden Assumptions / Bugs dimensions: before applying those dimensions, first ask "**which real use case would walk this path?**" Can't answer → don't demand added handling, demand fail-fast + log.

**This is "don't over-engineer", not an excuse to "ignore robustness"** — the line is clear:

- No use case driving it **and** it shouldn't happen → fail-fast + error log (no over-defense)
- **Any failure path that a real scenario walks** → demand robust handling as usual (this is exactly what the Failure Modes dimension is meant to catch)

The cost of judging the wrong side cuts both ways: treating a "failure that really happens" as over-engineering and letting it go → production incident; forcing defenses onto an "edge case that won't happen" → code dragged down by imaginary requirements, readability degraded. So the criterion is always "**is there a real use case**", not "is it reachable in the data structure".

## Severity grading

Every issue must carry a level. The grading isn't decoration — it's **the basis for the main agent's dispatch order**.

| Level | Definition | Example (design stage) | Example (implementation stage) |
|------|------|-------------------|---------------------------|
| **Critical** | Not fixing causes a production incident | no idempotency but will be retried / missing unique constraint | weak-ref GC / async race / silent failure |
| **High** | Not fixing becomes tech debt within 6 months or a misuse trap | unclear component boundary / no timeout defined | callback not unregistered / shared utility not extracted |
| **Medium** | Not fixing increases maintenance cost | inconsistent naming / uneven abstraction levels | stale docstring / over-defense |
| **Low** | nit-pick level, can defer | unclear doc description | minor variable naming quibble |

**Convergence rule**: all Critical / High must be zeroed out; Medium / Low are kept or not at the user's discretion (the main agent asks via AskUserQuestion).

**Why honest grading matters**: promoting a Low to High makes the main agent waste resources fixing unimportant things; demoting a Critical to Medium lets an incident blow up in production. A reviewer's credibility is built on the reputation that "what it catches is really worth fixing".

## Numbering rules

### Letter ID (accumulates across rounds, never reset)

Issues are numbered with **letters of the alphabet**, accumulating across rounds, never reset:

```
Round 1: Bug A, Bug B, Smell C, Decision D
Round 2: Bug E, Smell F, Decision G  ← does not restart from A
Round 3: Bug H, Smell I
```

**Why not reset**: cross-round references won't collide ("Round 4's Bug U is fixed" won't be confused with another Bug U from Round 1).

### Round naming — distinguishing reviewer types

| Reviewer | Round prefix | Letter sequence range |
|---|---|---|
| `design-reviewer` | `D{N}` — `D1`, `D2`, ... | its own sequence, accumulating across D rounds |
| `implementation-reviewer` | `I{N}` — `I1`, `I2`, ... | its own sequence, accumulating across I rounds (**independent of the D sequence**) |

**Why D and I accumulate independently**: the two reviewers are each independent invocations; requiring them to coordinate the letter sequence would add coupling (implementation-reviewer, when it starts, can't know design-reviewer used A-G — the main agent would have to pass that context). Independent accumulation lets a reviewer run purely by review-protocol.md. The cost is that letters are no longer unique across the whole spec — when referencing you must carry the Round prefix (e.g. `D2 Smell C` / `I1 Bug A`), which is required anyway inside the audit trail table.

**Full reference format**:
- ✅ `D2 Smell C` / `I1 Bug A` — Round prefix + letter ID
- ❌ `Bug A` — missing Round prefix, collides across reviewer types

## Architecture Decision discipline

This is the reviewer's **core line of defense**. A reviewer resolving an architecture decision is overstepping, and these choices are often irreversible — once a path is chosen, the cost of turning back is extremely high.

### Judgment criteria

When you find a choice that has "two or more reasonable options, and software-engineering history has no industry consensus on the best answer", **do not declare "should change to X" in the issue list**.

The three questions:

1. On this trade-off, **have Google / Meta / Amazon / Netflix each chosen different options**?
2. Does this choice depend on **team preference or organizational context** (which the reviewer agent can't see)?
3. Can I assert "this path is definitely wrong"?

All three yes → it's an Architecture Decision. The reviewer's job ends at listing it with the four-point raw material below; what the main agent does with it (route through the advisor gate, which resolves the clear-cut technical ones and passes genuine user calls to AskUserQuestion — SKILL.md "Advisor Gate Mechanism") is not the reviewer's concern. The reviewer never resolves it either way.

### Example comparison

| Is an Architecture Decision | Is not (pick directly as Bug/Smell) |
|--------------------------|---------------------------|
| CQRS vs CRUD | NULL not handled |
| Event sourcing vs state-based | Race condition |
| Push vs poll | duplicated tech debt |
| Orchestration vs choreography | Stale docstring |
| Optimistic vs pessimistic locking | missing NOT NULL constraint |
| Retry strategy: exponential vs linear backoff | weak-ref task GC |
| Error handling: raise vs return Result | callback not unregistered |
| Cache invalidation: TTL vs explicit | no idempotency key |

### How to mark them in the issue list

Every Architecture Decision must list at least:

- **Option 1**: option A — Trade-off
- **Option 2**: option B — Trade-off
- **Why no consensus**: why the industry is split
- **Suggested user considerations**: the key dimensions of the decision (which organizational context would influence the choice)

After receiving these, the main agent routes them through the advisor gate (SKILL.md "Advisor Gate Mechanism") — the advisor resolves the clear-cut technical ones, the rest go to the user via AskUserQuestion — before proceeding to the next round.

## Steering Candidates (steering promotion candidates)

**Default to not promoting.** Steering is the project's guardrail, not a development notebook; the vast majority of what review finds **should not** go into steering. The bar for a Steering Candidate is deliberately set very high — **don't promote unless necessary**. Better to miss an edge one than to pad: padding dilutes the guardrails, drowns the genuinely important clauses, and is also a waste of the user's attention (see SKILL.md "Calibrate for Cognitive Load"). A truly important principle will recur in the future and naturally get raised again; the cost of missing one is far lower than dumping a pile of noise every round.

**List as an SC only when all three hold** (none can be missing):

1. it is a **core concept / principle / convention that runs through the whole project** — future, unrelated features must also follow it to stay consistent;
2. **not recording it in steering will almost certainly cause** inconsistency or difficulty in future planning or implementation — it's "trouble if not recorded", not "nicer if recorded";
3. steering genuinely doesn't already have it (no need to list what already exists).

**Explicitly excluded** (even if they show up in review, they are **not** SCs):

- **spec-specific** — a choice that only concerns this feature (some cache TTL, some API's parameter) → leave it in that feature's design / review-log;
- **implementation detail** — algorithm, backoff parameter, a one-off naming decision → belongs to code / design;
- **project-memory-level facts** — a note describing the current state like "legacy module X uses callback style", which is not a forward-looking project principle;
- **anything that's "tidier if recorded" but won't cause trouble without it**.

Can't tell whether it counts → **then it's not an SC**.

**But a high bar ≠ never promote.** A core principle that genuinely satisfies all three above **should be listed with confidence** — that is exactly what living steering is meant to catch, the thing that, if not recorded, will gradually let steering and the codebase drift apart; suppressing it is as harmful as padding. The restraint is for filtering out noise, not for suppressing the genuinely important along with it; "better to miss one" applies only to **edge / uncertain** candidates, not to ones that clearly hit all three. The goal is "**a precise few**", not "zero".

Other disciplines:

- An SC **is not an issue, doesn't count toward convergence** — "the docs should add a convention" shouldn't block the quality line of defense
- The reviewer doesn't decide on its own that "this should be written into steering" — same non-overstepping discipline as Architecture Decision: whether to write it is the user's call, and the main agent handles batch delivery (per SKILL.md "Steering Evolution Mechanism")
- Distinguish clearly from "violating steering":
  - design **violates** an existing steering clause → open a normal issue (a violation of an explicit rule is usually High)
  - design conflicts with steering, but you can't assert which is right (steering may be outdated) → open an Architecture Decision, let the user decide "fix the design" or "update steering"
  - steering **doesn't have it**, and this design establishes a core principle that **passes the three bars above** → Steering Candidate
- Re-listing an unhandled candidate across rounds is fine; the main agent handles deduping

## Output format

Every review round must end by outputting an issue list conforming to the structure below (so the main agent can parse it mechanically):

```
## Round {D|I}{N} {agent-name} Review — {feature}

### Review scope   ← only implementation-reviewer needs this section; design-reviewer may omit it
- File count: {n}
- Previous round's fixes: {which issue IDs from Round N-1 were fixed}

### Critical (must fix before next round)
- **Bug A**: {one-line problem description}
  - Location: {file_path:line_number}    ← if applicable
  - Impact: {what consequence will occur}
  - Suggested direction: {how to fix, but no code}
- **Bug B**: ...

### High (should fix this round)
- **Smell C**: ...

### Medium / Low
- ...

### ⚠️ Architecture Decisions (need user input — main agent must escalate)
- **Decision D**: {problem description}
  - **Option 1**: {option A} — Trade-off: {pros and cons}
  - **Option 2**: {option B} — Trade-off: {pros and cons}
  - **Why no consensus**: {why the industry is split}
  - **Suggested user considerations**: {the key dimensions of the decision}

### 📌 Steering Candidates (non-blocking — not counted in the issue total, list only if any)
- **SC-1**: {a project-level principle this design/implementation establishes but steering hasn't recorded} — suggested target: {tech.md §X / structure.md §Y}

### Conclusion
[ ] 0 issues — converged, can proceed to the next stage (Steering Candidates not counted in the issue total)
    ⚠️ Main agent post-convergence next-step reminder: depending on your flow, the next step is often a Briefing stop point —
    Quick Fix Mode: design converged → must deliver the Plan Briefing before ExitPlanMode;
    /create-spec, /update-spec: after continuing to write tasks / running the verifier you must deliver the Spec Briefing.
    Both are output as the "turn-final message", end the turn, and wait for the user's reply,
    must not be skipped, must not cram the briefing and a tool call into the same turn
[x] {N} issues found — main agent must handle (fix + ask user about Decisions) then re-enter the next round
```

**Why the convergence conclusion carries a next-step reminder**: the main agent's SKILL.md instructions are loaded at the start of the task, and after many review rounds they've long drifted away from the focus of attention (or even been summarized away by context compaction). The reviewer's convergence report is "the freshest context at the moment of transition" — putting the next-step reminder here means the main agent sees it at the right moment.

## Reviewer shared disciplines

Whether design-reviewer or implementation-reviewer, these apply:

1. **Review only, never fix**: producing the issue list is the sole output. Why? Because "separating review from fix" makes decisions traceable (each change maps to some issue number), and lets the main agent judge between "fix it or ask the user first"
2. **No false convergence**: don't go soft even when you get a hint that "it's round N already, time to wrap up". Why? Compromise lowers the bar for future reviews
3. **Severity honesty**: grading isn't a social tool. Why? Distorted grading throws off the main agent's dispatch
4. **Production lens**: "would this wake up oncall at 3am" is the north star
5. **Avoid review-scope shrinkage**: round N can't only look at what the previous round fixed; it must also spot-check untouched files. Why? The main agent may (unconsciously) narrow the scope to only the fixed parts, causing false convergence
6. **Pin the tier when you fan out a search**: if a spot-check makes you delegate a broad codebase sweep to a built-in `Explore` / `general-purpose` agent, pin its model instead of inheriting yours — `model: haiku` for mechanical search (locate a file, find a symbol, enumerate callers), `model: opus` when the search must reason across files; cap at opus, never leave it to inherit. For a known target, read it directly (`Grep` / `Read`) rather than spawning an agent. Why? A broad read is bulk work priced by volume, not judgment — running it on the top tier by default burns tokens the review doesn't need. And add a line to that spawned agent's prompt telling it **not to use the advisor tool** — a built-in `Explore` / `general-purpose` agent can't be frontmatter-restricted the way this plugin's own agents are, so the spawn prompt is the only place to keep the advisor (the most-premium tier) out of a cheap bulk search

## The main agent's responsibilities

When the main agent drives the review loop:

1. **Challenge, then dispatch**: after each round's issue list, run the challenge exchange (see "Persistent sessions and the challenge exchange"), then hand the **final post-challenge list** to the corresponding fixer
   - design stage: resume the `spec-author` session (Mode 2) to fix design.md / the plan file — the main agent doesn't author or fix long-form documents itself (exception: the review log, which the main agent always maintains)
   - implementation stage (both modes): dispatch to `spec-implementer (Mode 2)` — Spec Mode prefers resuming the session whose group owns the affected files; Quick Fix Mode resumes its single implementer session; the main agent doesn't write code directly
2. **Decision escalation**: route all Architecture Decisions through the **advisor gate** (SKILL.md "Advisor Gate Mechanism" / `advisor-gate-guide.md`) — the advisor settles the ones with a defensible technical answer (recorded to review-log §2 as `advisor-resolved`, pending the user's review, surfaced at the briefing), and only the genuine preference / product / irreversible calls reach the user via AskUserQuestion with the human-friendly translation (SKILL.md "Architecture Decision Presentation Discipline" / `decision-escalation-guide.md`). The reviewer itself is unchanged — it only produces the four-point raw material and never resolves. When the advisor is unavailable the gate collapses to today's behavior (straight to AskUserQuestion). Challenge-exchange deadlocks escalate through the same gate
3. **Track rounds**: after each review round, record the issue numbers. The persistent reviewer session remembers its own history; the explicit trail matters as the rebuild source when a session dies (see "Resume-failure fallback")
4. **Update Review Log**: after each review round, maintain `review-log.md` (Spec Mode) or the plan file's `## Review Log` section (Quick Fix Mode) — see the next section "Review Log integration"
5. **Avoid scope creep**: when dispatching fixes, strictly limit to the issue scope, no incidental refactoring (if refactoring is needed, treat it as a new issue in the next round)
6. **Judge convergence**: only exit the loop when the reviewer reports "0 issues — converged" with no accumulated pending Medium/Low; can't exit early with Critical/High present; round 5 still has new Critical/High → trigger the convergence fuse (see "Core model"), stop the loop, run one fresh-eyes reviewer round, and report to the user. **Before accepting a `0 issues` round as the loop exit, consult the advisor as a second pair of eyes against false convergence** (the advisor gate's second application — `advisor-gate-guide.md`); if it flags a plausible miss, run another round rather than exiting. Degrades to today's solo convergence judgment when the advisor is unavailable; a convergence the advisor confirmed is noted in the Summary (a `0 issues` round has no §1 issue row)
7. **Steering Candidates delivery**: accumulate the SCs the reviewer lists (dedupe across rounds), merge with findings from Decision resolution / the implementation process, batch-deliver to the user for confirmation per SKILL.md "Steering Evolution Mechanism", then lightly write into steering and record in review log §5
8. **Detect thrashing, tighten the leash**: when the same issue survives two consecutive fix dispatches, or the fixer returns a blocker report instead of a completion, stop re-sending the big goal — decompose it yourself into small independently verifiable steps and dispatch them one at a time to the same resumed session, per SKILL.md "Dispatch Granularity". A blocker report is the escalation channel working as designed, not a failed dispatch

## Review Log integration (the handshake with the reviewer)

After each review round ends, the main agent must integrate the reviewer's issue list into the review log. For detailed write-in rules see `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/review-log-guide.md`.

### Reviewer-side responsibilities

- **Just produce the issue list** — don't write the log directly. What gets logged is the round's **final post-challenge list**
- Number issues by this file's "Letter ID" + "Round naming D/I prefix" rules
- Output format per this file's "Output format" section

### Main-agent-side responsibilities (after each review round)

1. Batch-append the reviewer's output issue list to review log §1 Audit Trail, marking Status `pending`
2. After handling each issue, immediately update that row's Status + Resolution:
   - fixed → `fixed`, Resolution writes "what was changed + location" (1 line)
   - Architecture Decision resolved by the user → `decision-resolved`, §2 adds the full Decision block, Resolution writes `→ §2 Decision <letter>`
   - Architecture Decision settled by the advisor (per the advisor gate) → `advisor-resolved`, §2 adds the Decision block tagged `[advisor-resolved · pending your review]` with `Rationale (advisor, DATE)`, Resolution writes `→ §2 Decision <letter> (advisor)`; surfaced at the briefing / Summary to confirm or override (see `advisor-gate-guide.md`)
   - kept unfixed (current state accepted) → `waived`, §3 adds the full Waiver block, Resolution writes `→ §3 W{N}`
   - deferred as a debt to repay later → `backlogged`, a backlog item is recorded under `.spec/backlog/` (main agent's job), Resolution cites the item id (e.g. `→ bl-a3f9c1`)
   - confirmed false positive → `false-positive`, §4 adds the FP block, Resolution writes `→ §4 FP{N}`

### When the reviewer references the Review Log

When the next round's reviewer assembles its "which the previous round fixed" context, it may choose to read the review log §1 table to quickly scan the already-handled issue IDs. But the reviewer **must not** look only at §1 and skip a fresh review — the review-protocol.md "Avoid review-scope shrinkage" rule still applies: round N must review all changes + spot-check untouched key files.

### Why the reviewer doesn't write the log

The discipline of separating review/fix is already established (the reviewer doesn't touch code); the same logic applies to the log: **the reviewer only produces raw material (the issue list); integrating it into the audit trail is the main agent's job**. This keeps the reviewer purely focused on "finding problems", undistracted by "which field of the log to write into".

## Loop convergence rules

Medium/Low use **defer-and-batch**: don't interrupt the user round by round — Medium/Low are often incidentally resolved by Critical/High fixes in later rounds, and asking early wastes the user's attention; accumulate and ask all at once in the round where Critical/High are zeroed out.

```
Reviewer output contains Critical/High → this round fixes only Critical/High;
                                Medium/Low marked pending and accumulated (don't ask the user yet)
Reviewer output is all Medium/Low (or 0 issues but with open Medium/Low accumulated from prior rounds)
    → ask the user about this round's + prior rounds' accumulated open Medium/Low all at once via AskUserQuestion
       user says don't fix (accepts current state) → write into waiver
       user says handle later (a debt, not accepted) → record a backlog item, §1 status `backlogged`
       either way: if this round also had no new Critical/High → treat as converged
       user says fix → fix then proceed to the next round
Reviewer output is "0 issues" with no accumulated open Medium/Low → converged, exit the loop
Round 5 still has new Critical/High → convergence fuse: stop the loop, run one fresh-eyes reviewer round (see "Core model"), report the structural problem to the user
```

**Never** exit early when Critical/High are present, even if it feels like a lot of rounds have already run (a fuse trip is "stop and escalate to the user", not "treat as converged" — the two are different).
