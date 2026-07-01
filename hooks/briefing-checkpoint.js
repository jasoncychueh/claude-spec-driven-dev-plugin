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
 * TWO-PASS SIGNAL (stateless, from the transcript):
 *
 *   PASS 1 — find where THIS plan session started (`sessionStart`). The check is
 *   bounded to the current entry into plan mode, so a deny never points at stale
 *   text from a previous plan session or from before a Claude Code restart. A
 *   small state machine tracks whether we are currently in a plan session:
 *     ENTER  (sets sessionStart):
 *       - an EnterPlanMode tool call (agent entered plan mode), OR
 *       - a *genuine* transition into plan on a real user message — read from the
 *         message's OWN `permissionMode:"plan"` field while NOT already in a plan
 *         session (the reliable signal for a manual shift+tab re-entry after a
 *         restart, which carries no EnterPlanMode call), OR
 *       - a bare `{type:"permission-mode",permissionMode:"plan"}` marker while NOT
 *         already in a plan session (a manual re-entry that left no user message).
 *     CLOSE  (ends the session):
 *       - an APPROVED ExitPlanMode — Claude Code delivers a "…approved your plan…"
 *         tool_result, correlated to the ExitPlanMode call by tool_use_id (so
 *         arbitrary tool output — e.g. a Read of a file that merely echoes the
 *         phrase — can NOT close the session). A *denied* ExitPlanMode does NOT
 *         close: its tool_result is our own deny reason, so the same session
 *         continues and recovery — brief → reply → retry — never deadlocks.
 *       - a real user message carrying a NON-plan `permissionMode` (the human
 *         typed while not in plan, i.e. plan mode had ended).
 *
 *   CRUCIAL: a bare `permission-mode:plan` marker seen while ALREADY in a plan
 *   session is IGNORED — it is not a boundary. Claude Code writes such a marker
 *   at essentially EVERY plan-mode turn boundary (verified in live transcripts:
 *   it recurs while plan mode is already active), NOT only on a manual re-entry.
 *   The old hook (1.7.1) treated every one of these as "a new plan session
 *   started here, demand a fresh briefing" and so FALSE-BLOCKED the compliant
 *   flow whenever such a marker happened to sit between the user's reply and the
 *   exit. Keying re-entry off the state machine above — real signals only — is
 *   what lets the routine markers be ignored without losing session anchoring.
 *
 *   PASS 2 — walk back from the ExitPlanMode call to `sessionStart`, SKIPPING the
 *   agent's MECHANICAL turns (the ExitPlanMode call itself; the ToolSearch that
 *   loads ExitPlanMode when it is a deferred tool; a post-approval Edit; etc.),
 *   tool_result deliveries, injected entries, and the routine markers above. The
 *   first remaining "real" message decides:
 *     - a human user reply        -> ALLOW (user was briefed and responded)
 *     - an assistant TEXT message  -> DENY (agent delivered a briefing as its own
 *       turn and then exited without waiting for a reply)
 *   Reaching `sessionStart` with no human reply -> DENY (no briefing+reply since
 *   entering this plan session — this also covers a briefing CRAMMED into the same
 *   message as ExitPlanMode: that message carries a tool_use so it is skipped as
 *   mechanical, and the walk denies at the boundary). If no plan session could be
 *   identified (`sessionStart < 0`: scrolled off / compacted) -> fail-open ALLOW.
 *
 * NEVER DEADLOCKS: after a deny the agent briefs turn-final, the user replies,
 *   and the retry sees that human reply -> allow. (This is why the old prompt
 *   hook, 1.6.2-1.6.5, was replaced: an LLM judge could not see history and
 *   blocked even AFTER a confirmed briefing.)
 *
 * FAIL-OPEN: any uncertainty (no transcript, parse error, unexpected shape, no
 *   identifiable plan session) -> allow.
 *
 * Filters (verified against live transcripts):
 *   - isSidechain: subagent messages — not the main conversation.
 *   - isMeta: injected user entries (local-command caveats, reminders).
 *   - tool_result-only user messages: a tool delivery, not a human reply.
 *   (A human reply is type:"user" with string / text content. A real user
 *   message also carries its own top-level `permissionMode` field — verified in
 *   live transcripts — which is Pass 1's reliable transition signal.)
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

// ---- read + parse transcript (JSONL) ----
let objs;
try {
  objs = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/).map((l) => {
    if (!l || !l.trim()) return null;
    try { return JSON.parse(l); } catch (_) { return null; }
  });
} catch (_) { allow(); }

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

