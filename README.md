# Spec-Driven Development Plugin

Claude Code plugin for spec-driven development workflow. Enforces "no spec, no code" discipline with structured steering documents, feature specs, verification, and agent-based implementation.

## Features

- **Steering Documents**: Project-level guidance (product vision, tech stack, code structure)
- **Feature Specs**: Requirements, design, tasks, and review-log per feature
- **Automated Verification**: Spec completeness and tasks-design alignment checks
- **Agent-Based Implementation**: Parallel implementation with cross-agent review
- **Review Log Discipline**: Waivers / Decisions / round-by-round audit trail live in `review-log.md`; formal docs (requirements / design / tasks / code) stay clean
- **Living Steering**: review loops surface unrecorded project principles as steering candidates; user-confirmed updates flow back into steering docs as development progresses
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

## Agents

| Agent | Role |
|-------|------|
| `spec-researcher` | Research existing solutions before design |
| `spec-verifier` | Verify spec file completeness |
| `tasks-design-verifier` | Verify tasks-design alignment |
| `design-reviewer` | Multi-round design review until 0 issues (review only) |
| `spec-implementer` | Implement code per spec |
| `implementation-reviewer` | Multi-round implementation review until 0 issues (review only) |

## Hooks

| Hook | Purpose |
|------|---------|
| `PreToolUse` on `ExitPlanMode` | A deterministic, stateless Node command hook (`hooks/briefing-checkpoint.js`) that enforces the Plan Briefing on **every** `ExitPlanMode` (Quick Fix Mode, `/create-spec` & `/update-spec` plan phases, and plain plan mode — a briefing lowers reading load for any plan, and fail-open keeps plain plan mode safe). It **allows** when a real user reply precedes the call (the turn-final briefing flow) — skipping the agent's mechanical tool turns (e.g. the `ToolSearch` that loads a deferred `ExitPlanMode`, a post-approval `Edit`) so they don't break the check — and **blocks** a straight plan-write → `ExitPlanMode` skip with a short reminder. The check is **anchored to the current plan session** — it stops at where plan mode was (re-)entered (a manual `permission-mode:plan` marker, or an `EnterPlanMode` tool call), so a briefing is required since entering and a deny never points at stale text from before a Claude Code restart (a restart drops plan-mode state, forcing a manual re-entry to resume). Fail-open on any uncertainty, so it never deadlocks; filters subagent (`isSidechain`) and injected (`isMeta`) entries; reads the transcript only and writes nothing anywhere. |
| `SessionStart` on `startup`/`resume` | A small Node command hook (`hooks/session-start-skill-reminder.js`) that injects a short reminder to load and use the spec-driven-development skill for any code work. Static context injection — no project detection; the reminder itself states the "if this is a code project" condition and lets the agent judge. SessionStart cannot block; the script reads nothing and writes nothing. |

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

This project is inspired by [spec-workflow-mcp](https://github.com/Pimzino/spec-workflow-mcp) — its steering-documents + spec (requirements / design / tasks) workflow shaped the core model here. This plugin reimagines that workflow natively for Claude Code (skill + commands + agents + hooks) rather than as an MCP server, and adds its own emphases: review-log isolation from formal docs, living steering, multi-round agent review loops, and the Brief-Before-Build briefing checkpoint.
