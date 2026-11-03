'use strict';
/*
 * spec-driven-development — shared transcript helpers for the PreToolUse hooks that
 * decide from session history (briefing-checkpoint.js, approval-gate.js).
 *
 * A Claude Code transcript is JSONL. Verified against live transcripts:
 *   - every content block of one assistant message is written as its OWN entry
 *     (a text block and a tool_use block are two consecutive entries);
 *   - a tool's result comes back as a later `user` entry carrying a tool_result block
 *     with the same tool_use_id (is_error:true when the tool failed or was rejected);
 *   - subagent messages carry isSidechain; injected entries (reminders, local-command
 *     caveats, compaction summaries) carry isMeta / isCompactSummary; a message the
 *     human typed carries origin.kind === 'human' in current versions, and a user entry
 *     whose origin is some other kind (a task notification, say) is not a human reply;
 *   - a prompt the user typed while the agent's turn was running is NOT a user entry: Claude Code
 *     writes it as {type:'attachment', attachment:{type:'queued_command', commandMode:'prompt',
 *     origin:{kind:'human'}, prompt:'<text>'}} (queued commands of other origins — task
 *     notifications, peer sessions — carry another origin.kind or commandMode). classify() reads
 *     the human ones as a user reply;
 *   - the file also holds entries that are NOT messages — permission-mode markers, ai-title,
 *     other attachments and `api-request-blob` (a stored copy of an API payload whose
 *     `message.role` says user or assistant: a user-role blob with the same text is written
 *     just before each real human entry, and a blob can replay old assistant text). Only
 *     `type` exactly 'user' or 'assistant' marks a message; the role inside `message` is never
 *     consulted for any other type.
 *
 * Pure functions plus one file read; nothing here writes anywhere.
 */
const fs = require('fs');

// Parsed JSONL entries (null for blank or unparsable lines); null when the file cannot be read.
function readTranscript(transcriptPath) {
  try {
    return fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/).map((l) => {
      if (!l || !l.trim()) return null;
      try { return JSON.parse(l); } catch (_) { return null; }
    });
  } catch (_) { return null; }
}

// A main-conversation message: type exactly 'user' or 'assistant', not a subagent's.
function isMessage(obj) {
  return !!obj && typeof obj === 'object' && !obj.isSidechain && (obj.type === 'user' || obj.type === 'assistant');
}

// The content blocks of an entry ([] when the content is a plain string or absent).
function blocks(obj) {
  const msg = obj && (obj.message || obj);
  const content = msg && msg.content;
  return Array.isArray(content) ? content.filter((b) => b && typeof b === 'object') : [];
}

// The content blocks of a main-conversation message ([] for every other kind of entry), so a
// stored API payload or a subagent entry can neither create nor invalidate evidence.
const messageBlocks = (obj) => (isMessage(obj) ? blocks(obj) : []);

// The text of a tool_result block, whatever shape its content took.
function resultText(b) {
  if (typeof b.content === 'string') return b.content;
  try { return JSON.stringify(b.content) || ''; } catch (_) { return ''; }
}

// The text of a queued prompt the human typed while the agent was working (null for every other entry).
function queuedHumanPrompt(obj) {
  if (obj.type !== 'attachment' || obj.isSidechain) return null;
  const a = obj.attachment;
  if (!a || typeof a !== 'object' || a.type !== 'queued_command' || a.commandMode !== 'prompt') return null;
  if (!a.origin || a.origin.kind !== 'human') return null;
  return typeof a.prompt === 'string' && a.prompt.trim() ? a.prompt : null;
}
const SLASH_PROMPT = /^\s*\/[A-Za-z]/;

// ---- classify a main-conversation user/assistant entry or a human queued prompt (null for everything else) ----
function classify(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const queued = queuedHumanPrompt(obj);
  if (queued !== null) {
    // A slash command typed into the queue cannot be told from a setting command (/effort ...): not a reply.
    return { role: 'user', isMeta: false, nonReply: SLASH_PROMPT.test(queued), hasToolResult: false, hasToolUse: false, hasHumanText: true, hasEnterPlan: false };
  }
  if (!isMessage(obj)) return null; // subagent message, stored API payload, marker, ... — not the main conversation
  const role = obj.type;
  const msg = obj.message || obj;

  const content = msg && msg.content;
  let hasToolResult = false, hasToolUse = false, hasHumanText = false, hasEnterPlan = false;
  let lead = ''; // the first non-empty text
  if (typeof content === 'string') {
    if (content.trim()) { hasHumanText = true; lead = content; } // plain string content = typed text
  } else if (Array.isArray(content)) {
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'tool_result') hasToolResult = true;
      else if (b.type === 'tool_use') { hasToolUse = true; if (b.name === 'EnterPlanMode') hasEnterPlan = true; }
      else if (b.type === 'text' && b.text && b.text.trim()) { hasHumanText = true; if (!lead) lead = b.text; }
    }
  }
  const injected = !!obj.isMeta || !!obj.isCompactSummary
    || (role === 'user' && !!obj.origin && !!obj.origin.kind && obj.origin.kind !== 'human');
  // Entries the harness writes as user text but the human did not answer with: a slash-command
  // invocation, local-command output, an interrupt marker.
  const nonReply = role === 'user' && NON_REPLY.test(lead);
  return { role, isMeta: injected, nonReply, hasToolResult, hasToolUse, hasHumanText, hasEnterPlan };
}

// (A slash command is written as <command-message>…</command-message><command-name>…, in either order.)
const NON_REPLY = /^\s*(?:<command-(?:name|message)>|<local-command-|\[Request interrupted)/;

// ---- walk back from `end` (exclusive) toward `floor` (exclusive) and find the first REAL message ----
// Skips the agent's mechanical turns (any assistant entry carrying a tool_use — the call under
// test itself, a ToolSearch, an Edit), tool_result deliveries, injected entries, command / interrupt
// entries and bare markers.
// Returns { kind, index }:
//         kind 'human'     — a human user reply comes first (the user was briefed and responded),
//         kind 'assistant' — the agent's own text comes first (it spoke and did not wait for a reply),
//         kind 'boundary'  — nothing real between `floor` and `end` (index -1).
function previousReal(objs, end, floor) {
  for (let i = end - 1; i > floor; i--) {
    const c = classify(objs[i]);
    if (!c) continue;                                                      // markers / noise / subagent
    if (c.role === 'assistant' && c.hasToolUse) continue;                  // mechanical agent turn
    if (c.role === 'user' && (c.isMeta || c.nonReply)) continue;           // injected entry / command / interrupt marker, not a human reply
    if (c.role === 'user' && c.hasToolResult && !c.hasHumanText) continue; // tool_result delivery
    if (c.role === 'user' && c.hasHumanText) return { kind: 'human', index: i };
    if (c.role === 'assistant' && c.hasHumanText) return { kind: 'assistant', index: i };
    // thinking-only / empty assistant, empty user, etc. -> keep walking
  }
  return { kind: 'boundary', index: -1 };
}

// Just the kind of the first real message (see previousReal).
const replyBefore = (objs, end, floor) => previousReal(objs, end, floor).kind;

module.exports = { readTranscript, isMessage, blocks, messageBlocks, resultText, classify, previousReal, replyBefore };
