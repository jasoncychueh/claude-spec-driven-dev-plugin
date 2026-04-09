# Spec-Driven Development Plugin

Claude Code plugin for spec-driven development workflow. Enforces "no spec, no code" discipline with structured steering documents, feature specs, verification, and agent-based implementation.

## Features

- **Steering Documents**: Project-level guidance (product vision, tech stack, code structure)
- **Feature Specs**: Requirements, design, and task documents per feature
- **Automated Verification**: Spec completeness and tasks-design alignment checks
- **Agent-Based Implementation**: Parallel implementation with cross-agent review

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
| `spec-implementer` | Implement code per spec |
| `implementation-reviewer` | Review + fix implementation |

## Installation

```bash
claude /install-plugin path/to/claude-spec-driven-dev-plugin
```

Or add to your marketplace registry.

## Core Principles

1. **No Steering, No Development**
2. **No Spec, No Code**
3. **Research Before Design**
4. **Design is Truth** (design.md is the single source of truth)
5. **Steering Stays Current**
6. **Self-Verify**
7. **Verify Before Deliver**
