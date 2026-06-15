#!/usr/bin/env node
/*
 * spec-driven-development — Plan Briefing checkpoint (Quick Fix Mode only).
 *
 * PreToolUse hook on ExitPlanMode. Ensures a Plan Briefing was delivered as a
 * turn-final message AND the user replied BEFORE plan mode is exited — so the
 * human actually sees the briefing and can object at the cheapest moment.
 *
 * SCOPED — never interferes with plain plan mode:
 *   The hook fires on EVERY ExitPlanMode, but only ENFORCES when THIS plan
 *   cycle is a spec-driven Quick Fix flow. The marker: the design-reviewer
 *   subagent was invoked in this cycle (Quick Fix Mode mandates the
 *   design-review loop before ExitPlanMode; plain plan mode never invokes it).
 *
 *   "This cycle" is delimited by walking back from the current ExitPlanMode to
 *   the START of the current plan cycle — the most recent plan-mode entry.
 *   Both entry paths were verified against live transcripts:
 *     - user shift+tab entry -> {type:"permission-mode", permissionMode:"plan"}
 *     - agent (skill step 1) -> an EnterPlanMode tool_use
 *     ({type:"mode", mode:"plan"} is also checked belt-and-suspenders, though
 *      `mode` stays "normal" in bypassPermissions sessions — permissionMode is
 *      where the "plan" state actually lives.)
 *   We ENFORCE only if the cycle start is POSITIVELY identified AND a
 *   design-reviewer ran after it. Being able to call ExitPlanMode proves a
 *   plan-mode entry exists; if we still can't find it (unknown marker, or we
 *   walk into a prior ExitPlanMode first) our detection is uncertain, and
 *   uncertain -> ALLOW. There is no "fall back to the previous ExitPlanMode"
 *   boundary — that landmark is the PRIOR cycle's end, so using it would fold
 *   the inter-cycle gap (e.g. a Spec-Mode /create-spec, which also runs
 *   design-reviewer) into this cycle and produce false positives. A
 *   design-reviewer before the cycle start is correctly NOT counted. No
 *   design-reviewer this cycle -> ALLOW, so plain plan mode is untouched.
 *
 * SKIP SIGNAL (when in a Quick Fix cycle), read from the transcript:
 *   The turn-final briefing discipline guarantees a real *human* message sits
 *   immediately before a legitimate ExitPlanMode:
 *       ...assistant briefing (turn ends) -> HUMAN reply -> assistant ExitPlanMode
 *   A *skip* chains straight from plan-writing to ExitPlanMode with no human
 *   reply (only assistant turns and tool_result messages). So the first "real"
 *   message before ExitPlanMode being human -> ALLOW; assistant -> DENY.
 *
 * WHY THIS REPLACES THE OLD PROMPT HOOK (1.6.2-1.6.5):
 *   The prompt hook asked an LLM to judge. It could not see history, so despite
 *   an explicit "always allow" it reasoned "can't confirm the briefing -> block"
 *   and deadlocked ExitPlanMode even AFTER the briefing was delivered+confirmed.
 *   A deterministic transcript check cannot rationalize: after a briefing+reply
 *   the preceding message IS a human message -> allow. No deadlock.
 *
 * FAIL-OPEN: on ANY uncertainty (no transcript, parse error, unexpected shape,
 *   not a Quick Fix cycle) -> allow. We block ONLY when confident it is a skip
 *   inside a spec-driven cycle. A skip slipping through is acceptable (the
 *   in-context reminder layers remain); breaking plan mode or deadlocking is not.
 *
 * Stateless & side-effect-free: reads stdin + the transcript (read-only) and
 * writes NOTHING anywhere (no state file, no log, nothing in the project).
 * Cross-platform: pure Node (Claude Code ships Node), runs on Windows/Linux/Mac.
 */

'use strict';
const fs = require('fs');

function emit(decision, reason) {
  const out = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision } };
  if (reason) out.hookSpecificOutput.permissionDecisionReason = reason;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}
const allow = () => emit('allow');
const deny = (reason) => emit('deny', reason);

const DENY_REASON =
  'Plan Briefing 尚未交付。請先依 briefing-guide.md 以「回合最終訊息」輸出 use-case-driven 的 Plan Briefing、' +
  '結束回合、等 user 回覆，再呼叫 ExitPlanMode。（此檢查只在 spec-driven Quick Fix 流程生效，看「ExitPlanMode ' +
  '前一則是否為使用者回覆」— 直接從寫 plan 接 ExitPlanMode 會被擋；briefing 完且 user 回覆後重試即放行。）';

