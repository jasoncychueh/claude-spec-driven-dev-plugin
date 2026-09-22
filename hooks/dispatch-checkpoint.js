#!/usr/bin/env node
/*
 * spec-driven-development — executor dispatch checkpoint.
 *
 * PreToolUse hook, matcher `*`, that fires INSIDE an executor's own session and asks
 * it to send the arbiter a progress line once a dispatch has run long — and then to
 * carry straight on working. It replaces the per-agent `maxTurns` ceilings removed in
 * 1.24.0, and it stops nothing.
 *
 * WHY THE CEILINGS WENT, AND WHY THIS IS NOT THEM AGAIN. `maxTurns` bought the
 * arbiter a look at work in progress, and that part was worth having — an
 * implementer that misread the design should not burn 285 turns before anyone
 * sees a line of it. What it cost was too high for what it bought: the cut landed
 * wherever the budget ran out, mid-action, so the tree was left half-edited and
 * the build broken; the progress file was stale at the cut, because a cut does not
 * wait for bookkeeping; and the resume started blind, reconstructing from symbol
 * counts and build errors what the executor already knew. The same turns were then
 * re-paid on the resume. The interruption was worth keeping. The truncation was not.
 *
 * So this hook keeps the arbiter's look at work in progress and throws away the
 * interruption entirely. At the threshold it injects one note asking the executor to
 * `SendMessage` a short status to "main" and keep going — no stopping, no waiting for
 * a reply. Both halves of that are measured, not assumed: 62 of 62 subagent sends to
 * "main" returned "Message queued for the main conversation's next turn", and 2,815
 * messages have reached executors mid-dispatch, delivered between turns with the
 * harness's own "The coordinator sent a message while you were working" prefix. So the
 * arbiter reads the status on its next turn and, if the direction is wrong, reaches the
 * executor where it stands. Nothing is cut, nothing is re-paid, and a dispatch that is
 * going fine costs exactly one tool call per checkpoint.
 *
 * Overshoot is therefore nearly free, which is why the thresholds can be generous and
 * why the note repeats every threshold rather than once: a status line from a dispatch
 * that turns out fine costs a tool call, while a silent dispatch that has drifted costs
 * the whole dispatch.
 *
 * WHAT IT MUST NOT DO — the 1.22.1 rule stands. The note asks for a checkpoint; it
 * never tells the executor to stop reading. An executor that spent the whole
 * dispatch reading reports what it learned, and it is the arbiter's job to narrow
 * the target from there. A reading ban makes the executor edit blind, which is the
 * failure this workflow exists to prevent.
 *
 * SCOPE. `agent_id` is present only when a hook fires from within a subagent
 * (absent on the main thread, even in --agent sessions), so the main agent is never
 * addressed by this hook. `agent_type` carries the threshold: the numbers are the
 * measured per-dispatch medians the old `maxTurns` ceilings were cut at.
 *
 * COUNTING. The backward walk stops at whichever comes first: the previous checkpoint
 * (this hook's own marker) or the dispatch boundary — a user message that still carries
 * instruction once any `<system-reminder>` blocks are stripped out, since those are
 * injections rather than dispatches and one appended to a real dispatch message must
 * not hide the boundary. What is counted between there and now is assistant messages
 * carrying a `tool_use`: the same unit `maxTurns` used, resetting on every resume just
 * as it did. Verified on real transcripts: a session with 97 lifetime tool calls and 0
 * since its last dispatch stays silent. If the tail reaches neither marker nor boundary
 * the count is a lower bound, so the note simply arrives later.
 *
 * SPACING. Stopping the walk at the previous marker is what makes the note periodic —
 * one per threshold of work, not one per dispatch and not one per tool call. The marker
 * is matched on the RAW transcript line rather than a decoded string `content`: the
 * transcripts show injections arriving as plain strings, but if one ever arrived inside
 * a tool_result list, a missed marker would mean speaking on every subsequent call.
 *
 * FAIL-OPEN, ALWAYS: main thread, an unknown agent type, an unreadable transcript,
 * a parse error -> allow, silently.
 *
 * Stateless & side-effect-free: reads stdin + its own transcript tail, writes nothing.
 */

'use strict';
const fs = require('fs');
const path = require('path');

