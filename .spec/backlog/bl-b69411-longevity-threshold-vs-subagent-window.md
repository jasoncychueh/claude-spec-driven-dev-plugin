## Problem

`hooks/session-longevity-checkpoint.js` calls for retiring an executor at 400K of context because the README and SKILL.md assume the harness compacts near ~930K. In the 1.28.0 session, though, nearly every subagent (spec-author, design-reviewer, implementation-reviewer) was autocompacted at about 110K–175K tokens. The SendMessage hook reported a compact boundary on each resume before the 400K mark could ever fire. So the 400K retirement point never comes into play, and the "an executor never works from a summary" guarantee doesn't hold in this environment.

## Context

- Observed on 2026-11-10 while working on v1.28.0 (docs for agents, code as truth). The hook's compact-boundary detection did fire correctly, and the main agent retired the affected sessions by spawning fresh ones.
- Likely cause: the subagents' context window is smaller than the one the threshold was calibrated against, for example 200K versus 1M depending on model or account. This has not been verified.
- Relevant files: `hooks/session-longevity-checkpoint.js`, SKILL.md "Persistent sessions" / Quick Summary (the 400K and 930K figures), README Hooks table.

## Suggested next step

Find out what window the subagents actually run with. If it varies, make the retirement threshold proportional to the target's window rather than a fixed 400K. One option is to read the window from the transcript or model, and fall back to the observed compaction point.

## Why deferrable

It is not caused by 1.28.0, which changes no hooks, and the existing compact-boundary warning already prevents silent harm. It is not trivial and not part of this cycle's scope: it needs measurement and a hook change with tests.
