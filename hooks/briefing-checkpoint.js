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
 *   The turn-final briefing discipline guarantees a real *human* reply sits
 *   between the briefing and a legitimate ExitPlanMode. Walking back from the
 *   ExitPlanMode call we SKIP the agent's MECHANICAL turns — any assistant turn
 *   that makes a tool call (the ExitPlanMode call itself; the ToolSearch that
 *   loads ExitPlanMode when it is a deferred tool; a post-approval Edit; etc.) —
 *   plus tool_result deliveries and injected entries. The first remaining
 *   "real" message:
 *     - a human user reply        -> ALLOW (user was briefed and responded)
 *     - an assistant text message -> DENY (agent's own words with no human reply
 *       after them — it skipped the briefing, or didn't wait for one)
 *
 *   Skipping tool-call turns is what makes the check robust: a deferred
 *   ExitPlanMode forces a ToolSearch between the user's approval and the exit,
 *   and the agent often acknowledges approval before exiting — none of that
 *   should count as "no briefing". (Cost: a skip done purely via tool calls with
 *   no narration may slip through — the safe direction; we never false-block.)
 *
 *   ANCHORED TO THE CURRENT PLAN SESSION: the walk also stops at the point this
 *   plan mode was (re-)entered — a manual {type:"permission-mode",permissionMode:
 *   "plan"} marker (user shift+tab) OR an EnterPlanMode tool call (agent). Hitting
 *   that boundary before any human reply means no briefing happened since entering
 *   -> DENY. This stops a deny from pointing at stale text from BEFORE a Claude
 *   Code restart, and correctly asks for a fresh briefing when the user had to
 *   manually re-enter plan mode to resume a flow (a restart drops plan-mode state).
 *   Briefing in every plan session is the intended policy; anchoring just keeps the
 *   check satisfiable per-session instead of leaking across a restart boundary.
 *
 * NEVER DEADLOCKS: after a deny the agent briefs turn-final, the user replies,
 *   and the retry sees that human reply -> allow. (This is why the old prompt
 *   hook, 1.6.2-1.6.5, was replaced: an LLM judge could not see history and
 *   blocked even AFTER a confirmed briefing.)
 *
 * FAIL-OPEN: any uncertainty (no transcript, parse error, unexpected shape, no
 *   conclusive preceding message) -> allow.
 *
 * Filters (verified against live transcripts):
 *   - isSidechain: subagent messages — not the main conversation.
 *   - isMeta: injected user entries (local-command caveats, reminders).
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
  'Before exiting plan mode, deliver a Plan Briefing first: per briefing-guide.md, output a use-case-driven summary of the key points as a turn-final message, ' +
  'end the turn, wait for the user to reply, and only then call ExitPlanMode. (This check is bounded to "the current entry into plan mode" — it checks whether there has been a briefing + user reply since entering; ' +
  'manually re-entering plan mode after a restart to resume the flow also counts as a new entry, so add a condensed briefing before exiting. Once the briefing is done and the user has replied, retrying will allow it.)';

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
  let hasToolResult = false, hasToolUse = false, hasHumanText = false, hasEnterPlan = false;
  if (typeof content === 'string') {
    if (content.trim()) hasHumanText = true; // plain string content = typed text
  } else if (Array.isArray(content)) {
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'tool_result') hasToolResult = true;
      else if (b.type === 'tool_use') { hasToolUse = true; if (b.name === 'EnterPlanMode') hasEnterPlan = true; }
      else if (b.type === 'text' && b.text && b.text.trim()) hasHumanText = true;
    }
  }
  return { role, isMeta: !!obj.isMeta, hasToolResult, hasToolUse, hasHumanText, hasEnterPlan };
}

// ---- walk back to the first "real" (non-mechanical) message before ExitPlanMode ----
for (let i = lines.length - 1; i >= 0; i--) {
  const raw = lines[i];
  if (!raw || !raw.trim()) continue;
  let obj; try { obj = JSON.parse(raw); } catch (_) { continue; }

  // Plan-session boundary (manual entry): user shift+tab -> {type:"permission-mode", permissionMode:"plan"}.
  // Reaching it first (before any human reply) means no briefing+reply happened since (re-)entering plan
  // mode -> DENY. (Forces a fresh briefing; recoverable. Stops the deny from leaking past a restart.)
  // Checked on the raw entry (classify nulls permission-mode), but main-conversation-only like classify.
  if (obj && !obj.isSidechain && obj.type === 'permission-mode' && obj.permissionMode === 'plan') deny(DENY_REASON);

  const c = classify(obj);
  if (!c) continue;

  // Plan-session boundary (agent entry): the EnterPlanMode tool call that opened this plan session.
  if (c.role === 'assistant' && c.hasEnterPlan) deny(DENY_REASON);

  if (c.role === 'assistant' && c.hasToolUse) continue;                  // mechanical agent turn (ExitPlanMode / ToolSearch / Edit / ...)
  if (c.role === 'user' && c.isMeta) continue;                           // injected entry, not a human reply
  if (c.role === 'user' && c.hasToolResult && !c.hasHumanText) continue; // tool_result delivery

  if (c.role === 'user' && c.hasHumanText) allow(); // a human reply since entry (mechanical turns aside) -> briefing flow
  if (c.role === 'assistant') deny(DENY_REASON);    // agent's own text with no human reply after -> skip / didn't wait
  allow(); // ambiguous -> fail-open
}

allow(); // nothing conclusive (plan entry scrolled off / compacted) -> fail-open
