#!/usr/bin/env node
/*
 * spec-driven-development — executor context checkpoint.
 *
 * PreToolUse hook on SendMessage. A subagent is resumed by sending it a message,
 * so every SendMessage naming an executor is the one moment where the main agent
 * decides "resume this session" — and the only moment a hook can put a fact in
 * front of that decision.
 *
 * WHY THIS EXISTS, AND WHY IT NO LONGER COUNTS RESUMES. The first version of this
 * hook counted resumes and spoke at #15 / #25. It worked, in the narrow sense: the
 * resume long tail (105 and 119 rounds on a single subagent) disappeared within a
 * day. But the measurement that followed showed the axis was wrong. Cost and
 * defocus do not track how many times a session was resumed; they track how large
 * its context has grown. Executors were reaching ~930K — a median peak of 461K
 * across a day, 25 of 43 sessions past 400K — and 151 `compact_boundary` markers
 * across the subagent transcripts prove what happens next: the harness autocompacts
 * the executor, which then carries on writing code against a lossy summary of its
 * own design basis rather than the design.
 *
 * Worse, the resume-count axis actively fights the dispatch rule it now sits beside.
 * Small bounded dispatches continued by resume are the prescribed shape (and
 * `maxTurns` in the agent frontmatter enforces it), which drives resume counts UP
 * by design. A hook that complains at #15 would be complaining about exactly the
 * behaviour the skill asks for, and would teach the main agent to ignore it.
 *
 * So it measures context instead. `maxTurns` bounds growth WITHIN one dispatch —
 * the hook cannot see that, because no SendMessage happens mid-dispatch. This hook
 * bounds accumulation ACROSS dispatches — which `maxTurns` cannot see, because its
 * budget resets on every resume. Neither covers the other; that is why both exist.
 *
 * WHY RETIRE RATHER THAN COMPACT. The ceiling is enforced by retiring the session,
 * not by compacting it, and 400K sits far below the ~930K the harness compacts at,
 * so a well-run executor never reaches compaction at all. That ordering is the
 * whole point: this workflow keeps the executor's basis on disk (design.md,
 * tasks.md, the review log), so a fresh spawn re-reads the authoritative text while
 * a compacted session keeps a paraphrase of it — and cannot tell that it did.
 *
 * WHAT IT DOES. It injects context and nothing else — no permissionDecision at all,
 * so it can never block, prompt, or alter a call. Whether this session holds tacit
 * knowledge a fresh spawn would lose is visible only to the main agent; a
 * permission prompt would put that question to the user, who sees a hex id and a
 * number. What the main agent lacks is not judgment but a fact — its context holds
 * no measurement of how large a given executor has grown. The hook supplies the
 * fact, review-protocol.md supplies the criterion, the main agent decides.
 *
 * Reviewer sessions are deliberately NOT exempt. A reviewer that has grown past
 * 400K is exactly what the convergence fuse treats as suspect, and a reviewer's
 * corpus re-reads from disk cheaply.
 *
 * FAIL-OPEN, ALWAYS: no transcript, an unreadable or absent subagent transcript, a
 * `to` that is not a subagent id (a peer-session or teammate name), a parse error,
 * or no usage record yet -> allow, silently. A checkpoint that interrupts the flow
 * over its own bugs costs more than the problem it guards.
 *
 * Stateless & side-effect-free: reads stdin + transcripts (read-only, tail only),
 * writes NOTHING anywhere. Cross-platform pure Node (Claude Code ships Node).
 */

'use strict';
const fs = require('fs');
const path = require('path');

// Context sizes at which the checkpoint speaks, in tokens of the executor's own
// conversation. 400K is the retirement ceiling: high enough that ordinary bounded
// dispatches never reach it, far enough below the harness's ~930K autocompact that
// a session retired here is never compacted. WATCH is one dispatch of warning.
const RETIRE_AT = 400000;
const WATCH_AT = 300000;

// Only the tail of a subagent transcript is read — these files reach tens of MB.
const TAIL_BYTES = 512 * 1024;

// Subagent ids are 'a' + hex. Anything else addressed by SendMessage is a peer
// session or teammate, which has no subagent transcript and is not ours to judge.
const AGENT_ID = /^a[0-9a-f]{8,}$/;

function emit(out) {
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}
function allow() {
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } });
}
function note(text) {
  // No permissionDecision, ever: the call passes through untouched and only the
  // main agent's context gains a line it could not have computed for itself.
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } });
}

// ---- read hook input ----
let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) { allow(); }

