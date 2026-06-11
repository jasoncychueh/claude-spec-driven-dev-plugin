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
| `PreToolUse` on `ExitPlanMode` | Injects a reminder that the Plan Briefing checkpoint (briefing text + AskUserQuestion stop) is mandatory in Quick Fix Mode — never blocks the call |

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
