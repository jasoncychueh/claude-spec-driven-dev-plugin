# Review Log — {feature}

> This document records the review/resolve process for this feature.
>
> **Formal docs** (requirements.md / design.md / tasks.md / production code) describe "what the world looks like after the decisions are made".
> **This log** describes "why this world, what was rejected along the way, and which principles were deliberately waived".
>
> **Isolation discipline**: this log is **physically isolated** from the formal docs — the formal docs contain no review-log reference / pointer / letter tag at all. If a Decision outcome needs to be reflected into design.md, take the **content** of the chosen option and integrate it into the Component description as **neutral design rationale** (technical / codebase conventions / adverse consequences), without revealing the reviewer / Decision number / Round source.
>
> For writing conventions see the spec-driven-development plugin's `references/review-log-guide.md` (bad/good comparison: `references/review-log-bad-examples.md`).

---

## 1. Audit Trail (cross-round issue overview)

The issues each reviewer round found + final status + a one-line resolution.

| Round | ID  | Severity | Status | Resolution |
|-------|-----|----------|--------|------------|
| _(none)_ |     |          |        |            |

**Round naming**: `D{N}` = design review round N; `I{N}` = implementation review round N
**Status values**: `pending` / `fixed` / `waived` / `decision-resolved` / `false-positive`

---

## 2. Architecture Decisions

Each choice escalated to the user to resolve. The reviewer does not resolve on the user's behalf; after the user answers via `AskUserQuestion`, the main agent writes the outcome into this section.

_(none)_

---

## 3. Waivers (deliberate waivers)

A structured record of "which principle is violated, why it is accepted, the trade-off". Written here when an issue's resolution is "keep it, do not fix".

_(none)_

---

## 4. False Positives

Issues raised by a reviewer but judged false positives after discussion — recorded here to keep future reviewers from raising them again.

_(none)_

---

## 5. Steering Updates (promotion record)

Project-level principles discovered during development and, after user confirmation, written into steering. The source is given as an SC number (`D2 SC-1`), a Decision number (`Decision D`), or `implementer report`.

| #      | Date | Principle | Written to | Source |
|--------|------|------|----------|------|
| _(none)_ |      |      |          |      |
