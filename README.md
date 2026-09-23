# Spec-Driven Development Plugin

**English** | [繁體中文](README.zh-TW.md)

Claude Code plugin for spec-driven development workflow. Enforces "no spec, no code" discipline with structured steering documents, feature specs, verification, and agent-based implementation.

## Philosophy

The workflow has two jobs — catch design flaws while they're cheap to fix, and keep the human in the loop without drowning them — and both run on **one lens**: read every change through its **real use cases + execution flow + data structures**.

- **Review uses the lens to find what matters.** A reviewer starts from "which real scenario does this serve?", not from a checklist — surfacing the *core design concepts* and ignoring theoretical edge cases no use case drives (those get fail-fast + an error log, not defensive code). Review runs multi-round until 0 issues; reviewers raise issues, never fix them.
- **Communication uses the same lens to explain what matters.** What review found important is exactly what the user must understand — so briefings, and every message to the user, are digested and abstracted first, told through a real scenario, and never assume the user still remembers structures discussed turns ago. Lowering the human's cognitive load is a *global* discipline, not just a briefing step.

The bridge is the **core design concept**: review decides what's important; communication spends the user's attention there.

Two disciplines keep the docs honest: **formal docs describe the decided world** — the *why* (waivers, decisions, rejected paths) lives in `review-log.md`, never polluting requirements/design/tasks/code — and **steering is living — but restrained**: the rare project-spanning principle whose absence would cause cross-feature inconsistency is promoted once the user confirms; by default, things stay out (spec-specific choices, implementation details, and one-off decisions don't belong in steering).

A structural choice keeps the token economics honest too: **generation in subagents, arbitration in the main agent**. The main agent spends its tokens only on high-leverage judgment: organizing the task and its direction, distilling briefs, escalating decisions, and **challenging every subagent conclusion**; all long-form generation (plans, spec docs, code, reviews) runs in persistent subagent sessions, resumed across review rounds instead of respawned. Every subagent that writes, reviews or verifies runs on opus: executors (implementer, tester, verifiers) at a fixed medium effort, the judgment roles (author, reviewers) at the session's own effort, so `/effort` decides how hard they think. Quality is preserved by adversarial arbitration — the mandatory challenge exchange on every round — not by maximum effort on bulk writing.

## Features

- **Steering Documents**: Project-level guidance (product vision, tech stack, code structure)
- **Feature Specs**: Requirements, design, tasks, and review-log per feature
- **Automated Verification**: Spec completeness and tasks-design alignment checks
- **Agent-Based Implementation**: Parallel implementation with cross-agent review
- **Generator/Arbiter Split**: the main agent arbitrates — organizes the task, distills briefs, challenges every subagent conclusion — while persistent opus subagent sessions carry all long-form generation (plans, docs, code, reviews), executors at medium effort and judgment roles at the session's: quality held by adversarial challenge, tokens saved on bulk writing
- **Review Log Discipline**: Waivers / Decisions / round-by-round audit trail live in `review-log.md`; formal docs (requirements / design / tasks / code) stay clean
- **Living Steering**: review loops surface unrecorded project principles as steering candidates; user-confirmed updates flow back into steering docs as development progresses. Steering stays a set of decisions, not an operations manual — a finding whose justification is a recurring incident is routed to CLAUDE.md instead, so the guardrails don't silt up with operating knowledge
- **Backlog and Roadmap**: anything discovered mid-flow that can't be resolved now — deferred review issues, out-of-scope findings, unresolved discussion threads — is recorded silently as a ticket — one question per ticket — in the registry `.spec/backlog/backlog.json` (records are never deleted; closing adds how it closed), with one Markdown body per ticket, so it survives the session. The roadmap (`.spec/roadmap/roadmap.json`) holds only structure: an architecture-shaped tree with ordinals and dependencies that answers "what can start now?" exactly, referencing tickets by id. The unsorted basket is the open tickets no node references; `promote` adds a reference and loses nothing. Both are read and written only through `scripts/board.mjs`, which validates every edit, generates collision-free ids, handles claims, and always works on the main worktree's copy; `/backlog` and `/roadmap` drive it
- **Brief Before Build**: before implementation starts, a conversational summary of key points, resolved decisions, and waivers gets the user oriented without reading the full spec — cheapest moment to catch misunderstandings
- **Calibrate for Cognitive Load**: a global discipline — the main agent digests and abstracts before every message, narrates through real use cases + execution flow + data structures, and re-surfaces context from earlier turns; review and briefing use the same lens to find and explain the core design concepts

## Commands

| Command | Description |
|---------|-------------|
| `/create-steering` | Create project steering documents |
| `/create-spec <feature>` | Create feature spec (requirements, design, tasks) |
| `/load-spec <feature>` | Load spec and show progress |
| `/update-steering <type>` | Update steering document (product/tech/structure) |
| `/update-spec <feature>` | Update feature spec |
| `/verify-spec <feature>` | Verify spec completeness + tasks-design alignment |
| `/implement <feature>` | Start implementation via agents |
| `/backlog [args]` | List / pick up / close items in the unsorted backlog basket |
| `/roadmap [args]` | Show the scheduled roadmap tree, what can start next, promote items onto it, walk a branch |
| `/advise [topic]` | Form a position, take it to the advisor, then answer — divergences stated |

## Agents

| Agent | Role |
|-------|------|
| `spec-researcher` | Research existing solutions before design |
| `spec-verifier` | Verify spec file completeness |
| `tasks-design-verifier` | Verify tasks-design alignment |
| `spec-author` | Author / revise planning & spec docs per the main agent's brief (persistent session) |
| `design-reviewer` | Multi-round design review until 0 issues (review only) |
| `spec-implementer` | Implement code per spec |
| `implementation-reviewer` | Multi-round implementation review until 0 issues (review only) |

## Hooks

| Hook | Purpose |
|------|---------|
| `PreToolUse` on `ExitPlanMode` | A deterministic, stateless Node command hook (`hooks/briefing-checkpoint.js`) that enforces the Plan Briefing on **every** `ExitPlanMode` (Quick Fix Mode, `/create-spec` & `/update-spec` plan phases, and plain plan mode — a briefing lowers reading load for any plan, and fail-open keeps plain plan mode safe). It **allows** when a real user reply precedes the call (the turn-final briefing flow) — skipping the agent's mechanical tool turns (e.g. the `ToolSearch` that loads a deferred `ExitPlanMode`, a post-approval `Edit`) so they don't break the check — and **blocks** a straight plan-write → `ExitPlanMode` skip with a short reminder. The check is **anchored to the current plan session** — it stops at where plan mode was (re-)entered (a manual `permission-mode:plan` marker, or an `EnterPlanMode` tool call), so a briefing is required since entering and a deny never points at stale text from before a Claude Code restart (a restart drops plan-mode state, forcing a manual re-entry to resume). Fail-open on any uncertainty, so it never deadlocks; filters subagent (`isSidechain`) and injected (`isMeta`) entries; reads the transcript only and writes nothing anywhere. |
| `SessionStart` on `startup`/`resume` | A small Node command hook (`hooks/session-start-skill-reminder.js`) that injects a short reminder to load and use the spec-driven-development skill for any code work. Static context injection — no project detection; the reminder itself states the "if this is a code project" condition and lets the agent judge. SessionStart cannot block; the script reads nothing and writes nothing. |
| `PreToolUse` on `*` (inside executors only) | A Node command hook (`hooks/dispatch-checkpoint.js`) that runs inside an executor's own session — `agent_id` is present only for subagent calls, so the main agent is never addressed — and, every time a dispatch passes the per-agent threshold (implementer 45 tool calls, tester 20, and so on), asks it to `SendMessage` a status to the main agent and keep working. It stops nothing and waits for nothing: the main agent reads the status on its next turn and answers only if the direction is wrong, and that answer reaches the executor mid-work. Never tells the executor to read less. Replaces the `maxTurns` ceilings removed in 1.24.0 |
| `PreToolUse` on `SendMessage` | A Node command hook (`hooks/session-longevity-checkpoint.js`) that reads the target executor's real context size at the moment of resume and calls for retirement at 400K — far below the point the harness would autocompact it, so an executor never works from a summary of its own design basis. Context only, never a block |

> Hooks load at session start — after installing or updating the plugin, restart the Claude Code session for hooks to take effect.

## Installation

### From GitHub (recommended)

Run these inside Claude Code. The first command registers this repo as a plugin
marketplace (defined by `.claude-plugin/marketplace.json`); the second installs
the plugin from it:

```
/plugin marketplace add jasoncychueh/claude-spec-driven-dev-plugin
/plugin install spec-driven-development@claude-spec-driven-dev-plugin
```

> `spec-driven-development` is the plugin name; `claude-spec-driven-dev-plugin`
> is the marketplace name. They differ — keep both in the `plugin@marketplace`
> argument.

You can also install interactively by running `/plugin`, then choosing
**claude-spec-driven-dev-plugin → spec-driven-development**.

`/plugin marketplace add` also accepts a full git URL if you prefer:

```
/plugin marketplace add https://github.com/jasoncychueh/claude-spec-driven-dev-plugin.git
```

### From a local clone (development)

```bash
git clone https://github.com/jasoncychueh/claude-spec-driven-dev-plugin.git
```

Then point the marketplace at the local path and install:

```
/plugin marketplace add path/to/claude-spec-driven-dev-plugin
/plugin install spec-driven-development@claude-spec-driven-dev-plugin
```

## Core Principles

1. **No Steering, No Development**
2. **No Spec, No Code**
3. **Research Before Design**
4. **Design is Truth** (design.md is the single source of truth)
5. **Steering Stays Current**
6. **Self-Verify**
7. **Verify Before Deliver**
8. **Calibrate for Cognitive Load** — every message to the user is digested and abstracted first, narrated through real use cases + execution flow, never assuming the user remembers earlier-turn structures; review and briefing share this one lens

## Acknowledgments

This project is inspired by [spec-workflow-mcp](https://github.com/Pimzino/spec-workflow-mcp) — its steering-documents + spec (requirements / design / tasks) workflow shaped the core model here. This plugin reimagines that workflow natively for Claude Code (skill + commands + agents + hooks) rather than as an MCP server, and adds its own emphases: review-log isolation from formal docs, living steering, multi-round agent review loops, use-case-first review, the Brief-Before-Build briefing checkpoint, and calibrating every interaction for the human's cognitive load.
