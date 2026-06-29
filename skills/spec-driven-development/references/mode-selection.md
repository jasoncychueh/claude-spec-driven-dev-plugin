# Mode Selection: Quick Fix vs Spec

This skill supports two development paths. **Any** work that writes / modifies code should take one of them; don't bypass them and write directly — both paths mandatorily run the multi-round review loop, which is the quality line of defense.

| | Quick Fix Mode | Spec Mode |
|---|---|---|
| Document output | None (replaced by plan mode conversation) | requirements.md + design.md + tasks.md |
| Who writes | main agent writes directly | `spec-implementer` agents |
| design-reviewer loop | **mandatory** (multi-round review of the plan content to 0 issues) | **mandatory** (multi-round review of design.md to 0 issues) |
| implementation-reviewer loop | **mandatory** (multi-round review to 0 issues) | **mandatory** (multi-round review to 0 issues) |
| Applicable situations | bug fix / refactor / small extension | new feature / large refactor / cross-component |

Both paths share the multi-round review loop discipline — see `review-protocol.md` for the full protocol.

---

## Decision criteria

### Situations for Quick Fix Mode

- **Fixing a bug**: includes single-line fixes, logic errors, boundary conditions, race conditions
- **Refactoring**: behavior-preserving code structure adjustments (rename / extract / inline / move)
- **A small extension within the existing architecture**: adding a small feature on an existing component (introducing no new concept)
- **Changing config / docs / typo**: pure text / settings modification
- **Performance micro-tuning**: a local optimization on an existing hot path

Key characteristics:
- No need to create a new component / data model / API
- The change scope is controllable (typically < 5 files)
- The user understands the requirement clearly, with no need for formal requirements / acceptance criteria

### Situations for Spec Mode

- **New feature**: introduces a new component / data model / API endpoint / flow
- **Large refactor**: architecture-level adjustment (splitting a module / reorganizing responsibility boundaries)
- **Cross-component collaboration**: the change requires touching 3+ components in sync
- **Introducing a new concept**: adding a design pattern / abstraction not previously present in the codebase
- **Needs requirement alignment with the user**: the feature goal still needs to be talked through clearly at the requirements level first

Key characteristics:
- A formal design document is needed to trace "why it is designed this way"
- The change scope is large or uncertain
- It may span multiple PRs / multiple sessions before it can be completed

---

## Handling ambiguous situations

Many tasks fall between the two. Handling principle:

### The main agent judges proactively + notifies

When the main agent receives a task, it makes an initial judgment per the criteria above, then **tells the user explicitly**:

> "For this work I'm planning to take quick fix mode (single-component bug fix, small scope). If you think it needs spec mode, tell me."

### The user can adjust

- "Upgrade to spec mode" — the user thinks it's worth a formal design
- "Downgrade to quick fix" — the user thinks the main agent overestimated the complexity

### Handling discovery of the wrong path mid-flight

**Discovering in quick fix mode that a formal spec is needed**:
- Symptom: during plan mode you find "there's more to touch than imagined" / "a new component is needed" / "it crosses too many components"
- Handling: stop within plan mode and tell the user: "This scope is bigger than expected, I suggest upgrading to spec mode", and run `/create-spec` after the user confirms

**Discovering over-engineering in spec mode**:
- Symptom: during the spec process you find "this is actually a bug fix, it doesn't need a new design"
- Handling: tell the user and suggest switching to quick fix mode (the requirements/design already written can be kept as reference)

---

## Boundary case reference

| Task | Recommended mode | Reason |
|---|---|---|
| Fix the NULL handling of a function | quick fix | single-component, bug fix |
| Extract a shared utility (from 2 files) | quick fix | refactor, controllable scope |
| Fix a race condition | quick fix | bug fix, even though it involves async logic |
| Add a new CLI command | quick fix or spec | depends on the new command's complexity — pure thin shell goes quick fix; with new business logic goes spec |
| Add a field to an ORM model | quick fix | single schema change |
| Add a new connector (e.g. Slack) | **spec** | introduces a new component + new data flow |
| Replace the auth library | **spec** | cross-component + involves security design |
| Overhaul the cache strategy | **spec** | architecture-level adjustment |
| Fix a ConfigParser bug | quick fix | bug fix |
| Add prometheus metrics | quick fix or spec | scattered in a few places goes quick fix; building a whole instrumentation framework goes spec |

---

## The review loop targets of the two paths

Both paths run the design-reviewer + implementation-reviewer multi-round loop. **The reviewer always reads the file** (using the Read tool); the main agent is only responsible for telling it the file path. The only difference is where the file is:

| Mode | File design-reviewer reads | What implementation-reviewer reads |
|---|---|---|
| Spec mode | `.spec/specs/{feature}/design.md` | the code written by spec-implementer |
| Quick fix mode | the plan file path specified by the main agent | the code written by the main agent |

**Plan file path**: Claude Code usually creates the plan file automatically at EnterPlanMode (go by the path the system actually provides, which the main agent confirms after entering Plan Mode); if the environment provides no plan file, the main agent creates `.spec/quickfix/<slug>.md` itself instead. Don't hard-code a specific path — this is version-dependent internal behavior.

The plan file is a real file and, like design.md, can be Read. The main agent uses Edit to modify the plan file incrementally during Plan Mode, and after each round of review it also uses Edit to modify this file. **The reviewer's core mechanism is shared by both modes** — both are "read the file at the path the main agent specifies → produce an issue list", differing only in the path the main agent gives.

Key characteristics of quick fix mode:
- design-reviewer's multi-round review is completed **within Plan Mode** (it is verified that a sub-agent can be invoked during Plan Mode)
- What ExitPlanMode submits to the user to approve is the **already-reviewed final version**
- The user doesn't see the review process, only the converged plan

**Steering and Quick Fix Mode**: Quick Fix Mode does not require steering to exist; but if the project already has `.spec/steering/`, the main agent should load it and let the reviewer know (steering alignment is one of the review facets), and a new convention discovered during the quick fix likewise goes through SKILL.md "Steering Evolution Mechanism" for promotion.

---

## Why quick fix mode is also forced to run the review loop

Someone might ask: "Do I have to run the review loop even to fix a typo?"

The answer is yes, and the reasons:

1. **A small fix has even higher review value** — a 1-line weak-ref bug is harder to spot than a 100-line new feature. Review is more focused in a small scope
2. **Once review discipline slackens it can't come back** — once you allow "this is too small to review", the threshold keeps drifting upward
3. **Converging to 0 issues is fast in a small scope** — a typo fix most likely reaches 0 issues on the first review round, with near-zero loop overhead
4. **The review loop is a design quality line of defense, not a document ritual** — the value of a line of defense lies in "always being there", not in "being there for complex tasks"

If some fix really is too small (e.g. fixing a typo in the README) that even reviewing feels overkill, this is the time to reassess: does this even count as a "development task"? Pure text editing can take a non-development flow.
