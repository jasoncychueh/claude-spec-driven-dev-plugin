'use strict';
/*
 * spec-driven-development — shared hook I/O.
 *
 * PreToolUse hooks read one JSON object from stdin and answer with one JSON object on
 * stdout. Every hook in this plugin is fail-open, so the helpers here are deliberately
 * tiny: parse the input or return null, and emit a decision and exit.
 *
 * An explicit permissionDecision:"allow" overrides the user's own permission rules and silently
 * approves a tool call they would have asked about, so a pass-through is never one: allow() exits 0
 * with no output and the harness falls back to those rules. A hook that only informs writes context
 * for the model (note) and no decision at all. The decisions a hook writes are a DENY and, in
 * exactly one place, approveVerified().
 */
const fs = require('fs');

// Parse the hook input from stdin; null when it is missing or not JSON (callers fail open).
function readInput() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) { return null; }
}

function emit(decision, reason) {
  const out = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision } };
  if (reason) out.hookSpecificOutput.permissionDecisionReason = reason;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const allow = () => process.exit(0); // pass through: no output, the user's own permission rules decide
const deny = (reason) => emit('deny', reason);

/*
 * The single deliberate explicit allow in this plugin. Only briefing-checkpoint.js calls it, on
 * ExitPlanMode, and only after it has verified a genuine user reply following the briefing. The
 * user has just answered the briefing, so letting the plan dialog pass at that point is the
 * behaviour they rely on. A deny from any other hook still wins over this allow. Every other pass
 * in every hook (fail-open, uncertainty, not applicable) stays silent through allow(); do not use
 * this helper anywhere else and do not generalise it into a generic allow.
 */
const approveVerified = () => emit('allow');

// Context for the model and no decision: the call in flight proceeds under the user's own permission rules.
function note(text) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } }));
  process.exit(0);
}

module.exports = { readInput, allow, deny, approveVerified, note };
