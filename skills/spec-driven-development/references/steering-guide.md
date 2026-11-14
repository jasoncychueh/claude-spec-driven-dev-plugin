# Steering Document Writing Guide

Steering documents are project-level guidance that define the product vision, technology choices, and how code is organized.

Steering is the agents' map of the project: what every feature must stay consistent with. It is written precisely and briefly for agents and stays readable for a human auditing it.

## Refinement principle

Steering documents are the project's "guardrails"; they should be refined and record only what truly matters:

- **Abstract concepts**: product vision, design philosophy, core principles
- **Technical conventions**: technology stack, architecture patterns, key technical decisions and their reasons
- **Conventions**: naming conventions, module boundaries, code organization conventions

Avoid writing into steering:
- **Operating knowledge** — how to run a command, an environment trap, the sequencing that makes some tool work. **Steering is not an operations manual**; that knowledge belongs in CLAUDE.md, whose job is making the next run succeed
- Specific feature requirements or implementation details (these belong in a feature spec)
- Over-detailed specifications (e.g. a full API schema)
- One-off decision records (unless it is an architecture decision affecting the whole project)

**Decisions vs operating knowledge** — the distinction that keeps steering from rotting, and the one that breadth alone can't make. Steering records what the project **decided**: what we chose, what we always do, what we never do. Naming a concrete tool is still a decision ("tests are written with pytest" belongs in tech.md). Operating knowledge is how to *successfully operate* this repository, and it fails one probe: **can you explain why the rule exists without recounting an incident?** A decision stands on its own; operating knowledge without its war story is an unexplained step. So "we hit this three times" marks CLAUDE.md material no matter how many features it spans — the recurrence is real, it just makes it *important operating knowledge* rather than a principle. Steering is read as the project's standing intent, and every operating detail added to it buries the clauses that actually constrain design.

Steering documents should be "living documents", continuously updated as the project evolves.

## The three documents

| Order | Document | Purpose | Template |
|------|------|------|------|
| 1 | `product.md` | What to build, and why | `templates/product-template.md` |
| 2 | `tech.md` | What technology to use | `templates/tech-template.md` |
| 3 | `structure.md` | How to organize the code | `templates/structure-template.md` |

## Writing workflow

### 1. product.md - Product guidance

**MANDATORY**: Use the Read tool to read the full content of `templates/product-template.md`.

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

**MANDATORY**: Use the Read tool to read the full content of `templates/tech-template.md`.

Content to define:
- Project Type - the project type
- Core Technologies - language, frameworks, dependencies
- Application Architecture - architecture patterns
- Data Storage - database, cache
- External Integrations - external APIs
- Development Environment - development tools; includes an optional Build and test scope subsection with the build and test commands per scope (a project / module build; targeted / affected / full-suite tests), see `references/verification-scope.md`
- Deployment - deployment method

**Writing points**:
- Annotate every technology with its version
- Use diagrams to explain the architecture
- Record the reasons for technical decisions
- List known limitations

---

### 3. structure.md - Structure guidance

**MANDATORY**: Use the Read tool to read the full content of `templates/structure-template.md`.

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
- **During development (Steering Evolution Mechanism)**: the review loop's Steering Candidates, the promotion judgment after an Architecture Decision is resolved, and discoveries during implementation — once confirmed by the user, are written in immediately and lightly (no need to go through the full /update-steering), see "Steering Evolution Mechanism" below
- **Periodic review**: when the steering description diverges from the actual state of the project, proactively suggest an update

Note: steering itself records only principles (the world after the decision), not "which review this line was added in" — the source record lives in the corresponding feature's review-log §5 Steering Updates.

## Steering Evolution Mechanism

Read this section when Steering Candidates have accumulated (before the Summary at the latest), when a just-resolved Architecture Decision might be a project-level principle, or when an implementer's report lists a finding.

Steering is a living document — the principles / conventions that truly **run through the whole project** keep surfacing during development, and **the best moment to promote one is the moment it surfaces** (context is still fresh, the user just decided), not some big later review.

