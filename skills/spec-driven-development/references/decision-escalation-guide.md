# Architecture Decision Presentation Discipline

The "translation work" the main agent must do when, having received an Architecture Decision escalated by a reviewer, it hands the choice to the user via `AskUserQuestion`.

> This file only needs to be read when the main agent needs to hand a Decision to the user. Reviewer agents **need not** read this file — they still output a mechanically parseable issue list per `review-protocol.md`; what this file governs is how the main agent **translates** that list into a conversation a human can digest.

> **Architecture Decisions are reached here only after the advisor gate.** Every Architecture Decision first passes through the advisor (SKILL.md "Advisor Gate Mechanism" / `advisor-gate-guide.md`). The advisor settles the ones with a defensible technical answer — those are **not** delivered as an AskUserQuestion; they're recorded `advisor-resolved` and surfaced in the briefing / Summary for the user to confirm or override. The two-beat delivery below is for the Architecture Decisions the advisor **passed through** as genuine user calls (and for every Decision when the advisor is unavailable).
>
> The other two AskUserQuestion interactions this guide governs are **not** advisor-resolved and keep their existing handling: **Steering Candidate promotion** is a genuine preference / guardrail call that passes straight through to the user (Core Principle #7 keeps it deliberately restrained and user-confirmed — the advisor may inform the recommendation but doesn't resolve it), and the **Medium/Low defer-and-batch** already embodies the gate's "don't interrupt, keep going, surface later" instinct (its outcomes use the existing fix / waiver §3 / backlog homes). So the advisor's *autonomous resolution* is scoped to Architecture Decisions; the two-beat delivery discipline still applies to all three whenever they do reach the user.

## Table of Contents

1. [Core principle: calibrate for the human cognitive limit](#core-principle-calibrate-for-the-human-cognitive-limit)
2. [Two-beat delivery: briefing turn → asking turn](#two-beat-delivery-briefing-turn--asking-turn-two-separate-turns)
3. [✅/❌ comparison table](#-comparison-table)
4. [Three judgment rules](#three-judgment-rules)
5. [AskUserQuestion field usage](#askuserquestion-field-usage)
6. [Example comparison](#example-comparison)
7. [Remediation flow](#remediation-flow)
8. [Write into the Review Log after resolving a Decision](#write-into-the-review-log-after-resolving-a-decision)
9. [Why not write MUST / NEVER](#why-not-write-must--never)

---

## Core principle: calibrate for the human cognitive limit

> This guide is the concretization of SKILL.md's "Calibrate for Cognitive Load" global principle in the **Architecture Decision escalation** scenario — the same lens of "digest the abstraction first, narrate via real use cases, don't assume the user remembers prior context", applied here to translating the reviewer's issue list into a conversation the user can resolve.

The issue list the reviewer produces is raw material; **the main agent can't copy it over verbatim**. Reasons:

- A human can't instantly hold up a vast mental map the way an LLM can. A Round 9 review is cheap context for the reviewer; for the user it's a fresh cold start
- The amount of context per interaction has to be **just right** — too little and the user can't judge, too much and they can't digest
- Asking multiple Decisions together = each compressed into a two-line label = the user understands none of them

**Goal**: the user can make the choice directly, "without flipping to an external doc, without asking you back".

---

## Two-beat delivery: briefing turn → asking turn (two separate turns)

A Decision's context is **not put into** the AskUserQuestion question stem, **nor can it be crammed into the same turn as the AskUserQuestion**. Two reasons:

- the stem is a narrow dialog box in the UI; long context crammed in there is hard to read, and a code preview gets collapsed ("N lines hidden")
- the "mid-turn text" placed before a tool call **displays unreliably** — in practice, the result of briefing + a same-turn AskUserQuestion is that the user only sees the option cards and the whole briefing is invisible; this happens on both CLI and remote-control. Only the turn's **final message** is guaranteed to display on all clients

Delivery is a fixed two beats (= two turns):

1. **First beat (briefing turn)**: output the Decision briefing in the conversation, **delivered as the turn-final message and then end the turn right there** — no tool call follows it. Content:
   - where this Decision came from (review-process context: what the prior rounds handled, why it surfaces now)
   - **state the problem via a real use case** (per briefing-guide.md principles): in what scenario this choice would make a difference, and the consequence of each path in that scenario — not a pure conceptual proposition
   - explain project-specific terminology the first time it appears — the user hasn't read the reviewer's issue list, so words like "series / occurrence / re-arm" are blanks to the user
   - put code snippets and a same-codebase comparison group in this beat (chat markdown renders fully, with syntax highlight)
   - fixed ending: "Reply when you've read it and I'll send the options; you can also state your position directly in your reply"
2. **Second beat (asking turn)**: after the user replies, send the AskUserQuestion — the question stem is short (a 1-3 line proposition, can say "background see the explanation above"), options keep label + multi-dimensional description + `preview`. **If the user already stated a position directly in their reply, skip the asking** and handle it via the "write into Review Log after resolving a Decision" flow.

**This rule applies to all AskUserQuestion interactions in this skill** — Architecture Decision resolution, Medium/Low defer-and-batch asking (fix / waive / backlog), Steering Candidates batch confirmation: **the user always understands the problem in the conversation first (briefing turn), then makes the choice in the dialog box (asking turn)**.

---

## ✅/❌ comparison table

| ✅ Do | ❌ Don't |
|---|---|
| Deliver the briefing as the turn-final message and end the turn; only the next turn, after the user replies, send the short-stem AskUserQuestion | Briefing + a same-turn AskUserQuestion (mid-turn text doesn't show, briefing invisible); stuffing context into the question stem (hard to read in the dialog box); dumping options with no account of where they came from |
| Briefing states the problem via a real use case (in what scenario the two paths differ) | Pure conceptual proposition + unexplained project terminology ("the re-arm timing of a series" is a blank to the user) |
| Paste the code snippet directly for a function / SQL / config (in the first-beat text) | Prose describing the code ("returns bool at line 142") |
| Include a comparison group — code of a similar API in the same codebase | Only saying "inconsistent with other APIs" without showing which APIs, or how to be consistent |
| Option `description` covers at least the universal core 3 dimensions (architecture / consistency / functional risk), adding others depending on the Decision's nature | Writing only a single-dimension consequence like "will break X"; or padding with N/A to fill blanks |
| Use the `preview` field for a before/after diff or the full function | Code details described in prose but not shown |
| Split fully independent Decisions into multiple `AskUserQuestion` calls | Stuffing multiple unrelated Decisions into one question |
| Parallel related Decisions (shared context, independent answers) use one call with multiple questions fields | Conditionally coupled (B depends on A) forced into multi-questions too — the tool doesn't support this dependency |
| Conditionally coupled Decisions use a composite option or sequential asking | Assuming multi-questions can express an "if A then B" structure |
| Mark the reviewer's issue number (e.g. "Decision BT") so the user can map back to the raw issue list | Renumber / not citing the original issue ID |

---

## Three judgment rules

### 1. Context-First

The first beat's Decision briefing must establish background first, covering at least three things:

**(a) Review-process context** — how did this Decision surface?
- what related problems the prior review rounds handled (e.g. "Rounds 1-8 already aligned the whole read path; this is the lone straggler")
- why it was only listed as a Decision this round (was it earlier thought to be a bug, then judged to be a design choice)
- whether design.md / requirements.md has an explicit rule on this point — if not, why a resolution is required this time

**Without this layer of context, the user sees an isolated set of options; with it, the user sees "why we're asking this now"**.

**(b) Put the code directly, no prose description**

```
❌ "has_related(conversation_id) returns bool at conversation_service.py:142"
✅ Paste the function body code block directly
```

Prose describing a function is degraded second-hand information. The user grasps the signature, SQL, and behavior at a glance from the code, whereas prose forces them to reassemble it in their head. **Function signatures, SQL snippets, config schemas are always shown as code**; prose is only for filling in the context the code can't reveal (why it's written this way, what it's being compared against).

**(c) Comparison group** — the baseline of a similar API within the same codebase

Include a chunk of related function / adjacent-module code so the user can see "what the current codebase convention is". This is the basis for architectural / consistency judgment.

### 2. Relationship patterns between Decisions

`AskUserQuestion` can pack 1-4 questions at once — but this tool feature **doesn't support conditional dependency** (B's options depend on A's choice). All questions are "presented at once, answered at once". So the three patterns each have a corresponding presentation:

**(a) Independent Decisions** (two Decisions unrelated, e.g. "GC order" + "another API's naming")
→ **split into multiple `AskUserQuestion` calls**, one Decision each, each getting full context

**(b) Parallel related Decisions** (shared review context, but the user can answer independently; e.g. "Logging format" + "Retry backoff" surfacing in the same review round — both are convention choices for this module, but the answers don't depend on each other)
→ **one `AskUserQuestion` with multiple questions fields** (1-4 questions), sharing a single review-context preamble, the user decides all at once

**(c) Conditionally coupled Decisions** (B's options depend on A's choice; e.g. "whether to add cache invalidation" + (if yes) "TTL vs invalidate-on-write")
→ multi-questions fields **don't apply**. Two alternatives:
  - **Composite option**: merge into one question, with options listing the combinations directly "don't add / add+TTL / add+invalidate-on-write"
  - **Sequential**: ask A first; after the user answers, send a second `AskUserQuestion` for B

Judgment flow:

```
Do the user's choices on the two Decisions affect each other?
├─ Completely unrelated → (a) split into multiple calls
├─ Shared context, independent answers → (b) one call, multiple questions
└─ B's options depend on A's answer → (c) composite option or sequential
```

**Why**: splitting lets the user focus on one decision at a time; merging ((b)) saves the user switching cost but requires confirming they're truly independent; forcing conditional coupling into (b) produces the awkward "the user picked A only to find B's options don't apply under that A".

### 3. Multi-dimensional trade-off

Each option's `description` can't state only a one-way consequence. An Architecture Decision is hard to resolve precisely because of the **multi-dimensional trade-off** — choosing A is good on one dimension, bad on another. List them dimension by dimension so the user can choose by their own priorities.

**Universal core (recommended to cover all)**:

| Dimension | What to look at |
|---|---|
| **Architecture** | whether it strengthens / weakens design.md's invariants; whether it introduces a new design branch; whether it's consistent with the architectural pattern (layered / hex / CQRS...) |
| **Consistency** | how similar APIs / modules in the same codebase do it; whether this choice "aligns with the mainstream" or "becomes an exception" |
| **Functionality / risk** | quantifiable consequences like API break, performance, leak surface, rollback |

**Common supplementary dimension (add when code readability is involved)**:

| Dimension | What to look at |
|---|---|
| **Authoring convention / cognitive load** | whether the signature, naming, error handling, test style, dependency-injection style match the codebase convention; the cognitive cost for a new engineer reading it |

**Other Decision-specific dimensions**:

Don't pre-enumerate the full pool; the main agent decides which to add based on the current Decision's nature. Common ones are:

- **Reversibility** — how hard it is to back out after choosing (schema change / data migration / external API)
- **Testability** — DI style, mock strategy, fixture design changes
- **Observability** — production debug story / how easily on-call can take over
- **Extensibility** — how easy it is to add a future case
- **Development cost** — path A 1 day vs path B 3 days
- **Domain-specific**: performance, security surface, external contract, migration path

**Don't write "N/A" just to fill a dimension**. If it doesn't apply, don't list that dimension — save the space for the dimensions that are genuinely in trade-off.

**Why it's designed this way**: the reviewer usually only writes the "functionality / risk" dimension in detail, but what the user cares about when resolving is often "will this path drive the codebase toward long-term consistency". Fixing 3 core dimensions guarantees the floor; other dimensions are added at the main agent's judgment, avoiding it becoming a fill-in-the-blank form.

### 4. Information-volume ceiling

The sum of context in a single interaction, estimated for the user to read in 1-2 minutes. Over that, split / extract into a reference.

| Component | Suggested length |
|---|---|
| First-beat Decision briefing (incl. code snippet, conversation text) | 15-40 lines |
| Question stem | 1-3 lines (proposition + "background see above") |
| Each option description | 6-15 lines (the core 3 + supplements as warranted) |
| Preview-field code snippet | ≤ 30 lines |

**Over-limit self-check**: is there too much background restatement (you can point to an existing design.md / plan file instead of re-pasting it in full)? Did a second marginal Decision get stuffed in? Can some dimension's description be condensed further?

---

## AskUserQuestion field usage

| Field | Purpose | When to use |
|---|---|---|
| `question` | The Decision proposition (short — background is in the first-beat text briefing, the stem can say "see above") | **required** |
| `header` | Short tag (< 12 chars) | **required** |
| `options.label` | One-phrase direction (1-5 words) | **required** |
| `options.description` | Trade-off and consequences | **required for every option** (cannot be empty) |
| `options.preview` | Code snippet / diff / file content | use when specific code / config is involved |
| `multiSelect` | Allow multiple selection | usually false; only true for feature toggles that "aren't mutually exclusive" |

**Scenarios where the `preview` field is especially useful**: function-signature changes, SQL snippets, JSON schema diffs, file-structure comparisons — a plain-text description distorts, a code block is directly understandable.

---

## Example comparison

### Bad example (reproducing an actual scenario)

```
question: "Decision BT: should has_related() ACL hint apply the ownership filter?"
header: "has_related ACL"
options:
  - label: "leave as follow-up"
    description: ""
  - label: "fix in this pass: has_related applies _OWNERSHIP_SQL"
    description: "add conversation_id/type parameters"
```

**Why this is a bad example**:

1. **No review-process context** — the Decision seems to pop out of nowhere; the user doesn't know what the prior rounds were doing or why this surfaces only now
2. **No code comparison** — which function is `has_related()`, what structure is `_OWNERSHIP_SQL`, all left to the user's imagination
3. **No comparison group** — no baseline of "how a similar API in the same codebase does it", so the user has no basis to judge the consistency problem
4. **trade-off only one dimension** — Option 2 only touches "functional impact" (added parameters, complexity); the universal core's architecture / consistency are entirely absent, so the user can't see the long-term impact
5. **Option 1's `description` is blank** — the user can't see what the cost of "leave as follow-up" is
6. **The `preview` field isn't used** — pasting the function signature directly as code is 100x clearer than a prose description
7. **The either-or framing is too narrow** — an Architecture Decision usually has 3-4 paths (e.g. ContextVar injection); offering only 2 options means the reviewer has already pruned branches

### Good example

**First beat — output the Decision briefing in the conversation** (ordinary markdown text, before the asking):

> **Decision BT — should `has_related()` apply the ownership filter?**
>
> First the scenario: the conversation list page calls `has_related()` on each conversation to ask "does this conversation have an associated memory", and the UI shows a small icon accordingly. It only returns true/false, not the memory content — and that's exactly the crux: **if user A's conversation is associated with user B's memory, the current implementation returns true**. A sees the hint "there is a related memory" but clicks in and can't see the content. Whether this hint counts as a leak has no industry-standard answer.
>
> Review context: Rounds 1-8 already applied the ownership filter to the other three read-path APIs (`fetch_by_id` / `list_by_user` / `search_memory`); `has_related()` is the lone straggler. It was flagged Critical Bug in prior rounds; after you raised "a hint that doesn't carry content may not count as a leak" in Round 5, it was demoted to a Decision. design.md:88 mandates that read APIs pass the ACL but doesn't cover hint-style APIs — the resolution will be backfilled into design.md to complete this invariant.
>
> Current implementation (conversation_service.py:142):
> ```python
> def has_related(conversation_id: str) -> bool:
>     rows = db.query(
>         "SELECT 1 FROM memory WHERE conv_id = ?",
>         conversation_id,
>     )
>     return bool(rows)
> ```
>
> Same-module comparison group — `fetch_by_id` is the standard form of the current read APIs:
> ```python
> def fetch_by_id(user_id: str, conversation_type: str, memory_id: str):
>     sql = f"SELECT * FROM memory WHERE id = ? AND {_OWNERSHIP_SQL}"
>     return db.query(sql, memory_id, user_id, conversation_type)
> ```

(After the first beat is delivered, **end the turn**; after the user replies "ok" or voices an opinion, only the next turn sends the asking below — if the user already stated a position directly, skip it)

**Second beat — AskUserQuestion** (short stem, context already in the previous turn):

```yaml
question: "Decision BT — should has_related() apply the ownership filter? (scenario and code comparison see the explanation above)"
header: "has_related ACL"
options:
  - label: "leave as follow-up"
    description: |
      Open a follow-up issue, this PR doesn't touch has_related().

      Architecture: retains the unstated design branch "hint API doesn't go
      through ACL"; design.md must add an explicit "hint-style API may skip
      ACL" invariant, otherwise a future new hint API has no reference basis.

      Consistency: 1 of the 4 read-path APIs is an exception; after this
      refactor a misaligned tail remains, to be re-raised in every related
      review afterward.

      Functionality / risk: cross-user state residue is small in scope (bool
      doesn't carry memory content); if a row-level security policy is
      introduced in the future, this function must change along with it.

      Reversibility: very high — a filter can be added back at any time; but
      "fix it later" in practice often becomes never-fix, which must be
      factored in.

  - label: "fix in this pass (apply _OWNERSHIP_SQL)"
    description: |
      has_related() gains two required parameters user_id, conversation_type, applies _OWNERSHIP_SQL.

      Architecture: the read path is fully aligned to "ownership filter
      everywhere"; design.md can establish the clear, exception-free invariant
      "all reads, including hints, must pass the ACL".

      Consistency: the 4 read APIs' signatures and SQL structure are unified,
      0 cognitive cost for a new engineer.

      Authoring convention / cognitive load: the signature gets fatter (3
      required parameters), deviating from the usual concise form of a
      predicate function; but it aligns with the conversation_service.fetch_*
      / list_* / search_* family. Trade "predicate conciseness" vs "intra-module
      consistency".

      Functionality / risk: API break — 3 callers must be changed in sync +
      the corresponding tests rewritten; but the leak fix is consistent with
      this refactor's main thrust, and one review is less work than two.
    preview: |
      def has_related(user_id: str, conversation_id: str, conversation_type: str) -> bool:
          sql = f"SELECT 1 FROM memory WHERE conv_id = ? AND {_OWNERSHIP_SQL}"
          rows = db.query(sql, conversation_id, user_id, conversation_type)
          return bool(rows)

  - label: "switch to ContextVar injection"
    description: |
      Signature unchanged, read user_id / conversation_type from a request-local
      ContextVar. Can still apply _OWNERSHIP_SQL, but the caller need not pass
      ACL parameters.

      Architecture: introduces a new "implicit context" branch; all of
      conversation_service's current APIs spell out user_id (explicit dependency
      injection). It would split into two styles.

      Consistency: deviates from the codebase mainstream (all explicit pass),
      but aligns with web framework convention (flask.g / FastAPI Depends).
      Depends on the codebase's overall preference.

      Functionality / risk: no API break for callers; but if the ContextVar
      isn't set on some code path (e.g. a background task), it would silent-fail
      or raise — a guard must be added.

      Testability: unit tests must mock the context, whereas the original
      explicit pass just passes the value. Cascade impact: the whole
      conversation_service test suite's style needs adjusting — this option's
      real point of contention is here.
```

**What this good example does right**:

- **Two-beat**: context is all in the first-beat conversation text (markdown rendered fully, code with highlight, staying in scrollback), the question stem is left with just a one-line proposition — not fighting the UI dialog box for space
- **Opens with the scenario**: the first paragraph is the use case ("list-page icon → A sees the hint of B's memory"), the user instantly knows what's being argued — not starting from a concept term like "hint API ACL"
- **Review-process context**: accounts for "what the prior rounds did, why it surfaces only this round, the design.md rule gap"
- **Code put directly**: both the function body and the comparison group `fetch_by_id` use a code block rather than prose
- **Comparison group**: includes the same module's `fetch_by_id` as a baseline, so the user sees "the current convention"
- **All three options cover the universal core 3 (architecture / consistency / functional risk)**, but the supplementary dimensions differ:
  - Option 1 (follow-up) adds "reversibility" — because this option is essentially deferring the decision, reversibility is the core issue
  - Option 2 (fix together) adds "authoring convention / cognitive load" — because the fatter signature is the core contention
  - Option 3 (ContextVar) adds "Testability" — because this path's real cost is in the cascade impact on test style
- **Every option points out that option's "real point of contention"**, not distributing ink evenly
- **The third option reveals "there's a path beyond the two"** — an Architecture Decision usually isn't either-or
- Cites the reviewer number `Decision BT` so the user can map back to the original issue list
- Doesn't assume the user remembers what `_OWNERSHIP_SQL` / `has_related` is — sees it directly in the code

---

## Remediation flow

If, after sending the `AskUserQuestion`, the user asks back "what is this?" "I can't understand the options":

- **Don't add an explanation onto the original question** — the original question's options are already rooted in insufficient context
- **Send a new `AskUserQuestion`**, folding the user's question into the new question's background narrative

This flow is also a signal: next time you handle a similar Decision, the background narrative should unfold earlier.

---

## Write into the Review Log after resolving a Decision

After the user answers a Decision via `AskUserQuestion`, the main agent must immediately write the conclusion into `review-log.md` §2 Architecture Decisions section. For the write-in rules see `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/review-log-guide.md`; the key points:

- The Decision title uses the reviewer's original letter ID (e.g. `### Decision D (raised at D2)`), not renumbered
- Required fields: `Problem` / `Options considered` / `Chosen` / `Rationale (user, YYYY-MM-DD)` / `Affects`
- The `Rationale` field writes the free-text reason the user added in AskUserQuestion (if any) + the main agent's summary — **don't just write "user picked Option 2"**, write "why"
- Sync-update the §1 Audit Trail table: that Decision's row Status changes to `decision-resolved`, Resolution changes to `→ §2 Decision <letter>`

**Why write in immediately rather than batch**: right after the user answers the AskUserQuestion, the rationale is still in their own words; if you wait until all Decisions are resolved and then batch-backfill, the details are already distorted and easily lost.

### When the advisor resolved it (not the user)

A Decision the **advisor** settled (per the advisor gate) is written into §2 the same way, with three differences that keep its provenance honest and its status reversible:

- the entry is tagged **`[advisor-resolved · pending your review]`**
- the `Rationale` is attributed **`(advisor, YYYY-MM-DD)`** and carries the advisor's reasoning (not "advisor picked Option 2" — *why*)
- the §1 Audit Trail Status is **`advisor-resolved`**, Resolution `→ §2 Decision <letter> (advisor)`

It is **not** delivered via AskUserQuestion at resolution time (recording is silent, like backlog bookkeeping — asking each time would reintroduce the interruption the gate exists to remove). Instead it is surfaced **in the next briefing / Summary** as a "confirm or override" line. If the user **overrides** it there, re-record §2 with their choice + `Rationale (user, YYYY-MM-DD)`, drop the `pending your review` tag, flip §1 to `decision-resolved`, and reflect the new content into design.md as neutral prose via the `spec-author` session — exactly as a freshly user-resolved Decision. If the user lets it stand, drop the `pending` tag (keeping the advisor attribution); the briefing was their chance to object. Full mechanics: `advisor-gate-guide.md`.

### The promotion judgment after resolving (Steering Evolution hook point)

After finishing §2, immediately think one more step: does this Decision establish "**a choice for just this feature**" or "**a project-level principle**" (which other future features should also follow)? Clues for the judgment: does the rationale appeal to feature-agnostic reasons (workload characteristics, team preference, codebase consistency), should future similar choices simply reuse it without asking again. **The default is "just this feature", don't promote** — only when it clearly appeals to a feature-agnostic reason, and not recording it in steering would cause future inconsistency, treat it as a project-level principle; most Decisions are the former.

If it's a project-level principle, per SKILL.md "Steering Evolution Mechanism" propose writing it into steering right then — the user has just resolved it, the context is still warm, and the cost of following up with "should this go into tech.md as a general rule?" is lowest. After confirmation, lightly write it in + record into review-log §5.

### How a Decision's result reflects into design.md / tasks.md (neutralization principle)

**Isolation discipline**: Decision content (Options comparison, Chosen, Rationale, Round source) **may only live in `review-log.md §2`**. design.md / tasks.md **must not**:

- write a `## Architecture Decisions` / `## Decisions Record` / `## ADR` section
- write a `(per Decision X)` reviewer letter tag
- write a `→ review-log §2 Decision X` footnote pointer (fully abolished)
- write review-process narrative like "the user resolved it in Round N by picking Option 2"

**If a Decision's result needs to reflect into design.md (e.g. the user picked Option 1 rather than Option 2, which affects some Component's design)**, the approach:

- write the **content** of Option 1 (not the label "Option 1") directly into the corresponding Component section
- the design rationale uses **neutral prose** — write the technical reason for "why it's designed this way", **not** "why Option 1 was chosen over Option 2"
- don't reveal the Decision number / Round source / the user's resolution process

**Example**:

The user resolves Decision D as "TTL invalidation, 60s".

- ❌ design.md writes: `CacheService uses 60s TTL (per Decision D, user resolved it in Round 3 by picking Option 1)`
- ✅ design.md writes: `CacheService uses 60s TTL, because the read-heavy workload (read:write ≈ 100:1) can tolerate 1 minute of staleness; explicit invalidation needs an event-broadcast mechanism, which the current workload doesn't justify the complexity of`
- ✅ review-log.md §2 writes: `### Decision D (raised at D2)\n**Problem**: Cache invalidation strategy — TTL vs explicit\n**Options considered**: ...\n**Chosen**: Option 1\n**Rationale (user, 2026-05-12)**: ...`

The two are **complementary in content but don't cite each other**: design.md is the technical description, review-log.md is the decision audit, physically isolated.

**Why 100% isolation**: design.md / tasks.md are the repeatedly-read truth source; mixing in a Decision audit trail dilutes the density of the technical description. In practice, once a footnote pointer is allowed the agent drifts into an ADR section + reviewer letter tags — the only reliable discipline is to fully forbid any review-log reference. Full bad/good comparison: `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/review-log-bad-examples.md`

---

## Why not write MUST / NEVER

skill-creator philosophy: explaining "why this matters" is more effective than a hard rule. This guide's "✅/❌" are the empiricist's "doing it this way is better in this plugin context", not prohibitions. For example:

- "split unrelated Decisions into multiple calls" is **usually** right; but if all three Decisions are nit-pick-level Low and the user has stated "give them to me in a batch", merging is also reasonable
- "every option description is required" is **usually** right; but if two options really differ by a single word (e.g. "adopt" vs "don't adopt"), description can be omitted when the label suffices

The criterion is always "**can the user make the choice without asking you**".
