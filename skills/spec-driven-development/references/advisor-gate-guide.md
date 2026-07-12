# Advisor Gate

Before the main agent stops to ask the user a decision, it consults the **advisor** first — a stronger reviewer model that sees the full conversation transcript. The advisor resolves the calls that have a defensible technical answer, so the user is interrupted only for the choices that genuinely need a human.

> **Why this exists**: on a premium session model the main agent stops to ask the user far more often than the work warrants — many of those stops are "which of these two technically-equivalent paths" questions that a competent engineer would just decide. Each stop costs the user a context-switch, and on an expensive tier the reluctance to decide is itself expensive. The advisor is a cheaper second opinion that absorbs those stops, keeping the user's attention for the decisions that are actually theirs to make.

## Table of Contents

1. [The three-tier gate](#the-three-tier-gate)
2. [What the advisor resolves vs passes through](#what-the-advisor-resolves-vs-passes-through)
3. [Graceful degradation — the advisor may be unavailable](#graceful-degradation--the-advisor-may-be-unavailable)
4. [What the gate does NOT intercept](#what-the-gate-does-not-intercept)
5. [How to consult the advisor](#how-to-consult-the-advisor)
6. [Recording an advisor-resolved decision](#recording-an-advisor-resolved-decision)
7. [Surfacing at the briefing / Summary](#surfacing-at-the-briefing--summary)
8. [Worked example](#worked-example)

---

## The three-tier gate

Whenever the main agent is about to **stop and ask the user a decision or direction question**, it runs this ladder in order — it only reaches a lower rung when the one above genuinely fails:

```
About to stop and ask the user something
        ↓
1. Consult the advisor
   ├─ advisor gives a clear, usable answer  → apply it, record it, keep working
   └─ no usable answer (advisor calls it a user preference / too risky / is itself
      uncertain / the advisor tool is unavailable)
        ↓
2. Can I pick a reasonable default and keep going?
   ├─ yes → proceed on the most defensible assumption, record it for the briefing
   └─ no — genuinely blocking, no safe default exists
        ↓
3. Stop and ask the user  (today's behavior — the two-beat AskUserQuestion / briefing)
```

The ordering matters: **advisor first, defer-and-continue second, interrupt-the-user last**. The whole point is that stopping the user is the most expensive outcome, so it's the last resort — not the reflex.

Tier 2 ("pick a default and keep going") is the same instinct as the backlog: a decision that isn't truly blocking shouldn't halt the work. Proceed on the most likely reading, note the assumption, and let the user correct it cheaply at the briefing rather than paying a mid-task interruption for it. If the deferred point is a chunk of *work* rather than a *decision*, a backlog item is the right home (see `backlog-guide.md`).

---

## What the advisor resolves vs passes through

The advisor is standing in for the user's judgment on decisions where a defensible "best" answer exists — **not** taking over the decisions that are genuinely the user's. It (or the main agent, reading the advisor's reply) triages every stop:

| ✅ Advisor resolves it | ❌ Passes through to the user |
|---|---|
| A defensible technical answer exists given the codebase (consistency with existing patterns, the standard idiom, disambiguating an unclear requirement where context implies the answer) | A genuine **preference / product / business-priority** call the advisor can't see the ground truth for ("should this feature exist", "which UX do we want") |
| "Which of these two equivalent paths" where either is fine and one is marginally more consistent | An **irreversible / high-blast-radius** choice — schema migration, data loss, an external API contract, a security-posture change — even when a technical answer seems clear |
| The kind of choice the user would almost certainly answer with "yeah, do the sensible thing" | Anything the **advisor itself flags as uncertain** or explicitly says is the user's call |

The advisor is well-suited to make *this* meta-judgment too — when you consult it, ask not only "what's the answer" but "is this yours to resolve, or does it need the user". If it says the latter, that's tier-3: pass it through.

**This refines the reviewer's Architecture Decision discipline, it doesn't replace it.** The reviewer still never resolves a Decision itself (`review-protocol.md`, "Architecture Decision discipline") — it hands the four-point raw material up to the main agent exactly as before. What changes is only what the *main agent* does on receipt: instead of going straight to `AskUserQuestion`, it routes through this gate. The clear-cut technical Decisions the advisor settles; the genuine user calls arrive at the same two-beat `AskUserQuestion` they always did (`decision-escalation-guide.md`).

---

## Graceful degradation — the advisor may be unavailable

**The advisor tool is not guaranteed to exist in every environment**, and even where it exists a call can error out. The gate must never depend on it:

- Attempt the consult. If the tool is **absent, disabled, or returns an error**, treat that exactly as tier-1 producing no answer and fall straight through to tier 2 (defer-and-continue) and then tier 3 (ask the user).
- **When the advisor is unavailable, the behavior collapses to precisely today's behavior** — defer where you safely can, otherwise ask the user. Nothing is blocked, nothing waits on a tool that isn't there.

In other words, the advisor gate is a *reduction* in how often the user is interrupted when the advisor is present, and a *no-op* when it isn't. It never makes the user worse off.

---

## What the gate does NOT intercept

The advisor is a technical reviewer, **not the product owner** — so two kinds of stop stay with the human and are never routed to the advisor:

- **Plan / Spec briefings and the ExitPlanMode approval** (`briefing-guide.md`). These are the user's comprehension-and-approval checkpoints — the moment they sign off on *what will be built*. The advisor can't approve the plan on the user's behalf; doing so would defeat the entire purpose of the briefing. The advisor may of course have resolved individual decisions *during* the planning that led up to the briefing — those show up in the briefing for review (below) — but the briefing itself is delivered to the user and waits for the user, unchanged. The briefing checkpoint hook still enforces this.
- **The convergence fuse** (`review-protocol.md`) — when review can't converge after repeated rounds, the structural problem is reported to the user. The advisor can help analyze *why* it isn't converging, but the "we're stuck, here's the call" report is the user's to receive.

The line is: the advisor absorbs **decisions taken along the way**; the user keeps **approving the plan** and **the escalations that mean something is structurally wrong**.

### Scope of autonomous resolution

The advisor's *autonomous resolution* (settle it, record `advisor-resolved`, surface at the briefing) is scoped to **Architecture Decisions** and the **mid-flow "what next" ambiguity stops** (a verification failure, a design flaw found during implementation, a missing/unclear doc — the pauses in SKILL.md's Error Handling table). These are the interruptions the gate is built to absorb. Two neighbouring stop points keep their **existing** handling rather than gaining advisor-resolution machinery:

- **Steering Candidate promotion** is a genuine preference / guardrail call — promoting a principle into steering shapes *every* future feature, so it stays user-confirmed (Core Principle #7 deliberately keeps it restrained). It's a natural "passes through to the user" case; the advisor may inform the recommendation but doesn't resolve it.
- **Medium/Low defer-and-batch** already embodies the gate's own instinct — don't interrupt, keep going, surface the batch later — and its outcomes have homes already (fix now / waiver §3 / backlog). No new recording is layered on top.

And **mode up/downgrade** (recommending Quick Fix ↔ Spec Mode mid-flow) isn't a gate stop at all: the main agent already *decides the routing itself and informs the user* (who can veto) rather than blocking on an ask — there's no interruption for the advisor to absorb, though it's fine to use the advisor as a sounding board on scope.

---

## How to consult the advisor

The advisor automatically sees the full conversation transcript, so the reviewer's issue list, the options, and the surrounding code are already in front of it — you don't re-paste them. When you consult it for a decision:

- State the specific choice and the options on the table, and ask **both** "what would you do" **and** "is this one you'd resolve, or does it need the user's preference/product judgment".
- If the decision came from a reviewer as an Architecture Decision, the four-point raw material (Option 1 / Option 2 / why no consensus / suggested considerations) is the natural thing to put in front of the advisor.
- Take the advice with weight, but it isn't a hard override: if applying it would contradict something you have primary-source evidence for (design.md says X, the code does Y), reconcile that rather than following blindly — same discipline as any advisor use.

---

## Recording an advisor-resolved decision

An advisor-resolved decision is a decision **made on the user's behalf**, so it must land in the durable audit trail and be **visibly flagged as still awaiting the user's blessing** — never silently absorbed. It reuses the existing review-log machinery (no new file type):

- Write it into `review-log.md` **§2 Architecture Decisions**, the same section as user-resolved Decisions, with two differences that mark its provenance:
  - the entry is tagged **`[advisor-resolved · pending your review]`**
  - the rationale is attributed **`(advisor, YYYY-MM-DD)`** instead of `(user, …)`
- In **§1 Audit Trail**, that row's Status is **`advisor-resolved`** (a distinct value from `decision-resolved`), Resolution `→ §2 Decision <letter> (advisor)`.
- **Quick Fix Mode** has no separate review-log file — the same entry goes into the plan file's embedded `## Review Log` section, exactly as user Decisions do there.

The rest of the review-log isolation discipline is unchanged: the *content* of the chosen option still reflects into design.md as neutral prose via the `spec-author` session (never a "Decision X / advisor" tag in the formal docs). See `review-log-guide.md` and `decision-escalation-guide.md`.

**Recording is silent, like backlog and review-log bookkeeping** — no per-decision confirmation at the moment the advisor resolves it (that would reintroduce the very interruption the gate removes). The confirmation happens in one batch, at the briefing.

---

## Surfacing at the briefing / Summary

The user gets **one consolidated review point** for everything the advisor decided in their absence — this is the safety valve that makes autonomous resolution acceptable:

- Every briefing (Plan / Spec / condensed) and every end-of-flow Summary includes an explicit **"Decisions I resolved via the advisor — confirm or override"** block: each advisor-resolved decision as a one-line, scenario-grounded consequence (per `briefing-guide.md`'s use-case-driven style), citing its review-log §2 letter so the user can dig in.
- The user can **override any of them** in their reply. An override is then handled exactly like a freshly user-resolved Decision: re-record §2 with the user's choice + `Rationale (user, YYYY-MM-DD)`, drop the `pending your review` tag, update the §1 row to `decision-resolved`, and — if the change affects the design — dispatch the `spec-author` session to reflect the new content into design.md as neutral prose. A decision the user leaves untouched keeps its advisor attribution but sheds the `pending` tag (the briefing was their chance to object).
- Tier-2 deferred defaults (the "picked a reasonable default and kept going" assumptions) are surfaced in the same spirit, so the user can correct an assumption as cheaply as an advisor call.

The reason the briefing is the right venue: it's already the moment the user builds their mental model of the work and is invited to push back at the cheapest point. Folding the advisor's decisions into that same moment means the user reviews them with full context, in one pass, instead of N interruptions scattered through the work.

---

## Worked example

Two Decisions surface in the same implementation-review round. Watch the gate send them to different places:

**Decision I2-B — "read the record owner from an explicit param or a request-local ContextVar?"** The advisor is consulted and answers: "Explicit param — the other three read APIs in this module already take it explicitly; a ContextVar would open a second, implicit dependency style for no benefit here. This is a consistency call, not a preference — resolve it." → **Tier 1**: the main agent applies explicit-param, writes `review-log.md` §2 `### Decision I2-B … [advisor-resolved · pending your review]` with `Rationale (advisor, …)`, and keeps working. At the next briefing: *"I2-B — read APIs take the owner explicitly, so `has_related()` now does too (advisor call for consistency). Say the word to switch it to a ContextVar."*

**Decision I2-C — "should deleting a memory hard-delete the row or soft-delete with a `deleted_at` tombstone?"** The advisor is consulted and answers: "This one's yours. It's an irreversible data-model call with product weight — tombstones change your retention/GDPR story and every downstream query. I'd lean soft-delete, but you should decide." → **Tier 3**: it passes through to the user as the usual two-beat AskUserQuestion (`decision-escalation-guide.md`), because it's a genuine product/irreversible call — exactly what the gate is careful *not* to absorb.

The same round, the same consult mechanism, two outcomes: the consistency call is settled and logged for review; the product call reaches the user with the advisor's lean noted but the choice left to them.