// ---- collect ExitPlanMode tool_use ids from an entry (assistant turns carry them) ----
function collectExitIds(obj, into) {
  const msg = obj && (obj.message || obj);
  const content = msg && msg.content;
  if (!Array.isArray(content)) return;
  for (const b of content) {
    if (b && b.type === 'tool_use' && b.name === 'ExitPlanMode' && b.id) into.add(b.id);
  }
}

// ---- is this user entry the APPROVED result of one of our ExitPlanMode calls? (session close) ----
// Claude Code delivers "User has approved your plan…" when an ExitPlanMode is approved. We
// correlate by tool_use_id (not free text), so arbitrary tool output that merely echoes
// "approved your plan" (e.g. a Read of this very file) can NOT close the session. A DENIED
// exit's result is our own DENY_REASON (no "approved your plan"), so recovery never closes.
function isApprovedExit(obj, exitIds) {
  const msg = obj && (obj.message || obj);
  const content = msg && msg.content;
  if (!Array.isArray(content)) return false;
  for (const b of content) {
    if (b && b.type === 'tool_result' && b.tool_use_id && exitIds.has(b.tool_use_id)) {
      const t = typeof b.content === 'string' ? b.content : JSON.stringify(b.content);
      if (/approved your plan/i.test(t)) return true;
    }
  }
  return false;
}

// ---- PASS 1: find where the current plan session started (see header) ----
let sessionStart = -1;
let inPlan = false;
const exitIds = new Set();
for (let i = 0; i < objs.length; i++) {
  const obj = objs[i];
  if (!obj || obj.isSidechain) continue;

  collectExitIds(obj, exitIds); // an ExitPlanMode tool_use always precedes its result

  if (obj.type === 'permission-mode') {
    // Bare marker opens a session only as a manual re-entry (not already in plan);
    // while in plan it is routine turn-boundary bookkeeping -> ignore.
    if (obj.permissionMode === 'plan' && !inPlan) { inPlan = true; sessionStart = i; }
    continue;
  }

  const c = classify(obj);
  if (!c) continue;

  if (c.role === 'assistant' && c.hasEnterPlan) { inPlan = true; sessionStart = i; continue; }  // agent entry

  if (c.role === 'user' && isApprovedExit(obj, exitIds)) { inPlan = false; continue; }           // approved exit -> session closed

  if (c.role === 'user' && c.hasHumanText && !c.isMeta) {
    const pm = obj.permissionMode; // a real user message's own mode — the reliable transition signal
    if (pm === 'plan') { if (!inPlan) { inPlan = true; sessionStart = i; } } // genuine ->plan re-entry
    else if (pm != null) { inPlan = false; }                                 // typed while not in plan -> session ended
  }
}

// ---- PASS 2: walk back from ExitPlanMode to sessionStart, find the first real message ----
if (sessionStart >= 0) {
  for (let i = objs.length - 1; i > sessionStart; i--) {
    const c = classify(objs[i]);
    if (!c) continue;                                                      // markers / noise / subagent

    if (c.role === 'assistant' && c.hasToolUse) continue;                  // mechanical agent turn (ExitPlanMode / ToolSearch / Edit / ...)
    if (c.role === 'user' && c.isMeta) continue;                           // injected entry, not a human reply
    if (c.role === 'user' && c.hasToolResult && !c.hasHumanText) continue; // tool_result delivery

    if (c.role === 'user' && c.hasHumanText) allow();                      // a human reply since entry (mechanical turns aside) -> briefing flow
    if (c.role === 'assistant' && c.hasHumanText) deny(DENY_REASON);       // agent's own text with no human reply after -> briefed then didn't wait
    // else: thinking-only / empty assistant, empty user, etc. -> keep walking
  }
  deny(DENY_REASON); // reached the session boundary with no human reply -> no briefing+reply since entering
}

allow(); // no identifiable plan session (scrolled off / compacted) -> fail-open