// Tool calls into a dispatch at which the executor is asked to check in. These are
// the per-dispatch medians measured before 1.22.0 and used as the `maxTurns`
// ceilings until 1.24.0. Matched as a suffix of `agent_type`, which arrives
// plugin-qualified (e.g. "spec-driven-development:spec-implementer").
const THRESHOLDS = {
  'spec-implementer': 45,
  'implementation-reviewer': 40,
  'design-reviewer': 30,
  'spec-researcher': 30,
  'spec-author': 25,
  'spec-tester': 20,
  'spec-verifier': 20,
  'tasks-design-verifier': 15,
};

const MARKER = '[spec-driven-development] Dispatch checkpoint';
const TAIL_BYTES = 2 * 1024 * 1024; // long dispatches are long; reaching the boundary matters

function emit(out) {
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}
function allow() {
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } });
}
function note(text) {
  // No permissionDecision: the call in flight proceeds untouched. The executor
  // reads this on its next turn and checks in at a point of its own choosing.
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } });
}

let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) { allow(); }

// Main thread -> not ours. agent_id is the documented way to tell them apart.
const agentId = input && typeof input.agent_id === 'string' ? input.agent_id : '';
if (!agentId) allow();

const agentType = input && typeof input.agent_type === 'string' ? input.agent_type : '';
let threshold = 0;
for (const name of Object.keys(THRESHOLDS)) {
  if (agentType === name || agentType.endsWith(':' + name)) { threshold = THRESHOLDS[name]; break; }
}
if (!threshold) allow(); // an agent this plugin does not own

let transcriptPath = input && input.transcript_path;
if (!transcriptPath) allow();

// Which file the harness hands a hook that fired inside a subagent is not documented,
// so do not depend on it: if this is not already the executor's own transcript, derive
// it the way session-longevity-checkpoint.js does and use that when it exists. Either
// branch ends up counting the executor's turns, never the main agent's.
try {
  const own = 'agent-' + agentId + '.jsonl';
  if (path.basename(transcriptPath) !== own) {
    const dir = path.dirname(transcriptPath);
    const sid = path.basename(transcriptPath).replace(/\.jsonl$/i, '');
    const derived = path.join(dir, sid, 'subagents', own);
    if (fs.existsSync(derived)) transcriptPath = derived;
  }
} catch (_) { /* keep what we were given */ }

let calls = 0;
try {
  const fd = fs.openSync(transcriptPath, 'r');
  let chunk;
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    chunk = buf.toString('utf8');
  } finally { fs.closeSync(fd); }

  const lines = chunk.split(/\r?\n/);

  // Walk backwards to the dispatch boundary, counting tool_use turns on the way.
  // A boundary is a plain-string user message that is not a hook injection.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || line.charAt(0) !== '{') continue;
    let obj;
    try { obj = JSON.parse(line); } catch (_) { continue; } // truncated first line, or noise
    const m = obj && obj.message;
    if (!m || typeof m !== 'object') continue;

    if (m.role === 'user') {
      // The marker is checked on the RAW line, not on a string `content`: an injected
      // note may arrive as a plain string (what the transcripts show) or inside a
      // tool_result list, and a missed marker means speaking on every later call.
      if (line.indexOf(MARKER) !== -1) break; // count from the previous checkpoint
      const c = m.content;
      // A dispatch boundary is a user message that carries real instruction. Strip any
      // <system-reminder> blocks first: those are injections, not dispatches, and one
      // appended to a real dispatch message must not hide the boundary — a missed
      // boundary would walk back past the last marker and silence the hook for good.
      if (typeof c === 'string' && c.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()) break;
      continue;
    }
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      if (m.content.some((x) => x && x.type === 'tool_use')) calls++;
    }
  }
} catch (_) { allow(); }

if (calls < threshold) allow();

note(
  `${MARKER}: ${calls} tool calls into this dispatch, and the main agent has seen nothing from ` +
  `it yet. It is the arbiter — it decides what gets worked on — and it can only judge direction ` +
  `from something you send it.
` +
  `Send it one now: \`SendMessage\` to "main" with what is done, what you are in the middle of, ` +
  `what you intend next, and any fact you verified this dispatch that changes the plan. Then ` +
  `**carry straight on working** — do not stop, do not wait for a reply, do not treat this as a ` +
  `request to wrap up. Your message is queued for the main agent's next turn; if it wants ` +
  `something changed it will reach you where you stand, mid-work.
` +
  `Nothing here asks you to read less. If this dispatch has been spent reading, say what you ` +
  `learned and what it changes, and name plainly what you have not verified rather than writing ` +
  `around it.`
);
