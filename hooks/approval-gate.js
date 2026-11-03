#!/usr/bin/env node
/*
 * spec-driven-development — approval gate.
 *
 * PreToolUse hook on the spawn tool (Agent, formerly Task). Blocks a spec-implementer or
 * spec-tester dispatch until the user has approved something in this session. Those two
 * dispatches are the skill's code-writing delegates; every other dispatch (author, reviewers,
 * verifiers, researcher, Explore, ...) passes. Other ways code can change — the main agent's own
 * edits, a general-purpose agent — are not covered here; the skill's rules govern them.
 *
 * Resumes go through SendMessage, not the spawn tool, so they are not gated — the original
 * spawn was, and a resumed session continues work that was already approved.
 *
 * WHAT THE HOOK CAN AND CANNOT KNOW. It checks that the user REPLIED to a briefing (or approved
 * an ExitPlanMode dialog). It does NOT bind that approval to a particular plan or spec: it never
 * looks at the dispatch prompt, and it cannot read what the reply said — the main agent runs
 * approve.mjs only on an explicit approval, and that is the skill's rule, not something this
 * hook enforces. Accepted cost: within a session an approval stays valid until the next entry
 * into plan mode.
 *
 * APPROVAL EVIDENCE (stateless, from the session transcript) — either of:
 *
 *   (1) an ExitPlanMode call the user approved: its tool_result is not an error. A rejection
 *       arrives as an error result ("The user doesn't want to proceed with this tool use…"),
 *       and so does a call our briefing-checkpoint hook denied.
 *
 *   (2) a Bash / PowerShell call running `approve.mjs <label>`, made as the first action after the
 *       user's reply to a briefing (the user left plan mode with shift+tab, or never was in it).
 *       <label> is a free-form record (feature name, plan path or slug); it is not matched
 *       against anything. Same walk as briefing-checkpoint.js (skip the agent's mechanical tool
 *       turns, tool_result deliveries and injected entries), applied twice: the first real
 *       message before the call must be a human reply, and the first real message before THAT
 *       reply must be the agent's own text (the briefing). So the sequence is: briefing text
 *       (turn end) -> human reply -> approve.mjs. A human message with no agent text before it
 *       (a session's first message, "/implement foo" straight into the call) is not a reply to
 *       anything; agent text between the reply and the call cannot be told from a same-turn
 *       briefing, so the call must be the first action of the turn. Slash-command, local-command
 *       and interrupt entries are not replies; they are skipped, neither counting nor breaking
 *       the walk. A prompt the user typed while the agent's turn was running (a queued_command
 *       attachment) is a reply. The script writes nothing — the call is the record. A call whose
 *       own result is an error (a malformed label) is not evidence. The call must really run:
 *       `node [flags] <path>/approve.mjs <label>` has to start a command (the start of the command
 *       string, or right after a newline, `;`, `&&` or `||`), so text that only mentions it — inside
 *       quotes (`echo "node a/approve.mjs x"`), after `#`, behind a literal `false &&`, after a
 *       pipe — is not a call. The label is the word after the script and ends at the end of the
 *       line, `;`, `&&`, `||` or `|`.
 *
 *   INVALIDATION: evidence is void when a plan-mode entry occurs after it — an EnterPlanMode call
 *   (one whose result is an error, because the user declined it, is not an entry), or a real user message whose own permissionMode moves into plan (a manual shift+tab re-entry
 *   leaves no EnterPlanMode call; the same transition signal briefing-checkpoint.js reads). The
 *   most recent valid evidence wins: allow iff some evidence sits after the last plan-mode entry.
 *
 * No evidence -> DENY with an actionable reason. NEVER DEADLOCKS: the reason says how to get
 * the evidence (brief, wait for the user, run the script), and anything the hook cannot judge —
 * no transcript, unreadable or unrecognisable transcript, missing fields, a call from inside a
 * subagent, an unexpected exception — passes (fail-open), like the other hooks. Headless
 * `claude -p` runs have no human reply to wait for, so the gate denies there by design.
 *
 * A pass emits nothing (exit 0, no output): an explicit "allow" would override the user's own
 * permission rules for the tool. Only a deny writes JSON. (The one deliberate explicit allow in
 * the plugin is briefing-checkpoint.js's, on ExitPlanMode; this gate never emits one.)
 *
 * Filters (shared with briefing-checkpoint.js, lib/transcript.js): only entries whose `type` is
 * exactly user or assistant are messages — stored API payloads (`api-request-blob`), markers and
 * the like are ignored wherever the transcript is scanned, so they can neither create nor
 * invalidate evidence; isSidechain entries are not the main conversation; isMeta / compaction /
 * non-human-origin entries are not human replies.
 *
 * Stateless & side-effect-free: reads stdin + the transcript (read-only), writes NOTHING.
 * Cross-platform pure Node (Claude Code ships Node).
 */

