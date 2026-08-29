#!/usr/bin/env node
/*
 * spec-driven-development — executor session longevity checkpoint.
 *
 * PreToolUse hook on SendMessage. A subagent is resumed by sending it a message,
 * so every resume of a given executor session is one SendMessage whose `to` names
 * that session. Counting them in the transcript gives the session's round count
 * for free — no state file, no bookkeeping.
 *
 * WHY THIS EXISTS. "Resume, don't respawn" is stated everywhere in this skill and
 * a fresh spawn reads as breaking discipline, so the main agent keeps resuming the
 * same executor indefinitely. Measured across real transcripts: a median session
 * takes ~10-15 resumes, but the tail reaches 119 and 105 resumes on a single
 * subagent. Long past that point the session's context is mostly a record of its
 * own earlier reasoning rather than the work in front of it — the same anchoring
 * the convergence fuse already guards against by spawning fresh eyes at Round 5.
 * The cost is not tokens; it is a cheaper-tier executor losing the thread of what
 * it is currently supposed to be doing.
 *
 * WHAT IT DOES. It injects context and nothing else — it emits no permissionDecision
 * at all, so it can never block, prompt, or alter a call. The reason is that the
 * decision isn't the hook's to make, and isn't the user's either: whether this
 * session holds tacit knowledge a fresh spawn would lose (why the code is shaped
 * this way, what was tried and rejected) is visible only to the main agent. A
 * permission prompt would put that question to the person least able to answer it,
 * who sees only a hex id and a number — a ceremony to click through, which is the
 * shape of thing this skill removes elsewhere rather than adds.
 *
 * What the main agent lacks is not judgment but a fact: its context contains no
 * count of how many times it has resumed a given session, which is part of why the
 * reflex runs unchecked. So the hook supplies the count at the moment of decision;
 * the rule in review-protocol.md supplies the criterion; the main agent decides. If
 * it resumes anyway at #25, that is either a reason the hook cannot see, or a
 * misjudgment a blocking gate would not have improved.
 *
 * The reviewer sessions are deliberately NOT exempt. A long reviewer session is
 * exactly what the convergence fuse treats as suspect, and its corpus is re-read
 * from disk cheaply. The threshold is set high enough (25) that a normal review
 * loop — which converges in a handful of rounds — never reaches it.
 *
 * FAIL-OPEN: no transcript, a parse error, an unexpected shape, or a SendMessage
 * with no `to` -> allow. A checkpoint that blocks the flow on its own bugs would
 * cost more than the problem it guards.
 *
 * Stateless & side-effect-free: reads stdin + the transcript (read-only), writes
 * NOTHING anywhere. Cross-platform pure Node (Claude Code ships Node).
 */

'use strict';
const fs = require('fs');

// Resume counts at which the checkpoint speaks. Both are round counts on ONE
// executor session — not session age, not tokens: rounds are what accumulate
// self-referential context, and they are what the transcript can count exactly.
// FIRM is not a harder enforcement than SOFT, only a more direct message.
const FIRM_AT = 25;
const SOFT_AT = 15;

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
if (!target) allow(); // not a subagent resume we can attribute — e.g. a peer-session message

const transcriptPath = input && input.transcript_path;
if (!transcriptPath) allow();

// ---- count prior SendMessage calls addressed to this same target ----
let rounds = 0;
try {
  const lines = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    // Cheap pre-filter before parsing: most lines are not SendMessage calls.
    if (!line || line.indexOf('SendMessage') === -1) continue;
    let obj;
    try { obj = JSON.parse(line); } catch (_) { continue; }
    if (!obj || obj.isSidechain) continue; // subagent's own transcript, not our dispatches
    const content = obj.message && obj.message.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type !== 'tool_use' || b.name !== 'SendMessage') continue;
      const to = b.input && typeof b.input.to === 'string' ? b.input.to.trim() : '';
      if (to && to === target) rounds++;
    }
  }
} catch (_) { allow(); }

// `rounds` counts resumes ALREADY sent; this call would be the next one.
const next = rounds + 1;

if (next >= FIRM_AT) {
  note(
    `[spec-driven-development] This is resume #${next} of executor session "${target}" — past the point ` +
    `where the session should normally be retired (review-protocol.md, "Retire a session that has outlived ` +
    `its asset"). Its context is now largely a record of its own earlier reasoning rather than the task in ` +
    `front of it, and a cheaper-tier executor loses the thread in that — the same anchoring the convergence ` +
    `fuse guards against by spawning fresh eyes at Round 5.
` +
    `Continue only if you can name what this session gives THIS dispatch that a fresh spawn would lose: ` +
    `tacit knowledge that exists nowhere on disk (why the code is shaped this way, what was tried and ` +
    `rejected). "Same feature" / "still this cycle" / "already warmed up" are topic continuity, not an asset. ` +
    `Otherwise spawn fresh and hand it the current artifact state plus review-log §1 — the same rebuild the ` +
    `resume-failure fallback already uses.`
  );
}

if (next === SOFT_AT) {
  note(
    `[spec-driven-development] Executor session "${target}" is at resume #${next}. ` +
    `Its context is starting to be dominated by its own history rather than the current task. ` +
    `Nothing to do now — but on the next dispatch, check whether you can still name a real asset ` +
    `(tacit knowledge, or a corpus this dispatch re-reads) rather than resuming by reflex. ` +
    `Mechanical work — applying a stated fix to named files — needs no history and is cleaner on a fresh spawn.`
  );
}

allow();
