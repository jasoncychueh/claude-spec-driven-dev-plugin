#!/usr/bin/env node
/*
 * spec-driven-development — Plan Briefing checkpoint.
 *
 * PreToolUse hook on ExitPlanMode. Enforces that a Plan Briefing was delivered
 * as a turn-final message AND the user replied BEFORE plan mode is exited — so
 * the human can digest the plan / spec approach at the cheapest moment instead
 * of facing a wall of text in the approval dialog. (A briefing exists to lower
 * the reading load of a full plan/spec, not merely to gate approval.)
 *
 * Applies to EVERY ExitPlanMode — Quick Fix Mode, the /create-spec and
 * /update-spec plan phases, and plain plan mode alike. A briefing before
 * approving any plan is never harmful, and the check is fail-open and
 * satisfiable, so it never blocks you for real.
 *
 * SIGNAL (stateless, from the transcript):
 *   The turn-final briefing discipline guarantees a real *human* message sits
 *   immediately before a legitimate ExitPlanMode:
 *       ...assistant briefing (turn ends) -> HUMAN reply -> assistant ExitPlanMode
 *   A *skip* chains straight from planning to ExitPlanMode with no human reply
 *   (only assistant turns, tool_result deliveries, or injected entries). So the
 *   first "real" message before ExitPlanMode being human -> ALLOW; being the
 *   agent's own -> DENY (short reminder to brief turn-final and wait).
 *
 * NEVER DEADLOCKS: after a deny the agent briefs turn-final, the user replies,
 *   and the retry sees that human reply -> allow. (This is exactly why the old
 *   prompt hook, 1.6.2-1.6.5, was replaced: an LLM judge could not see history
 *   and blocked even AFTER a confirmed briefing.)
 *
 * FAIL-OPEN: any uncertainty (no transcript, parse error, unexpected shape, no
 *   conclusive preceding message) -> allow.
 *
 * Filters (verified against live transcripts):
 *   - isSidechain: subagent messages — not the main conversation.
 *   - isMeta: injected user entries (local-command caveats, reminders) — not a
 *     real human reply.
 *   - tool_result-only user messages: a tool delivery, not a human reply.
 *   (A human reply is type:"user" with string / text content.)
 *
 * Stateless & side-effect-free: reads stdin + the transcript (read-only),
 * writes NOTHING anywhere. Cross-platform pure Node (Claude Code ships Node).
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
  '退出 plan mode 前請先交付 Plan Briefing：依 briefing-guide.md 以「回合最終訊息」輸出 use-case-driven 的重點摘要、' +
  '結束回合、等 user 回覆，再呼叫 ExitPlanMode。（此檢查看「ExitPlanMode 前一則是否為使用者回覆」— ' +
  '直接從規劃接 ExitPlanMode 會被擋；briefing 完且 user 回覆後重試即放行。）';

// ---- read hook input ----
let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) { allow(); }
const transcriptPath = input && input.transcript_path;
if (!transcriptPath) allow();

// ---- read transcript (JSONL) ----
let lines;
try { lines = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/); } catch (_) { allow(); }

// ---- classify a main-conversation user/assistant entry (null for everything else) ----
function classify(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.isSidechain) return null; // subagent message — not the main conversation
  const msg = obj.message || obj;
  const role = (obj.type === 'user' || obj.type === 'assistant') ? obj.type
             : (msg && typeof msg.role === 'string') ? msg.role : null;
  if (role !== 'user' && role !== 'assistant') return null;

  const content = msg && msg.content;
  let hasToolResult = false, hasExitPlanMode = false, hasHumanText = false;
  if (typeof content === 'string') {
    if (content.trim()) hasHumanText = true; // plain string content = typed text
  } else if (Array.isArray(content)) {
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'tool_result') hasToolResult = true;
      else if (b.type === 'tool_use' && b.name === 'ExitPlanMode') hasExitPlanMode = true;
      else if (b.type === 'text' && b.text && b.text.trim()) hasHumanText = true;
    }
  }
  return { role, isMeta: !!obj.isMeta, hasToolResult, hasExitPlanMode, hasHumanText };
}

// ---- walk back to the first "real" message before the current ExitPlanMode ----
let passedCurrentExit = false;
for (let i = lines.length - 1; i >= 0; i--) {
  const raw = lines[i];
  if (!raw || !raw.trim()) continue;
  let obj; try { obj = JSON.parse(raw); } catch (_) { continue; }
  const c = classify(obj);
  if (!c) continue;

  if (c.role === 'assistant' && c.hasExitPlanMode && !passedCurrentExit) { passedCurrentExit = true; continue; } // current ExitPlanMode
  if (c.role === 'user' && c.isMeta) continue;                            // injected entry, not a human reply
  if (c.role === 'user' && c.hasToolResult && !c.hasHumanText) continue;  // tool_result delivery

  if (c.role === 'user' && c.hasHumanText) allow(); // human replied right before -> briefing flow
  if (c.role === 'assistant') deny(DENY_REASON);    // agent chained to ExitPlanMode -> skip
  allow(); // ambiguous -> fail-open
}

allow(); // nothing conclusive -> fail-open