const toolInput = (input && input.tool_input) || {};
const target = typeof toolInput.to === 'string' ? toolInput.to.trim() : '';
if (!target || !AGENT_ID.test(target)) allow();

const transcriptPath = input && input.transcript_path;
if (!transcriptPath) allow();

// ---- locate the target's own transcript ----
// Main session lives at <dir>/<session-id>.jsonl; its subagents at
// <dir>/<session-id>/subagents/agent-<id>.jsonl.
let subPath;
try {
  const dir = path.dirname(transcriptPath);
  const sid = path.basename(transcriptPath).replace(/\.jsonl$/i, '');
  subPath = path.join(dir, sid, 'subagents', 'agent-' + target + '.jsonl');
  if (!fs.existsSync(subPath)) allow(); // never dispatched from this session, or not a subagent
} catch (_) { allow(); }

// ---- read the last usage record: that is the session's current context size ----
let contextTokens = 0;
try {
  const fd = fs.openSync(subPath, 'r');
  let chunk;
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    chunk = buf.toString('utf8');
  } finally { fs.closeSync(fd); }

  const lines = chunk.split(/\r?\n/);

  // A session the harness has ALREADY compacted reads as small: its next usage
  // record starts from the summary, ~100K. Token size alone would wave it through
  // forever, which inverts the whole point — it is the one session guaranteed to be
  // working from a paraphrase of its basis rather than the basis. The boundary
  // marker in its own transcript is the only durable evidence, so look for it first.
  for (const line of lines) {
    if (line && line.indexOf('compact_boundary') !== -1) {
      note(
        `[spec-driven-development] Executor session "${target}" has already been autocompacted — its transcript ` +
        `carries a compact boundary. It is no longer working from design.md, tasks.md and the issue text it was ` +
        `given; it is working from a summary of them, and it cannot tell what the summary dropped. Its current ` +
        `token count reads small for the same reason and means nothing here.
` +
        `Retire it. Spawn fresh for this dispatch and hand over the current artifact state plus review-log §1 — ` +
        `the fresh executor re-reads the authoritative text from disk, which is exactly what this session no ` +
        `longer has. Resume only to extract something from it that exists nowhere else, never to continue the work.`
      );
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    // Cheap pre-filter before parsing: most lines carry no usage record.
    if (!line || line.indexOf('"usage"') === -1) continue;
    let obj;
    try { obj = JSON.parse(line); } catch (_) { continue; } // a truncated first line, or noise
    const u = obj && obj.message && obj.message.usage;
    if (!u) continue;
    contextTokens =
      (u.cache_read_input_tokens || 0) +
      (u.cache_creation_input_tokens || 0) +
      (u.input_tokens || 0);
    break;
  }
} catch (_) { allow(); }

if (!contextTokens) allow(); // no usage record yet — a session that has not run

const k = Math.round(contextTokens / 1000);

if (contextTokens >= RETIRE_AT) {
  note(
    `[spec-driven-development] Executor session "${target}" is carrying ~${k}K tokens of context — at or past ` +
    `the ${RETIRE_AT / 1000}K retirement ceiling (review-protocol.md, "Retire a session at 400K of context, not ` +
    `at a round count"). Past this size its context is largely a record of its own earlier reasoning rather than the ` +
    `task ` +
    `in front of it, and the harness will autocompact it around 930K, after which it continues working from a ` +
    `summary of its design basis instead of the basis itself — silently, because a compacted session cannot ` +
    `tell what it lost.
` +
    `Retire it and spawn fresh for this dispatch unless you can name what THIS session gives THIS dispatch ` +
    `that a fresh spawn would lose: tacit knowledge that exists nowhere on disk (why the code is shaped this ` +
    `way, what was tried and rejected). "Same feature" / "still this cycle" / "already warmed up" are topic ` +
    `continuity, not an asset. A fresh executor re-reads design.md, tasks.md and review-log §1 from disk — the ` +
    `authoritative text, which is exactly what the retiring session no longer has.`
  );
}

if (contextTokens >= WATCH_AT) {
  note(
    `[spec-driven-development] Executor session "${target}" is carrying ~${k}K tokens of context, approaching ` +
    `the ${RETIRE_AT / 1000}K retirement ceiling. Nothing to do now — this dispatch is fine. But size it so it ` +
    `lands under the ceiling rather than through it, and expect to retire this session rather than resume it ` +
    `again afterwards. Mechanical work — applying a stated fix to named files — needs no history at all and is ` +
    `cleaner on a fresh spawn.`
  );
}

allow();
