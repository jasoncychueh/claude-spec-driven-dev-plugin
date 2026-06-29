# Steering Document Writing Guide

Steering documents are project-level guidance that define the product vision, technology choices, and how code is organized.

## Refinement principle

Steering documents are the project's "guardrails"; they should be refined and record only what truly matters:

- **Abstract concepts**: product vision, design philosophy, core principles
- **Technical conventions**: technology stack, architecture patterns, key technical decisions and their reasons
- **Conventions**: naming conventions, module boundaries, code organization conventions

Avoid writing into steering:
- Specific feature requirements or implementation details (these belong in a feature spec)
- Over-detailed specifications (e.g. a full API schema)
- One-off decision records (unless it is an architecture decision affecting the whole project)

Steering documents should be "living documents", continuously updated as the project evolves.

## The three documents

| Order | Document | Purpose | Template |
|------|------|------|------|
| 1 | `product.md` | What to build, and why | `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/product-template.md` |
| 2 | `tech.md` | What technology to use | `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/tech-template.md` |
| 3 | `structure.md` | How to organize the code | `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/structure-template.md` |

## Writing workflow

### 1. product.md - Product guidance

**MANDATORY**: Use the Read tool to read the full content of `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/product-template.md`.

Content to define:
- Product Purpose - the product's purpose, the problem it solves
- Target Users - target users, their pain points
- Key Features - list of core features
- Business Objectives - business goals
- Success Metrics - quantifiable success metrics
- Product Principles - product design principles

**Writing points**:
- Be specific and clear, avoid vague descriptions
- Describe value in a user-centered way
- Success Metrics must be quantifiable
- Do not touch on technical implementation details

---

### 2. tech.md - Technology guidance

**MANDATORY**: Use the Read tool to read the full content of `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/tech-template.md`.

Content to define:
- Project Type - the project type
- Core Technologies - language, frameworks, dependencies
- Application Architecture - architecture patterns
- Data Storage - database, cache
- External Integrations - external APIs
- Development Environment - development tools
- Deployment - deployment method

**Writing points**:
- Annotate every technology with its version
- Use diagrams to explain the architecture
- Record the reasons for technical decisions
- List known limitations

---

### 3. structure.md - Structure guidance

**MANDATORY**: Use the Read tool to read the full content of `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/structure-template.md`.

Content to define:
- Directory Organization - directory structure
- Naming Conventions - naming rules (files, classes, functions)
- Import Patterns - import order
- Code Structure Patterns - code organization patterns
- Module Boundaries - module boundaries, dependency direction
- Code Size Guidelines - size limit suggestions

**Writing points**:
- Draw the directory tree in ASCII
- Present naming rules in a table
- Attach an example to each rule
- Define module boundaries explicitly

---

## Output location

The completed documents are placed at:

```
.spec/steering/
├── product.md
├── tech.md
└── structure.md
```

## Maintenance guidance

Steering documents must be continuously maintained as the project evolves:

- **On every /create-spec**: check whether the new feature is consistent with steering; if it introduces a new technology or new pattern, steering should be updated first
- **On every /update-spec**: if a design change involves an adjustment in technical direction, update steering in sync
- **During development (Steering Evolution Mechanism)**: the review loop's Steering Candidates, the promotion judgment after an Architecture Decision is resolved, and discoveries during implementation — once confirmed by the user, are written in immediately and lightly (no need to go through the full /update-steering), see SKILL.md "Steering Evolution Mechanism" for details
- **Periodic review**: when the steering description diverges from the actual state of the project, proactively suggest an update

Note: steering itself records only principles (the world after the decision), not "which review this line was added in" — the source record lives in the corresponding feature's review-log §5 Steering Updates.