**But the bar is high, and the default is not to promote**: the vast majority of things that come up during review / implementation are spec-specific, implementation details, or project-memory-level facts — **none of which belong in steering**; only promote the few core principles where "not recording it would almost certainly cause future inconsistency or difficulty" (the full bar and exclusion list are in `review-protocol.md`, "Steering Candidates"). When in doubt, leave it out — padding dilutes the guardrails and floods the user's attention.

**Steering is not an operations manual — and the first question is *what kind of thing it is*, not how widely it applies** (the probe is "Decisions vs operating knowledge" above). The most common bad promotion clears every breadth test there is: a trap the agents hit repeatedly during the cycle genuinely spans features, genuinely recurs, and genuinely isn't recorded anywhere. It is still wrong for steering, because it is operating knowledge, and CLAUDE.md is where operating knowledge lives.

Reviewers and the implementer therefore tag every candidate `[steering]` or `[claude-md]` in the one `📌 Steering Candidates` section (format in `review-protocol.md`), and **the main agent routes by tag — re-judging rather than trusting it**: a `[steering]` entry that only makes sense once you hear the incident behind it is misfiled. `[claude-md]` entries are proposed for CLAUDE.md in the same confirmation batch, on the same terms — **neither destination is ever written without the user's confirmation**, and no agent edits CLAUDE.md on its own. Giving these findings a real home is what keeps the restraint honest: a rule that only forbids leaves the agent choosing between losing a genuine recurring trap and misfiling it, and it will misfile it.

Three hook points:

| Hook point | When | Form |
|---|---|---|
| 1. Reviewer | during design / implementation review | the `📌 Steering Candidates` section after the issue list (non-blocking, doesn't count against convergence), each entry tagged `[steering]` or `[claude-md]` |
| 2. After a Decision is resolved | the moment the user finishes the AskUserQuestion | the main agent judges immediately: "a choice for this feature only" or "a project-level principle"? The latter is proposed for promotion right away (the user is still in context, lowest follow-up cost) |
| 3. During implementation | spec-implementer's completion report (both modes) | findings are listed in the report and the main agent collects them |

**Lightweight update path** (not the full planning phase of `/update-steering`):

1. Dedupe the accumulated candidates, **re-judge each tag** (`[steering]` vs `[claude-md]` — a "principle" that needs its incident retold to make sense is the latter), then hand them to the user in a batch via AskUserQuestion, saying which destination each is headed for (hook point 2 is handled at decision time; the rest are handled before Summary at the latest)
2. User confirms → the main agent Edits the corresponding steering document directly (usually tech.md / structure.md) — steering records only the principle itself (the world after decisions), not its source. **A confirmed `[claude-md]` entry is written to the project's CLAUDE.md instead**, where recording the trap it prevents is appropriate rather than residue — that file's whole job is making the next run succeed
3. Run the `checklists.md` "Steering completeness check" consistency check (the three docs have no contradictions)
4. Record it in review log §5 Steering Updates (principle / where written / source) — **including the CLAUDE.md-bound ones**, so both destinations share one audit trail

**Boundary**: this mechanism handles "add a principle / convention entry"-level increments; directional overhauls (swapping architecture patterns, changing the tech stack) still go through `/update-steering`. Quick Fix Mode applies the same way if the project already has steering.

**Backlog vs steering**: a discovery that is *a principle to follow* is a steering candidate; a discovery that is *work to do later* is a backlog item (`backlog-guide.md`). The two channels have opposite defaults — steering promotion is restrained and user-confirmed; backlog recording is liberal and silent — because a wrong steering entry misleads every future feature, while a wrong backlog item costs one line in a cleanup pass.

**Why immediate, but restrained**: steering goes stale gradually — if a genuinely cross-feature core convention goes unrecorded, six months later steering and the codebase have drifted apart and the alignment check is toothless, so what should be promoted should be promoted on the spot. But conversely, **over-promotion (cramming spec-specific / detail / one-off decisions into steering) is the more common failure in practice** — it dilutes the guardrails, buries the truly important clauses, and wastes the user's attention every round. Both directions must be avoided, and **the default leans restrained**: promote the few that truly run through the whole project, not something every round.