// ---- read hook input ----
let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) { allow(); }
const transcriptPath = input && input.transcript_path;
if (!transcriptPath) allow();

// ---- read transcript (JSONL) ----
let lines;
try { lines = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/); } catch (_) { allow(); }

// ---- is this entry the START of a plan cycle? (most recent one = cycle boundary) ----
function isPlanModeEntry(obj) {
  if (obj.type === 'permission-mode' && obj.permissionMode === 'plan') return true;
  if (obj.type === 'mode' && obj.mode === 'plan') return true;
  return false; // EnterPlanMode tool_use handled in classify (it's an assistant tool_use)
}

// ---- classify a main-conversation user/assistant entry (null for everything else) ----
function classify(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.isSidechain) return null; // subagent message — not the main conversation
  const msg = obj.message || obj;
  const role = (obj.type === 'user' || obj.type === 'assistant') ? obj.type
             : (msg && typeof msg.role === 'string') ? msg.role
             : null;
  if (role !== 'user' && role !== 'assistant') return null;

  const content = msg && msg.content;
  let hasToolResult = false, hasExitPlanMode = false, entersPlanMode = false,
      hasHumanText = false, invokesDesignReviewer = false;

  if (typeof content === 'string') {
    if (content.trim()) hasHumanText = true; // plain string content = typed text
  } else if (Array.isArray(content)) {
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'tool_result') hasToolResult = true;
      else if (b.type === 'tool_use') {
        if (b.name === 'ExitPlanMode') hasExitPlanMode = true;
        if (b.name === 'EnterPlanMode') entersPlanMode = true;
        const sub = (b.input && b.input.subagent_type) || '';
        if (/design-reviewer/i.test(sub) || /design-reviewer/i.test(b.name || '')) invokesDesignReviewer = true;
      } else if (b.type === 'text' && b.text && b.text.trim()) hasHumanText = true;
    }
  }
  return { role, isMeta: !!obj.isMeta, hasToolResult, hasExitPlanMode, entersPlanMode, hasHumanText, invokesDesignReviewer };
}

// ---- single backward walk: skip verdict + cycle-start + design-reviewer-in-cycle ----
let firstReal = null;          // 'user' | 'assistant' — first real message before ExitPlanMode
let sawDesignReviewer = false; // design-reviewer invoked in THIS plan cycle?
let cycleStartFound = false;   // did we positively reach the current cycle's plan-mode entry?
let passedCurrentExit = false; // have we skipped the current ExitPlanMode turn?

for (let i = lines.length - 1; i >= 0; i--) {
  const raw = lines[i];
  if (!raw || !raw.trim()) continue;
  let obj; try { obj = JSON.parse(raw); } catch (_) { continue; }

  // Cycle start = most recent plan-mode entry. Reaching it bounds THIS cycle.
  if (isPlanModeEntry(obj)) { cycleStartFound = true; break; }

  const c = classify(obj);
  if (!c) continue; // system / summary / sidechain / structural lines

  if (c.role === 'assistant' && c.entersPlanMode) { cycleStartFound = true; break; } // EnterPlanMode = cycle start

  if (c.role === 'assistant' && c.hasExitPlanMode) {
    if (!passedCurrentExit) { passedCurrentExit = true; continue; } // the current ExitPlanMode call
    break; // hit a PRIOR ExitPlanMode before this cycle's start → detection gap → stay out of scope
  }

  if (c.invokesDesignReviewer) sawDesignReviewer = true;

  if (firstReal === null) {
    if (c.role === 'user' && c.isMeta) { /* injected, skip */ }
    else if (c.role === 'user' && c.hasToolResult && !c.hasHumanText) { /* tool_result, skip */ }
    else if (c.role === 'user' && c.hasHumanText) firstReal = 'user';
    else if (c.role === 'assistant') firstReal = 'assistant';
  }
}

// ---- decide ----
// Block ONLY when all three hold: we positively bounded this plan cycle, a
// design-reviewer ran in it (spec-driven Quick Fix), and the message right
// before ExitPlanMode is the agent's own (a skip — no human reply to a briefing).
if (cycleStartFound && sawDesignReviewer && firstReal === 'assistant') deny(DENY_REASON);
allow(); // every other case (out of scope / briefed / couldn't bound cycle) → allow