'use strict';
const path = require('path');
const { readInput, allow, deny } = require('./lib/hook-io');
const { readTranscript, messageBlocks, resultText, classify, previousReal } = require('./lib/transcript');

const GATED = new Set(['spec-implementer', 'spec-tester']);
const SHELLS = new Set(['Bash', 'PowerShell']);

const APPROVE_SCRIPT = path.resolve(__dirname, '..', 'scripts', 'approve.mjs').replace(/\\/g, '/');

// ---- reading the shell command: does it really RUN `node … approve.mjs <label>`? ----
// A command line is split into segments at an unquoted newline, `;`, `&&`, `||`, `|` or `&`, each
// segment into words (quotes removed). Text that merely mentions the call — inside quotes
// (`echo "node a/approve.mjs x"`), after `#`, or as an argument of another command — never starts a
// segment with `node`, so it is not a call. Only a segment that STARTS a command (the start of the
// string, or right after a newline, `;`, `&&`, `||`) counts; one after a pipe or a lone `&` does not.
// A segment behind a literal `false &&` / `true ||` (or such a chain) never executes and is skipped;
// what a command's exit status will be in general cannot be known from its text, so nothing beyond
// that is judged here (a call that failed comes back as an error result and is rejected separately).
function commandSegments(cmd) {
  const segs = [];
  let words = [], cur = null, redirected = false;
  let start = true, dead = false;     // how the segment being built began
  const flush = () => { if (cur !== null && !redirected) words.push(cur); cur = null; };
  const end = (joiner) => {
    flush();
    const seg = { words, start, dead };
    segs.push(seg);
    const first = words.length === 1 ? words[0].toLowerCase() : '';
    start = joiner === 'nl' || joiner === ';' || joiner === '&&' || joiner === '||';
    dead = (joiner === '&&' && (first === 'false' || seg.dead)) || (joiner === '||' && (first === 'true' || first === ':' || seg.dead));
    words = []; redirected = false;
  };
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (ch === "'") {                                    // single quotes: literal to the next one
      const j = cmd.indexOf("'", i + 1);
      const stop = j < 0 ? cmd.length : j;
      cur = (cur || '') + cmd.slice(i + 1, stop); i = stop; continue;
    }
    if (ch === '"') {                                    // double quotes: literal to the next unescaped one
      let s = '', j = i + 1;
      for (; j < cmd.length && cmd[j] !== '"'; j++) { if (cmd[j] === '\\' && cmd[j + 1] === '"') j++; s += cmd[j]; }
      cur = (cur || '') + s; i = j; continue;
    }
    if (ch === '#' && cur === null) {                    // a comment runs to the end of the line
      while (i + 1 < cmd.length && cmd[i + 1] !== '\n') i++;
      continue;
    }
    if (ch === '\n') { end('nl'); continue; }
    if (ch === ';') { end(';'); continue; }
    if (ch === '&' && cmd[i + 1] === '&') { end('&&'); i++; continue; }
    if (ch === '|' && cmd[i + 1] === '|') { end('||'); i++; continue; }
    if (ch === '|') { end('|'); continue; }
    if (ch === '&') {
      if (cur === null && words.length === 0) { words.push('&'); continue; } // PowerShell call operator at the start
      end('&'); continue;                                                    // background job: what follows is a new command, not a start
    }
    if (ch === '<' || ch === '>') {                      // a redirection: what follows is its target, not an argument
      if (cur !== null && /^\d+$/.test(cur)) cur = null; else flush();
      redirected = true; continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') { flush(); continue; }
    cur = (cur || '') + ch;
  }
  end('nl');
  return segs;
}

const baseName = (w) => w.replace(/^.*[\\/]/, '').toLowerCase();

