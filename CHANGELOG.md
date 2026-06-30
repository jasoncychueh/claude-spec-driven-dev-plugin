# Changelog

Version history and decision rationale are collected here. The skill / reference / agent docs describe only the **current rules + technical rationale**; they do not narrate version evolution — consistent with this plugin's own principle that "formal docs describe the world after the decisions are made".

## 1.7.5 (2026-06-30)

Add a sixth review-residue pattern (Pattern F) extending the formal-doc isolation discipline to **production-code comments**, then close the cross-agent enumeration gaps the addition surfaced.

- **New Pattern F (`review-log-bad-examples.md`)**: production comments must not pin themselves to (A) review-log codes (`Decision X` / `Bug X` / `Smell X` / `Round-N` / `D<n>` / `Pivot-Event-N` / `SC-N`) riding inside otherwise-normal comments, nor (B) internal spec-doc pointers (`design.md §Component N` / a bare `Component N` / requirement IDs `R6.1` / `R13`). The unifying test is **durability**: a *stable identifier* may be cited; a *fragile pointer that drifts on doc reorganization* may not. **Allowed exceptions** (references that don't drift with the spec): an external standard (`RFC 6749 §5.2` / OAuth / IETF) and a spec's **name** (not its component numbers). Notably **`ADR-N` is *not* exempt**: in this project ADRs are `#### ADR-N:` sections inside design.md, so an ADR number drifts like `§Component 8` — citing it from code is type-(B) residue. Examples were pulled from real residue observed in a production project.
- **Enforcement wired so the discipline actually bites**: `implementation-reviewer`'s "review-residue in production code" Smell now catches both (A) and (B) — type-(B) had *zero* coverage before, so a docstring `see design.md §Component 13` previously sailed through; `spec-implementer`'s self-check carries the same ban list so the writer avoids emitting it in the first place. Both cite Pattern E (waiver blocks) + Pattern F.
- **Asymmetry kept on purpose**: the formal-doc surfaces still *require* `Design ref` / `_Requirements: R<n>_` as the traceability backbone (`tasks-template.md`), so only production code is banned from spec-section pointers. `spec-verifier`'s formal-doc scan therefore does **not** flag type-(B); it does now match `implementation-reviewer`'s type-(A) list — added `Pivot-Event-\d` / `SC-\d` / bare `D\d+` / `(per reviewer)`, with bare `R\d+` deliberately excluded so legitimate requirement refs aren't false-flagged.
- **Quality pass (skill-creator review)**: added a Table of Contents to the two reference files now over 300 lines (`decision-escalation-guide.md`, `review-log-bad-examples.md`); fixed a pre-existing Pattern D miscount ("Four" → "Five" schema changes, which contradicted its own (a)–(e) enumeration); disambiguated Pattern F's `Design ref` example as a `# code comment` so it doesn't read as banning the required tasks.md field. Cross-references bumped "5 patterns" → "6 patterns" (SKILL.md ×2, review-log-guide.md).

## 1.7.4 (2026-06-29)

Translate all plugin prose from Chinese to English — SKILL.md, every `references/*.md`, the agents, commands, templates, the hooks' output strings, and this changelog. The translation was deferred at 1.6.7 until the workflow stabilized.

- **Scope**: 31 files. README.md and the product/tech/structure templates were already English. A canonical glossary (e.g. 強制→mandatory, 豁免→waiver, 收斂→converge, Steering 演進機制→"Steering Evolution Mechanism") was fixed from SKILL.md first so cross-referenced section names and recurring terms stay consistent across files.
- **No behavior change**: the `briefing-checkpoint` hook matches on transcript structure (not message text), so its regression test still passes 12/12. The one deliberate non-English character left is the fullwidth colon `：` inside `spec-verifier`'s waiver-detection regex `[：:]`, which matches residue in either colon style.
- **One adaptation**: `spec-verifier`'s review-residue detection regexes were switched from Chinese verb-lists (`reviewer (建議|標記|…)`) to English (`reviewer (suggested|flagged|…)`) to match the now-English docs being scanned.

## 1.7.3 (2026-06-28)

Raise the bar for Steering Candidates substantially and default to not promoting — solving the over-triggering problem where "almost every review round / post-implementation, a pile of promotion candidates pops up that are actually spec-specific / too detailed / project-memory-level, and shouldn't go into steering".

- **Root cause**: the SC generation points (review-protocol's "Steering Candidates", the SC sections of the two reviewers, checklists §6) had a bar that was both low and vague ("depends on or establishes a project-level principle / convention not recorded in steering" was enough to list it); the SKILL's "Steering Evolution Mechanism" "why" leaned toward more promotion (emphasizing that not promoting lets steering go stale); and the real exclusion list lived only in steering-guide, which the reviewer never reads when generating an SC.
- **New bar (authoritative definition in `review-protocol.md` "Steering Candidates")**: **default to not promoting**. List an SC only when all three hold simultaneously — (1) a core concept / principle / convention that runs through the entire project; (2) not recording it in steering would almost certainly cause inconsistency or difficulty in future planning or implementation ("not recording it will cause trouble", not "recording it would be nicer"); (3) steering genuinely doesn't have it yet. **Explicitly excludes** spec-specific choices, implementation details, project-memory-level facts, and things that are "tidier if recorded but won't cause trouble without". If you can't decide, it's not an SC. Better to miss a borderline one than to pad the list (padding dilutes the guardrails and floods the user's attention — echoing the v1.7.0 cognitive-load principle).
- **Tightened in sync**: the SC sections of design-reviewer / implementation-reviewer, checklists §6 (Design + Impl), spec-implementer's candidate reporting, and decision-escalation's "post-resolution promotion judgment" were all changed to a high bar + default to not promoting; the SKILL's "Steering Evolution Mechanism" gained a restraint principle, and its "why" was rebalanced (over-promotion is the more common practical failure); Core Principle #7 `Steering is Living` → `Steering is Living (but restrained)`.

## 1.7.2 (2026-06-28)

Add a SessionStart hook that injects a reminder at session startup / resume, telling the agent to load and use the spec-driven-development skill (shoring up the skill's tendency to be under-triggered).

- Add `hooks/session-start-skill-reminder.js`: statically outputs a `hookSpecificOutput.additionalContext` reminder — "this project has the skill installed; if it's a code project, load and use it before planning/starting work (it auto-routes to Quick Fix / Spec Mode and runs the mandatory review loop); skip for non-code projects". Mounted on hooks.json's SessionStart, matcher `startup|resume` (excluding compact, to avoid injecting mid-session).
- **No project detection**: whether it's a code project is stated directly in the prompt and left to the agent. SessionStart runs on every startup, so a static string is the lightest option — saving file-scan cost and project-type misjudgment.
- SessionStart cannot block, only injects context; the script is read-only and side-effect-free. The hooks.json / README Hooks section describe both hooks in sync.

## 1.7.1 (2026-06-28)

Fix the briefing checkpoint hook falsely blocking and getting stuck when **manually entering plan mode** (especially re-entering after a restart).

- **Root cause**: 1.6.7 changed the hook to "protect every ExitPlanMode", but judged via "is the most recent substantive message a user reply", and it **can't see the manual-entry-into-plan-mode marker** (`{type:"permission-mode",permissionMode:"plan"}` is not user/assistant, so classify skips it as noise). So walking back, it passes over the manual re-entry marker, even past the restart, and DENYs as soon as it hits agent text from **before** the restart — the deny points at stale text unrelated to this plan session, the agent gets confused and stuck. Typical trigger: agent enters plan mode → some time later Claude Code is reopened (plan-mode state is dropped) → user manually shift+tabs to re-enter and resume the flow → ExitPlanMode gets stuck.
- **Fix**: **anchor the check to "the current plan session"**. Walking back, stop at the (re-)entry boundary of plan mode — the manual `permission-mode:"plan"` marker, or the agent's `EnterPlanMode` tool call. No briefing + user reply after the boundary → DENY (but recoverable: brief → end the turn and wait for a reply → retrying allows it); a user reply after the boundary → allow. This way the deny no longer leaks to stale text from before the restart, and re-entering after a restart correctly asks for a fresh briefing.
- **Accompanying**: briefing-guide adds a "manually re-enter plan mode after a restart to resume the flow → add a condensed briefing before ExitPlanMode" trigger, reusing the existing "/implement condensed briefing in a later session" pattern, so the agent adds the briefing automatically and never gets stuck.
- Add `hooks/briefing-checkpoint.test.js`: constructs scenarios from the real-transcript marker shapes (spec-driven with/without briefing, manual re-entry with/without briefing, must-not-leak-to-the-stale-reply-before-restart, etc.), runs directly with `node`, no test framework needed. Locks down this regression, whose manual-entry path was missed back in 1.6.6.
- The hooks.json / README Hooks section describe the anchoring behavior in sync.

## 1.7.0 (2026-06-28)

Promote "Calibrate for Cognitive Load" into a global principle for the main agent, and let review and briefing share the same "use case + execution flow + data structure" lens.

- **Add a global principle (Core Principle 9) "Calibrate for Cognitive Load"**: any output the main agent gives the user (mode declaration / progress / problem explanation / review conclusion / summary / Decision escalation / briefing) is first digested and abstracted before being presented. Previously the cognitive-load-calibration philosophy was scattered across two checkpoints, briefing-guide and decision-escalation-guide, with no single global principle — SKILL.md adds a "Calibrate for Cognitive Load" section unifying the three downstream applications. Put in SKILL.md rather than a reference: a reference is only lazy-loaded when that checkpoint is reached, but a global principle must stay resident in context.
- **Review becomes use-case-first**: `review-protocol.md` adds "Review method: build a use-case model first, then cross-check" — first inventory the real use cases + data structures + execution flows as the basis for judgment, rather than applying checklist items one by one. The design-reviewer / implementation-reviewer workflows gain a "build the use-case model first" step, and the two checklists.md sections add a gating note at the top pointing to the protocol (not restating it, to prevent drift).
- **Add an overriding criterion "do not over-engineer edge cases with no use case"**: paths that are theoretically reachable but driven by no real scenario and shouldn't happen → write no defensive code, use fail-fast + error log instead (must not be silent). Explicitly framed as "not over-engineering" rather than ignoring robustness — failure paths with a real scenario must still be robust as usual. Overrides the Failure Modes / Bugs aspects.
- **briefing and review converge on the same lens**: briefing-guide strengthens "start from the use case" → surfacing the execution flows and data structures that scenario touches, not assuming the user remembers structures explained in earlier rounds (humans forget the architecture across rounds / over time); it states plainly that what the briefing highlights is exactly the core design concepts the review surfaced. decision-escalation-guide adds a cross-link marking it as a concretization of the global principle.
- Knock-on: the core-principles list's Spec / Quick Fix Mode numbering shifts (9–14 → 10–15, #1–#8 unchanged, and the CHANGELOG's references to "Core Principle 8" are unaffected); README Core Principles in sync.

## 1.6.8 (2026-06-16)

Fix the hook's false block on a **deferred ExitPlanMode**. Observed in practice: after the user approves, the agent must first `ToolSearch` to load the deferred ExitPlanMode tool (and often replies with an acknowledgment), and these agent turns sit between "user approval" and "ExitPlanMode" → the hook sees the immediately preceding entry as an agent action rather than a user reply → false block, forcing the user to approve again.

- **Fix**: when walking back, the hook **skips the agent's mechanical turns** (any assistant turn with a `tool_use` — ExitPlanMode itself, the ToolSearch that loads it, a post-approval Edit, etc.) + tool_result + injected messages, recognizing only the first "substantive" message: a user reply → allow; agent plain text (with no user reply after it) → block.
- "the agent finishes talking and ExitPlanModes without waiting for a user reply" is still blocked; the deferred-tool ToolSearch and post-approval small edits are no longer falsely blocked. Cost: a skip done purely via tool calls with no narration at all may slip through (the safe direction, never false-blocks).

## 1.6.7 (2026-06-16)

Full briefing coverage + /update-spec upgraded to the same discipline as /create-spec.

- **briefing repositioned**: a briefing exists to **lower the cognitive load of reading a full plan/spec**, not merely as an approval gate. So every moment the user is about to face a wall of plan/spec should have a briefing, not just Quick Fix.
- **New briefing points**: /create-spec plan-exit (direction confirmation, lightweight), /update-spec plan-exit (change planning), /update-spec end (change-finalized Spec Briefing). The existing /create-spec end Spec Briefing, Quick Fix Plan Briefing, and /implement condensed are unchanged.
- **/update-spec upgraded**: when design.md has substantive changes, run the **mandatory multi-round design-reviewer loop, the same as /create-spec** (to 0 issues, same protocol: two-beat Decisions, Critical/High must-fix, Medium/Low defer-and-batch, Steering Candidates, convergence fuse, 100% isolation); a briefing each at plan-exit + end. Modifying a finished spec is no less risky than creating one, and shouldn't be a lighter path. Pure requirements clarification / pure tasks-status bookkeeping may skip the loop.
- **hook changed to protect "every ExitPlanMode"** (removing 1.6.6's design-reviewer cycle-scoping): reason — a briefing that lowers cognitive load benefits any plan, and the hook's fail-open won't break plan mode, so no narrowing. Benefits: the create-spec/update-spec plan-exit won't be missed (its design-reviewer Mode A is optional, and scoping would misjudge it); plain plan mode is protected too (one extra summary, harmless). The hook is therefore **greatly simplified** — leaving only the "is the entry before ExitPlanMode a user reply" skip judgment + isSidechain/isMeta filtering + fail-open, removing the whole design-reviewer detection and cycle-start delimitation.
- Knock-on: design-reviewer's scope adds /update-spec, review-protocol's convergence reminder becomes mode-aware, and briefing-guide's trigger table + cognitive-load principle + layer 3 of the three-layer architecture are in sync.

## 1.6.6 (2026-06-15)

The ExitPlanMode briefing checkpoint changed from a **prompt hook to a deterministic command hook**, curing the 1.6.2–1.6.5 deadlock for good. (Note: this version number previously had a short-lived "remove the hook" commit that was pushed and then reverted via force-push, not retained on the remote; this 1.6.6 is the official release. If a stale 1.6.6 directory remains in the local plugin cache, it must be cleared and re-pulled to get this version's content.)

- **Root cause**: the prompt hook's judge is an LLM that can't see the conversation history. Even when instructed to "always allow", it still conservatively blocks ExitPlanMode because it "can't confirm whether the briefing was delivered" — blocking even when the briefing was correctly delivered and the user confirmed, causing a deadlock where the agent can't propose a plan (observed blocking twice in a row in practice). An LLM will override the prompt instruction itself, and can't serve as a reliable gate.
- **Solution**: switch to a Node command hook (`hooks/briefing-checkpoint.js`, deterministic code, not an LLM). Reads the transcript to judge "is the entry before ExitPlanMode a real user reply" — the turn-final briefing discipline guarantees a legitimate flow is always immediately preceded by a user reply; a skip is always assistant / tool_result. Yes → allow; skip → block and return a short reminder.
- **Scope narrowing (no hijacking of normal plan mode)**: although the hook is mounted on all ExitPlanMode, it only enforces **when "this plan cycle has run design-reviewer"** (= the spec-driven Quick Fix flow). The cycle start is delimited by **the most recent entry into plan mode** (`permission-mode:plan` / `mode:plan` / `EnterPlanMode` tool_use), and design-reviewer only counts if it comes after that start — calls between rounds (e.g. Spec Mode `/create-spec`, which also runs design-reviewer but not in plan mode) won't be miscounted. **If no cycle start is found, allow** (do not fall back to "the previous ExitPlanMode" as the boundary — that's the previous round's end and would fold the gap in, producing a false positive). Plain plan mode has no design-reviewer → always allow, so installing the plugin won't affect built-in plan mode.
- **No deadlock**: after the briefing + user reply, the preceding entry is a user message → allow; and **fail-open** — unreadable transcript / parse failure / not a Quick Fix cycle all allow, blocking only on "a confirmed skip inside a spec-driven cycle".
- **Detection details**: a subagent call appears in the transcript as an `Agent`/`Task` tool_use + `input.subagent_type`; the hook detects design-reviewer from this. It also filters out `isSidechain` (subagent-internal messages, otherwise false-deny) and `isMeta` (injected local-command / reminder, otherwise false-allow). A real human reply is `type:user` with string content.
- **Markers verified in practice** (against real transcripts): user manually shift+tabs into plan mode → `{type:"permission-mode", permissionMode:"plan"}`; agent enters via tool → `EnterPlanMode` tool_use. Both cycle-start paths are detectable, so "user manually enters plan mode first" won't cause a miss. (The `mode` field is always `"normal"` in a bypassPermissions session; the plan state lives in `permissionMode`.)
- **Cross-platform + stateless**: pure Node (shipped with Claude Code), works on Windows/Linux/Mac; only reads stdin + transcript (read-only), writes no file anywhere (including the project folder). The command uses `node "${CLAUDE_PLUGIN_ROOT}/hooks/briefing-checkpoint.js"`.
- briefing-guide's "three-layer reminder architecture" layer 3 is restated as a command hook; README Hooks section in sync.

## 1.6.5 (2026-06-12)

- **Briefing / questions changed to "turn-final delivery"** (field feedback: under 1.6.4's two-beat scheme the briefing was still invisible): root cause — "mid-turn text" placed before a tool call displays unreliably, both the CLI and remote-control hide the whole block, and only a **turn-final message** is guaranteed to display in all clients. Fixes:
  - The briefing (Plan / Spec / condensed) must be delivered as a **turn-final message** and **end the turn** (no AskUserQuestion / ExitPlanMode / any tool in the same turn); a fixed confirmation question at the end, and **the user's reply is the confirmation** — the briefing stop point no longer needs an AskUserQuestion option card
  - Decision escalation's two-beat scheme becomes **two turns**: the briefing turn (final message + end the turn) → user reply → the question turn (short-stem AskUserQuestion; skipped if the user already took a position in the reply)
  - The three-layer reminders (review-protocol convergence conclusion / tasks-design-verifier report / ExitPlanMode hook) are reworded in sync; briefing-guide adds a "remedy" section (user reports not seeing it → redeliver as a turn-final message)

## 1.6.4 (2026-06-12)

- **AskUserQuestion fully two-beat** (screenshot feedback from the field: at a Decision question the user couldn't tell what was being asked): the strategy of stuffing context into the question stem fights the TUI — the stem dialog is narrow and hard to read, the code preview is collapsed, and the content easily compresses into unexplained jargon. Changed to: (1) first output the question briefing as conversational text (review context + explaining the problem via an actual use case + code comparison, fully rendered as markdown); (2) then send an AskUserQuestion with a very short stem (1-3 lines). Applies to all AskUserQuestion interactions: Decision resolution, Medium/Low waiver batches, Steering Candidates batches
- decision-escalation-guide's good example is rewritten as a two-beat demonstration, the first beat opening with a use case ("list-page icon → the memory cue of A seeing B"), not opening with a concept word

## 1.6.3 (2026-06-12)

- **Briefing narration changed to use-case-driven**: the essential difference between a briefing and a plan / design is narrative viewpoint — a doc describes "what the system is" (conceptual, optimized for repeated reference), a briefing describes "what the user will experience" (optimized for first-time understanding). Walk through 1-2 representative use cases (happy path + key failure path), surfacing the consequences of components / new concepts / Decisions within the scenario, replacing a pure conceptual list; the Quick Fix narrative form: "under what operation the bug occurs → what that same operation becomes after the fix → what risk remains"
- **1.6.2 root-cause record corrected**: in practice the briefing wasn't entirely failing to trigger — the text was output and immediately followed by ExitPlanMode, covered by the plan approval window and thus invisible (a UI-layer problem). 1.6.2's two-beat scheme happens to also solve visibility (the small AskUserQuestion option box comes before the large plan window, so the briefing text is visible above it); the three-layer reminders are kept to guard against genuine skips

## 1.6.2 (2026-06-12)

Hardening against the field problem of the briefing not appearing (later, 1.6.3 confirmed the actual root cause was UI occlusion; this version's structural fixes remain valid and necessary): (a) the plain-text output step has no blocking tool call, so the agent might skip it or cram it into the same turn as the next step; (b) SKILL.md is loaded at the start of the task, but the briefing decision point is dozens of tool-call turns later, by which point the step instructions are far from the focus of attention (or summarized away by context compaction).

- **Two-beat stop point**: after the briefing is output it must immediately be followed by an AskUserQuestion ("continue" / "have questions") — only a tool call is a mandatory stop point, and only after the user confirms can it proceed to the next step (ExitPlanMode / ending /create-spec / Stage 1)
- **Three-layer transition reminders** (put the reminder in the freshest context at the moment of transition, not just relying on the step list at the start of the task):
  1. review-protocol.md's convergence-conclusion template carries a next-step reminder (design converges → briefing before ExitPlanMode)
  2. the tasks-design-verifier pass report carries a Spec Briefing next-step reminder (output the specified text verbatim)
  3. add `hooks/hooks.json`: a PreToolUse hook intercepts ExitPlanMode, and the harness forcibly injects a briefing-check reminder (never blocks, only injects a systemMessage) — a last line of defense that doesn't rely on the model's self-awareness
- Note: hooks are loaded at session start — after updating the plugin, the session must be restarted to take effect

## 1.6.1 (2026-06-11)

- **Briefing mechanism (Brief Before Build, Core Principle 8)**: before implementation begins, the main agent uses conversation to output a summary of the spec / plan key points, letting the user get up to speed cheaply and triggering discussion at the cheapest moment. Three trigger points:
  - `/create-spec` after the two verifiers pass → a full Spec Briefing (positioning / architecture highlights / resolved Decisions / Waivers / implementation outlook + an invitation to discuss)
  - `/implement` starting in a new session → a condensed briefing (10-20 lines to rebuild context)
  - Quick Fix Mode **before** ExitPlanMode → a Plan Briefing (ExitPlanMode presents the full plan, the briefing is its human entry point)
- Add `references/briefing-guide.md`: content structure / cognitive calibration (readable in 2-3 minutes, a translation not an excerpt) / the process for handling user concerns. Clarifies its relationship to the isolation discipline — a briefing is conversational output, not a formal doc, and may (and should) reveal review conclusions (Decisions / Waivers), but is not written back into the docs

## 1.6.0 (2026-06-11)

### Steering integration
- **Steering Alignment becomes a formal review aspect**: design-reviewer (aspect 6) and implementation-reviewer (aspect 6) review the design and code against tech.md / structure.md's technology choices, design philosophy, conventions, and module boundaries. Judgment discipline: violating an explicit clause → issue (usually High); conflicting with steering but steering may be stale → Architecture Decision (the user decides whether to fix the design or update steering); steering doesn't cover it and this round establishes a new principle → Steering Candidate
- **Steering Evolution Mechanism**: three hook points (the reviewer's non-blocking `📌 Steering Candidates` section / the promotion judgment after an Architecture Decision is resolved / discoveries during implementation) + a lightweight update path (AskUserQuestion batch confirmation → directly Edit steering → consistency check), not going through /update-steering's full Plan Mode. The review log adds §5 Steering Updates recording promoted items (principle / where written / source)

### Review loop behavior changes
- **Medium/Low defer-and-batch**: a mixed round no longer asks the user round by round — they accumulate until the round where Critical/High reaches zero, in a single batch AskUserQuestion
- **Convergence fuse**: if round 5 still has new Critical/High → stop the loop and organize the cross-round pattern to report the structural problem to the user (escalate, not converge)
- **Two-way honesty made explicit**: a reviewer outputting 0 issues on a clean round is a good result, not dereliction; inventing issues is as culpable as false convergence

### Architecture fixes
- **Reviewers support Quick Fix Mode**: the design-reviewer / implementation-reviewer workflow no longer hardcodes the Spec Mode paths (steering / requirements / design.md / tasks.md) — changed to "read the docs the main agent specifies; read steering only if it exists", and the frontmatter description covers both modes in sync
- **Reviewer model changed to `inherit`**: follows the session model, no longer hardcoding opus (the verifier class stays sonnet)
- **Quick Fix plan file path decoupled**: no longer hardcodes `~/.claude/plans/<random>.md`, instead confirming the actual path at EnterPlanMode; when the environment doesn't provide one, falls back to creating `.spec/quickfix/<slug>.md`

### Drift fixes and single-sourcing
- The checklist copy embedded in spec-verifier is removed (including the drifted, stale "Prompt field" item) — checklists.md is the single source; spec-verifier keeps only its unique cross-file Review-Residue regex check
- The reviewer agent files' detailed review-aspect lists are condensed into a one-line framing + a pointer to checklists.md; the severity table uses review-protocol.md as the single source
- checklists.md fixes the leftover old-version description of /load-spec verification behavior (/load-spec does not verify on load)
- spec-workflow.md adds review-log.md to the output locations; removes a duplicate bullet
- review-log-template.md no longer copies the `${CLAUDE_PLUGIN_ROOT}` path into the user's repo (the variable won't expand in the user's project)
- decision-escalation-guide.md removes a leftover personal note
- The README agents table adds design-reviewer; fixes implementation-reviewer's "Review + fix" description (the reviewer is review only)
- The version narration inside the docs ("1.4.0 once allowed… abolished in 1.5.0") is all removed, keeping the behavioral rationale (pointers induce drift), with the historical context moved into this file
- SKILL.md frontmatter aligns with mode-selection.md: a pure-text edit (a README typo) may take the non-development path

## 1.5.0

- **100% formal-doc isolation**: abolish 1.4.0's footnote pointer (`> ⓘ ... — see review-log §X`). Found in practice: allowing any "the formal doc mentions the review-log" backdoor at all makes the agent gradually degrade — writing back a whole `## Architecture Decisions Record` section (the industry ADR pattern is deeply ingrained in training), using `(per Decision O)` letter tags in tables, writing "raised in Round 1" process narration. The only reliable discipline boundary is zero references from formal doc to review-log, with design rationale expressed as neutral design rationale (technical constraints / codebase conventions / adverse consequences)
- spec-verifier adds a cross-file Review-Residue regex check; implementation-reviewer raises review-residue comments in code as a new Smell; add review-log-bad-examples.md (5 patterns, bad/good comparison)

## 1.4.0

- **Review Log Mechanism**: waivers / decisions / cross-round audit trail moved out of the formal docs into review-log.md (background: tasks.md was once polluted by an 8-line "SRP exception (known and accepted)" block — the formal docs return to single-source-of-truth readability). At the time a 1-line footnote pointer was allowed as an "anomalous but tracked" signal (abolished in 1.5.0)

## Before 1.3.0

- Architecture Decision Presentation Discipline (decision-escalation-guide: context-first / paste code directly / multi-dimensional trade-offs / AskUserQuestion field usage)
- Plan content guidance (plan-content-guide: write substance not process narration) + review protocol lazy loading
- Two-mode routing (Quick Fix / Spec) + the multi-round review protocol (D/I prefix, letter IDs accumulating across rounds, converge at 0 issues)
- The three steering documents + three spec documents workflow, verifier agents, spec-implementer's two modes
