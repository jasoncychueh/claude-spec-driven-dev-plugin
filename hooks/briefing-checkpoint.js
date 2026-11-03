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
 * Applies to EVERY ExitPlanMode — Quick Fix Mode and plain plan mode alike.
 * (Spec Mode plans in an ordinary session and never calls ExitPlanMode; its
 * approval is recorded by approval-gate.js.) A briefing before approving any
 * plan is never harmful, and the check is fail-open and satisfiable, so it
 * never blocks you for real.
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
 *     - a human user reply        -> ALLOW, explicitly (user was briefed and responded)
 *     - an assistant TEXT message  -> DENY (agent delivered a briefing as its own
 *       turn and then exited without waiting for a reply)
 *   Reaching `sessionStart` with no human reply -> DENY (no briefing+reply since
 *   entering this plan session — this also covers a briefing CRAMMED into the same
 *   message as ExitPlanMode: that message carries a tool_use so it is skipped as
 *   mechanical, and the walk denies at the boundary). If no plan session could be
 *   identified (`sessionStart < 0`: scrolled off / compacted) -> fail-open, silent pass.
 *
 * NEVER DEADLOCKS: after a deny the agent briefs turn-final, the user replies,
 *   and the retry sees that human reply -> explicit allow. (This is why the old prompt
 *   hook, 1.6.2-1.6.5, was replaced: an LLM judge could not see history and
 *   blocked even AFTER a confirmed briefing.)
 *
 * FAIL-OPEN: any uncertainty (no transcript, parse error, unexpected shape, no
 *   identifiable plan session) -> silent pass (no output).
 *
 * Filters (verified against live transcripts):
 *   - only entries whose `type` is exactly user or assistant are messages; stored API payloads
 *     (`api-request-blob`, whose message.role says user/assistant), markers and the like are
 *     ignored everywhere, including the ExitPlanMode / approval scans.
 *   - isSidechain: subagent messages — not the main conversation.
 *   - isMeta, compaction summaries and non-human-origin entries: injected, not a human reply.
 *   - slash-command, local-command and interrupt entries: not a human reply; skipped in the walk.
 *   - tool_result-only user messages: a tool delivery, not a human reply.
 *   - a human prompt queued while the agent's turn was running (an attachment entry, not a user
 *     entry) IS a human reply — lib/transcript.js reads it as one.
 *   (A human reply is type:"user" with string / text content. A real user
 *   message also carries its own top-level `permissionMode` field — verified in
 *   live transcripts — which is Pass 1's reliable transition signal.)
 *
 * The transcript helpers (classify, the walk back to the first real message) are
 * shared with approval-gate.js and live in lib/transcript.js.
 *
 * Stateless & side-effect-free: reads stdin + the transcript (read-only),
 * writes NOTHING anywhere. Cross-platform pure Node (Claude Code ships Node).
 * OUTPUT: the one case that writes an explicit permissionDecision:"allow" is a VERIFIED human
 * reply after the briefing (Pass 2 below) — the user has just answered the briefing, so the plan
 * dialog is let through (a deny from any other hook still wins). This is the only deliberate
 * explicit allow in the plugin. Every other pass — no transcript, parse error, no identifiable
 * plan session, any uncertainty — emits nothing (exit 0, no output) so the user's own permission
 * rules still apply. A deny writes the deny JSON.
 */

'use strict';
const { readInput, allow, deny, approveVerified } = require('./lib/hook-io');
const { readTranscript, messageBlocks, resultText, classify, replyBefore } = require('./lib/transcript');

const DENY_REASON =
  'Before exiting plan mode, deliver a Plan Briefing first: per briefing-guide.md, output a use-case-driven summary of the key points as a turn-final message, ' +
  'end the turn, wait for the user to reply, and only then call ExitPlanMode. (This check is bounded to "the current entry into plan mode" — it checks whether there has been a briefing + user reply since entering; ' +
  'manually re-entering plan mode after a restart to resume the flow also counts as a new entry, so add a condensed briefing before exiting. Once the briefing is done and the user has replied, retrying will allow it.)';

// ---- read hook input + transcript (JSONL) ----
const input = readInput();
const transcriptPath = input && input.transcript_path;
if (!transcriptPath) allow();
const objs = readTranscript(transcriptPath);
if (!objs) allow();

// ---- collect ExitPlanMode tool_use ids from an entry (assistant turns carry them) ----
function collectExitIds(obj, into) {
  for (const b of messageBlocks(obj)) {
    if (b.type === 'tool_use' && b.name === 'ExitPlanMode' && b.id) into.add(b.id);
  }
}

// ---- is this user entry the APPROVED result of one of our ExitPlanMode calls? (session close) ----
// Claude Code delivers "User has approved your plan…" when an ExitPlanMode is approved. We
// correlate by tool_use_id (not free text), so arbitrary tool output that merely echoes
// "approved your plan" (e.g. a Read of this very file) can NOT close the session. A DENIED
// exit's result is our own DENY_REASON (no "approved your plan"), so recovery never closes.
function isApprovedExit(obj, exitIds) {
  for (const b of messageBlocks(obj)) {
    if (b.type === 'tool_result' && b.tool_use_id && exitIds.has(b.tool_use_id)) {
      if (/approved your plan/i.test(resultText(b))) return true;
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
//   a human user reply -> ALLOW; the agent's own text first, or reaching the boundary -> DENY
if (sessionStart >= 0) {
  if (replyBefore(objs, objs.length, sessionStart) === 'human') approveVerified(); // the only explicit allow: a verified human reply
  deny(DENY_REASON);
}

allow(); // no identifiable plan session (scrolled off / compacted) -> fail-open