// The label of the first genuine `node [flags] <path>/approve.mjs <label>` call in a shell command, or ''.
function approveLabel(command) {
  for (const seg of commandSegments(command)) {
    if (!seg.start || seg.dead) continue;
    const w = seg.words;
    let i = w[0] === '&' ? 1 : 0;
    if (i >= w.length || (baseName(w[i]) !== 'node' && baseName(w[i]) !== 'node.exe')) continue;
    for (i++; i < w.length; i++) {
      if (baseName(w[i]) === 'approve.mjs') {
        const label = (w[i + 1] || '').trim();
        if (label) return label;
        break;
      }
      if (!w[i].startsWith('-')) break;                                   // some other script, not approve.mjs
      if (!w[i].includes('=') && i + 1 < w.length && !w[i + 1].startsWith('-') && baseName(w[i + 1]) !== 'approve.mjs') i++; // the flag's value
    }
  }
  return '';
}

const DENY_REASON =
  'No recorded user approval in this session. ' +
  'Deliver the briefing as the turn-final message and wait for the user\'s explicit reply; ' +
  `then run node "${APPROVE_SCRIPT}" <label> as the FIRST action of your next turn (no text before it), and dispatch again. ` +
  'In Quick Fix Mode an ExitPlanMode the user approved already counts; if the user left plan mode with shift+tab and replied, run approve.mjs. ' +
  'If you already wrote text this turn, or the user replied with a slash command, ask for a one-word plain-text confirmation first. ' +
  '(Do not run the script to get past this check: it records an approval that must already exist.)';

// tool_use_id -> { isError, text } of the call's result
function toolResults(objs) {
  const m = new Map();
  for (const obj of objs) {
    for (const b of messageBlocks(obj)) {
      if (b.type === 'tool_result' && b.tool_use_id) m.set(b.tool_use_id, { isError: !!b.is_error, text: resultText(b) });
    }
  }
  return m;
}

// Is the approve.mjs call at entry `i` (tool_use block `b`) a genuine approval record?
function approveCallValid(objs, i, b, results) {
  if (b.type !== 'tool_use' || !SHELLS.has(b.name) || !b.input || typeof b.input.command !== 'string') return false;
  if (!approveLabel(b.input.command)) return false;                           // not a genuine `node approve.mjs <label>` call
  const r = b.id && results.get(b.id);
  if (r && r.isError) return false;                                            // the script rejected its argument
  const reply = previousReal(objs, i, -1);
  if (reply.kind !== 'human') return false;                                    // no human reply right before the call
  return previousReal(objs, reply.index, -1).kind === 'assistant';             // ...and the briefing came before that reply
}

// Index of the latest approval evidence not followed by a plan-mode entry, or -1.
function latestValidEvidence(objs, results) {
  let evidence = -1, lastVoid = -1, inPlan = false;
  for (let i = 0; i < objs.length; i++) {
    for (const b of messageBlocks(objs[i])) {
      if (b.type !== 'tool_use') continue;
      if (b.name === 'EnterPlanMode') {
        const r = b.id && results.get(b.id);
        if (!(r && r.isError)) { lastVoid = i; inPlan = true; }              // a declined entry never put the session into plan mode
      }
      else if (b.name === 'ExitPlanMode' && b.id) {
        const r = results.get(b.id);
        if (r && !r.isError && !/^\s*(the user doesn't want to proceed|user rejected)/i.test(r.text)) { evidence = i; inPlan = false; }
      } else if (approveCallValid(objs, i, b, results)) evidence = i;
    }
    // a manual re-entry (shift+tab) leaves no EnterPlanMode call: read it from the real user
    // message's own permissionMode moving into plan
    const c = classify(objs[i]);
    if (c && c.role === 'user' && c.hasHumanText && !c.isMeta) {
      const pm = objs[i].permissionMode;
      if (pm === 'plan') { if (!inPlan) { inPlan = true; lastVoid = i; } }
      else if (pm != null) inPlan = false;
    }
  }
  return evidence > lastVoid ? evidence : -1;
}

function main() {
  try {
    const input = readInput();
    if (!input || input.agent_id) allow();                       // unreadable input, or a call from inside a subagent
    const ti = input.tool_input;
    const type = ti && typeof ti.subagent_type === 'string' ? ti.subagent_type : '';
    if (!GATED.has(type.split(':').pop())) allow();              // only the two code-writing delegates are gated

    if (!input.transcript_path) allow();
    const objs = readTranscript(input.transcript_path);
    if (!objs || !objs.some((o) => o && typeof o === 'object' && classify(o))) allow(); // nothing recognisable -> cannot judge

    if (latestValidEvidence(objs, toolResults(objs)) >= 0) allow();
    deny(DENY_REASON);
  } catch (_) {
    allow();
  }
}

if (require.main === module) main();
module.exports = { toolResults, latestValidEvidence, approveLabel };
