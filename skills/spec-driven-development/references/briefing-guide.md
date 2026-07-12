# Spec / Plan Briefing Guide

Before implementation starts, the main agent uses **conversational output** to summarize for the user the key points and important concepts of the whole spec / plan.

## Trigger points

| Flow | Timing | Form |
|---|---|---|
| /create-spec | End of Plan Mode, **before ExitPlanMode** | Plan Briefing (direction confirmation, lightweight) |
| /create-spec | After both verifiers pass (spec finalized) | Full Spec Briefing |
| /update-spec | End of Plan Mode, **before ExitPlanMode** | Plan Briefing (change plan) |
| /update-spec | After design-review + verifier pass (changes finalized) | Full Spec Briefing |
| /implement | At startup, when this feature has not been briefed in this session yet (typical: implementing in a later session) | Condensed briefing |
| Quick Fix Mode | After the design-reviewer loop converges, **before ExitPlanMode** | Plan Briefing |
| Any plan flow (resume) | After a restart where plan mode was lost and the flow was manually re-entered, **before ExitPlanMode** | Condensed briefing (rebuild context) |

**General rule**: any moment when the user is about to face "a big chunk of plan or spec to digest" calls for a briefing. Every Plan Briefing **before ExitPlanMode** is enforced and protected by a hook (see "Three-layer reminder architecture" layer 3 below); the closing Spec Briefing relies on the verifier report as a reminder (layer 2) + the SKILL steps.

## Why a briefing is needed

**Core: the briefing exists to lower the cognitive load of "reading the whole plan/spec", not just to be a review gate.** The plan file / spec docs are optimized for "repeated future reference" — structured, complete, mechanically verifiable, but **not** optimized for "getting up to speed the first time". In practice the user won't necessarily read every word; without a briefing, misunderstandings only surface after implementation, where the cost to correct them is an order of magnitude higher.

So **any moment when the user is about to face a big chunk of plan/spec (every plan-exit, every spec finalization) should have a briefing**, letting the user build the right mental model within 2-3 minutes and **trigger discussion at the cheapest point**. ExitPlanMode presents the full plan file (the document layer); the briefing is its **human entry point** (the comprehension layer).

## The briefing is a blocking checkpoint (must be delivered as the "turn-final message")

Two systemic facts dictate the delivery form:

1. **A plain-text step with no stop point does not stop the agent** — the agent will cram the briefing and the next step into the same turn, or even skip the step entirely
2. **"Mid-turn text" placed before a tool call displays unreliably** — measured in practice: briefing text + an AskUserQuestion immediately after in the same turn, and the user sees only the option card while the entire briefing goes invisible; this happens in **both CLI and remote-control** (mid-turn text may not render, or may be covered by a later tool's UI). Only the **final message** of a turn is guaranteed to display across all clients

So the delivery rule: **the full briefing text must be the final message of that turn — after outputting it, end the turn immediately and follow it with no tool call** (no AskUserQuestion, no ExitPlanMode, no tool of any kind). Ending the turn is itself a mandatory stop point: the agent must wait for the user to reply before it can continue.

- The briefing ends with a fixed confirmation question: "Anything here that doesn't match what you expected? If it's fine I'll continue" — **the user's reply is the confirmation**, no need to send another AskUserQuestion option card
- After the user replies with no objection, the next turn proceeds to the next step (ExitPlanMode / ending /create-spec / Stage 1); if there are concerns, follow "Handling user concerns" below
- Note that although ExitPlanMode itself also stops (presenting the full plan text = the document layer), the briefing is the **comprehension layer** stop point — **ExitPlanMode must not replace the briefing turn**; the briefing must be delivered **before** ExitPlanMode, as the turn-final message (the hook will block "ExitPlanMode without a prior briefing")

> **The advisor gate never stands in for the briefing.** The advisor absorbs *decisions taken along the way* (SKILL.md "Advisor Gate Mechanism"), but the briefing and the ExitPlanMode approval are the user's sign-off on *what gets built* — the advisor is a technical reviewer, not the product owner, and can't approve the plan on the user's behalf. So the briefing is always delivered to the user and waits for the user, regardless of the advisor. Its content merely *grows*: the advisor's decisions are folded in as the "confirm or override" block (item 4 above).

### Three-layer reminder architecture (why not rely solely on SKILL.md's step list)

SKILL.md is loaded at the start of the task; the briefing's decision point comes dozens of tool-call rounds later, by which time the step instructions are long gone from the focus of attention (and may even have been summarized away by context compaction). So the briefing is jointly guaranteed by a three-layer mechanism, each layer placing the reminder in **the freshest context at the transition moment**:

1. **Reviewer convergence report** (review-protocol.md conclusion template) — when design-reviewer reports 0 issues, it attaches a next-step reminder
2. **tasks-design-verifier pass report** — when Spec Mode verification passes, it attaches a Spec Briefing next-step reminder
3. **PreToolUse command hook (ExitPlanMode)** — a deterministic Node script enforced by the harness (`hooks/briefing-checkpoint.js`), protecting **every ExitPlanMode** (Quick Fix / create-spec / update-spec / general plan mode alike — a briefing lowers cognitive load for any plan, and being fail-open it won't break plan mode, so it isn't narrowed). It reads the transcript, **skips the agent's mechanical tool turns** (the ToolSearch that loads the deferred ExitPlanMode, the post-approval Edit, and other assistant turns carrying tool_use) + tool_result + injected messages, then checks "whether the first substantive message is a user reply": yes → allow; agent plain text (with no user reply after it, = no briefing or exited without waiting for a reply) → block and return a brief reminder. **Fail-open** (unreadable transcript / parse failure / unexpected structure all allow through), **cannot deadlock** (after a completed briefing + user reply, the preceding message is a user message → allow). It filters out `isSidechain` (subagent messages) and `isMeta` (injected local-command / reminder). This replaces the prompt hook of 1.6.2–1.6.5 — that version was judged by an LLM, couldn't see history, and would overturn its own "always allow" and wrongly block the retry after a completed briefing.

### Remedy

When the user reports "I didn't see the briefing", the first thing to check: was the briefing crammed mid-turn before a tool call (which the client doesn't display)? Remedy: **re-deliver** the briefing as the turn-final message, and end the turn.

## Relationship to the formal-doc isolation discipline

The briefing is **conversational output, not written into any document** — it is not a formal doc, so the 100% isolation discipline **does not apply**:

- The briefing can (and should) reveal the **conclusions** of the review process — the resolved Architecture Decisions, the accepted Waivers and their costs. This is exactly the "why the world is this way" the user needs to grasp quickly, and its source is the review log
- But **do not** write the briefing content back into design.md / tasks.md (that would become process narration, violating the isolation discipline)
- When referencing a Decision / Waiver you may include the ID (`Decision D` / `W1`), so the user who wants to dig deeper can match it against the review-log

## Narrative method: start from a real use case (core requirement)

The difference between a briefing and the plan / design is not length, it is the **narrative perspective**:

- the plan / design describes "**what the system is**" — structured, conceptual, organized by component (optimized for repeated reference)
- the briefing describes "**what the user / system will experience**" — take 1-2 representative use cases and walk the whole design through them, with components and design decisions surfacing naturally within the scenario

A pure conceptual list ("add a CacheService, using TTL invalidation, decoupled from EventDispatcher") builds no picture for someone who hasn't read the spec; the same content told as a scenario — "after the user updates their profile, the next query hits the cache first and may see a stale value for up to 60 seconds, then it updates automatically; this is a resolved trade-off, bought in exchange for queries not hammering the DB" — is instantly understandable.

**This uses the same lens as review** (see SKILL.md "Calibrate for Cognitive Load"): review uses "use case + execution flow + data structure" to find the real-scenario-driven **core design concepts**, and the briefing takes those core concepts and explains the key points to the user through the same lens. So the briefing is not just abstract conclusions — it should bring out the **data structures and execution flows that the scenario actually touches**. Because humans forget across many turns of conversation, and over time forget a project's full architecture; only by restating the relevant data structures / flows along with it can you help the user rebuild their mental model.

How to do it:

- Pick **1-2 representative use cases**: one happy path + one most-important failure / edge path
- Walk the flow along the scenario: components, new concepts, and **the data structures and execution flows the scenario touches** are introduced only "at the moment they enter the stage", and explained through that scenario — don't just give abstract conclusions, and don't assume the user remembers the structures and flows mentioned in earlier turns
- Tell Decisions / Waivers via their **scenario consequences** — not "we chose Option 1", but "because of this decision, the user will experience Y in situation X"
- The narrative form for Quick Fix Mode: "under what operation does this bug occur → what the same operation becomes after the fix → what risk remains"

## Content structure (suggested order, trimmed to task scale)

1. **One-sentence positioning** — what this feature / fix does, and why now
2. **Use-case walkthrough** — the 1-2 scenario narratives above. **This is the body of the briefing** — architecture highlights, new concepts, and data flow are all brought out within the scenario, with no separate concept list
3. **Key design decisions** — the resolved Decisions not covered by the walkthrough, each as a one-line scenario-grounded consequence
4. **Decisions I resolved via the advisor — confirm or override** — the Decisions the advisor gate settled on the user's behalf (review-log §2 `advisor-resolved`), each as a one-line scenario-grounded consequence citing its §2 letter, plus any tier-2 deferred defaults. This is the user's single consolidated review point for everything decided in their absence — the safety valve that makes autonomous resolution acceptable, so it's never omitted when the run has any advisor-resolved decisions. An override is handled like a fresh user Decision (see `advisor-gate-guide.md`). Omit the heading entirely when there were none
5. **Deliberately accepted limitations** — Waivers + the cost each one pays (the user should know "what we gave up")
6. **Implementation outlook** — Phase structure, which areas will be touched, rough scope (Quick Fix: list of changed files + verification method)
7. **Explicit invitation to discuss** — a fixed closing invitation: "If anything doesn't match your expectations, raise it now — it's far cheaper than changing it after implementation"

## Calibration (designed for human cognitive limits — same philosophy as decision-escalation-guide)

| ✅ Do | ❌ Don't |
|---|---|
| Walk the flow from a real use case, introducing concepts only when they enter the scenario | Pure conceptual list — stacking component names + pattern names, building no picture for the user |
| Whole text read in 2-3 minutes (Spec Mode about 20-40 lines; Quick Fix / condensed about 10-20 lines) | Repaste whole paragraphs of design.md — the briefing is a **translation**, not an excerpt |
| Mostly spoken prose, complete sentences | Stacked bullet fragments, abbreviation chains, mechanical form-filling |
| Give a one-line explanation the first time a new concept / project-specific term appears | Assume the user remembers all the naming inside design.md |
| When detail is needed, point to the document location (design.md §X / plan file section) | Cram all the detail into the briefing for completeness |
| Tell the **conclusions** of review (what was resolved, what was waived) | Tell the **process** of review ("I ran 5 rounds, in round 3 I found…" — process narration with no information content) |
| Write on the assumption that the user hasn't read the spec | Write it as a table of contents for the spec ("§3 covers architecture, §4 covers the data model") |

## Handling user concerns

The value of the briefing lies in triggering discussion — after the user responds, handle it by nature:

- **Misunderstanding** → a verbal clarification suffices; where necessary, review where the briefing caused the misdirection
- **The spec / plan really has a problem** →
  - Spec Mode: go back to `/update-spec` to fix it (triggers the corresponding verifier to rerun); if still within the `/create-spec` flow, fix it directly + add a round of design-reviewer
  - Quick Fix Mode: resume the `spec-author` session (Mode 2) to fix the plan file; if the change involves design substance, add a round of design-reviewer before ExitPlanMode
- **A new preference / principle surfaces** → evaluate per the "Steering Evolution Mechanism" whether to promote it into steering

## Condensed briefing (/implement starting in a later session, or re-entering plan mode after a restart)

A compressed version of the full briefing (10-20 lines): one-sentence positioning, one shortest use-case main line (walk the happy path once), resolved Decisions / Waivers one line each, the scope of tasks this /implement will execute. Likewise **delivered as the turn-final message** — after outputting it, end the turn, and only proceed to Stage 1 once the user confirms. The goal is to rebuild context, not to re-discuss — the spec converged in the previous session, unless the user raises an objection on their own.

**Manually re-entering plan mode to resume the flow after a restart** is also a moment for a condensed briefing: reopening Claude Code loses plan mode state, and to resume the user will manually shift+tab back in. At this point, before ExitPlanMode, add a condensed briefing (the key points of this plan + what's next), which both helps the user (and yourself) rebuild the interrupted context and satisfies the briefing checkpoint hook's requirement for "this current plan session" (the hook treats a manual re-entry as a new plan session, requiring a briefing + user reply after the re-entry).
