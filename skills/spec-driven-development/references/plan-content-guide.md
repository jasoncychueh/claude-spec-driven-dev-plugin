# Plan / Design Document Content Guide

This document governs what a **design-type document** (the quick fix mode plan file, the spec mode design.md) should and should not contain. The principle is the same for both document types — the only difference is length and degree of formality.

## Core principle: write substance, not process

The document's readers (humans or the reviewer agent) care about "**what is being done this time, why, and what the risks are**". **Process details are guaranteed by the skill itself**, and don't need to be restated by the plan / design.

Writing process narration amounts to:
- Repeating what SKILL.md already promises
- Wasting the reviewer's tokens
- Blurring the substance that actually matters — after reading it, the user doesn't know which files you're going to change

## ✅/❌ comparison table

| ✅ Write | ❌ Don't write |
|---|---|
| **Context** — the trigger cause, the current problem, the expected post-change state | **Process narration** — "I'll invoke X and then X will ..." |
| **Change list** — specific file paths + change scope, **including the tests to add or change** (Quick Fix has no separate tester, so the plan is where test scope is decided; name the behavior each test verifies, not the code path it walks) | **Skill discipline restatement** — moving review-protocol.md clauses into the plan |
| **Risk assessment** — specific regression / API break / behavior change | **Mode comparison table** — "why not the other mode" (mode-selection.md already covers it) |
| **Architecture Decisions** (**only inside the `## Review Log` section of the Quick Fix Mode plan file**) — the Quick Fix plan file is itself the review log container; Decisions are staged here and resolved by the user | **`## Architecture Decisions` / `## Decisions Record` / `## ADR` sections written into spec mode's design.md** — in Spec Mode all Decision content can exist only in review-log.md §2, while design.md is completely clean with no reference |
| **Reason for an extension** — when the change extends existing structure and a redesign option was in view, one sentence in the change description (or the component text in design.md) saying why the redesign was not taken (see "Don't bolt on" in `design-principles.md`) | **A citation of a design principle** ("per the … principle", `design-principles.md`) — principle names live only in the review; write the reason itself |
| **Verification method** — specific runnable commands / test list | **Estimated number of review rounds** — the reviewer decides; it shouldn't be estimated |
| **Out-of-scope** (spec mode) — explicit boundaries | **Definition of Done** — the exit conditions the skill executes automatically |
| **Neutral design rationale** (spec mode design.md) — if a Component design needs to explain "why it is designed this way", integrate it into the Component description using neutral prose about technical constraints / codebase conventions | **Agent invocation sequence** full narration |
| | **Any reviewer letter tag** (Decision X / Bug Y / Smell Z) / **Round process narrative** / **a reference / footnote pointer to review-log.md** — the formal doc is 100% isolated |

## Example comparison

### Substance (good example — Quick Fix Mode plan file)

```markdown
## Context
GET /profile returns a 500: user_service.get_user_profile() raises AttributeError when user_id=None.
The None originates in routes/profile.py: `request.args.get("user_id")` is None when the query
parameter is missing, and the handler passes it straight to the service. The route is the input
boundary and does not validate. The response for a missing id is to be decided in the review stage.

## Change list
- agent_service/routes/profile.py:18 — parse `user_id` into a non-empty `UserId` at the route; a missing or empty value returns 400. This extends the existing handler rather than adding a request-parsing layer: profile is the only route that takes an id today
- agent_service/services/user_service.py:42 — `get_user_profile` takes a `UserId`; no None handling inside the service
- tests/routes/test_profile.py — three tests, by behavior: missing user_id returns 400 / empty string returns 400 / a valid id returns the profile

## Risks
- Other callers of `get_user_profile` that pass a raw str fail type checking and must construct a `UserId`
- Clients that omitted user_id got a 500 before; they now get a 400

## Verification method
1. `pytest tests/routes/test_profile.py -v`
2. `grep -r 'get_user_profile' agent_service/` to confirm callers construct a `UserId`
3. `podman compose build agent-service`

## Review Log
### 1. Audit Trail
| Round | ID | Severity | Status | Resolution |
|-------|-----|----------|--------|------------|

### 2. Architecture Decisions
**Decision A — response for a missing user_id**
- Option 1: 400 with an error body — explicit; clients that omit the id learn immediately
- Option 2: default to the session's user — convenient; hides a client bug
- To be resolved by the user in the review stage (after resolution, add Chosen + Rationale)

### 3. Waivers / 4. False Positives
_(none)_
```

**Key difference**: Architecture Decisions are written in the plan file's dedicated `## Review Log` section (the plan file is itself the Quick Fix Mode review log container), **not in the plan body**.

### Good example of Spec Mode design.md

design.md **does not write** an Architecture Decisions section at all. If a Component design needs to explain "why it's done this way", integrate it into the Component description with **neutral design rationale**:

```markdown
## Components and Interfaces

### UserService
- **Purpose:** handle user profile reads and writes
- **Interfaces:**
  ```python
  def get_user_profile(user_id: UserId) -> UserProfile:
      """Return the profile for a parsed user id.

      Rationale: the id is parsed once at the route, the input boundary, as in
      AuthService and BillingService in the same module; re-checking it here would
      leave two copies of the rule to keep in sync.
      """
  ```
- **Dependencies:** UserRepository
```

**This neutral rationale does not mention**: the reviewer, a Decision letter, the review-log, Round N.
**It does mention**: the technical reason (one validation point at the boundary) + the codebase convention reference (AuthService, BillingService) + the negative consequence (two copies of the rule drift apart).

The full Decision record (Options comparison, the user's rationale for resolving it, the Round source) goes in `review-log.md §2`, **physically isolated** from design.md.

How a design principle's handling appears: as ordinary design prose in the component text, with the reason — never a citation of the principle:

```markdown
### ProfileRepository
- **Purpose:** persist profile updates
- **Interfaces:** `save(update: ProfileUpdate) -> None` — writes with a `(user_id, version)` unique key + upsert: profile-update messages are redelivered, and a duplicate delivery must be a no-op
```

### Process narration (bad example)

```markdown
## Mode selection: Quick Fix Mode  ← 30-line judgment table + why not Spec Mode
## Full workflow overview  ← 80-line ASCII flow chart
## Agent invocation sequence  ← 50-line table listing every agent invocation
## Review Loop mechanism  ← 70 lines reciting review-protocol.md
## Architecture Decision handling  ← 30 lines reciting review-protocol.md again
## Discipline highlights  ← 20 lines reciting why review matters
## Definition of Done  ← a completion checklist, things the skill executes automatically
```

The first is 50 lines of useful substance; the second is 300+ lines of noise (each section repeats what the skill / reference already said).

## Length guidance

| Document type | Expected length |
|---|---|
| Quick fix plan (single bug / small refactor) | 30-80 lines |
| Quick fix plan (medium refactor) | 80-150 lines |
| Spec mode design.md (small to medium feature) | 200-400 lines |
| Spec mode design.md (complex system) | 400-800 lines |

**When over the limit, self-check**: am I narrating process? Restating skill discipline? Doing an unnecessary mode comparison? Estimating review rounds? — any yes, just delete it.

## Exceptions

There are only two reasonable cases where process detail may be written:

1. **The flow deviates from the skill default**: e.g. "this spec mode task will skip Stage 1 and go straight to Stage 2 because some code already exists" — this is a meaningful deviation
2. **A complex dependency sequence**: spec mode tasks.md listing the implementation dependency order — planning the order **specific to this feature**, not narrating skill process

In ordinary cases, **default to not writing process**.
