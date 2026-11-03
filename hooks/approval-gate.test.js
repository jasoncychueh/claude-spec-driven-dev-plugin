'use strict';
/*
 * Regression tests for approval-gate.js.
 *
 * Spawns the REAL hook against synthetic transcripts built from VERIFIED entry shapes
 * (observed in actual Claude Code transcripts): every content block is its own entry, a tool
 * result is a later user entry with the same tool_use_id, an approved ExitPlanMode result is a
 * non-error "User has approved your plan…", a rejected one is an is_error result "The user
 * doesn't want to proceed with this tool use…", and a prompt the user typed while the agent was
 * working is an attachment entry (queued_command, origin human). No test framework — run with
 * plain Node:
 *   node hooks/approval-gate.test.js          (or:  node --test hooks/)
 *
 * Guards the gate's two evidence kinds (an approved ExitPlanMode; an approve.mjs call made as the
 * first action after a human reply to a briefing), their invalidation by a later plan-mode entry,
 * that the gate looks at nothing in the dispatch prompt, that nothing but spec-implementer /
 * spec-tester is gated, and that anything the hook cannot judge falls open.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'approval-gate.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-gate-test-'));

// --- entry builders ---
const aText = (t) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: t }] } });
const uText = (t) => ({ type: 'user', origin: { kind: 'human' }, message: { role: 'user', content: t } });
const uMeta = (t) => ({ type: 'user', isMeta: true, message: { role: 'user', content: t } });
const uNotice = (t) => ({ type: 'user', origin: { kind: 'task-notification' }, message: { role: 'user', content: t } });
const uMode = (t, pm) => ({ type: 'user', origin: { kind: 'human' }, permissionMode: pm, message: { role: 'user', content: t } }); // a human message carrying its own permissionMode
const uBlocks = (t) => ({ type: 'user', origin: { kind: 'human' }, message: { role: 'user', content: [{ type: 'text', text: t }] } });   // text-block form
// A prompt the user typed while the agent's turn was running (verified shape: an attachment entry).
const queued = (t, over) => ({ type: 'attachment', isSidechain: false, attachment: Object.assign({ type: 'queued_command', prompt: t, commandMode: 'prompt', origin: { kind: 'human' } }, over || {}) });
// A stored API payload: type api-request-blob, message.role says user / assistant. Real transcripts
// hold a user-role blob with the human's text just before each human entry, and blobs that replay
// old assistant text or tool calls. None of it is the conversation.
const blob = (role, content) => ({ type: 'api-request-blob', hash: 'h', message: { role, content } });
const blobUser = (t) => blob('user', [{ type: 'text', text: t }]);
const blobAssistantText = (t) => blob('assistant', [{ type: 'text', text: t }]);
const blobTool = (name, id, input) => blob('assistant', [{ type: 'tool_use', name, id, input: input || {} }]);
const toolUse = (name, id, input) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name, id, input: input || {} }] } });
const toolResult = (id, text, isError) => {
  const b = { type: 'tool_result', tool_use_id: id, content: text };
  if (isError) b.is_error = true;
  return { type: 'user', message: { role: 'user', content: [b] } };
};
// A compaction summary: written as a user entry with isCompactSummary and no isMeta / origin.
const compactSummary = () => ({ type: 'user', isCompactSummary: true, message: { role: 'user', content: 'This session is being continued from a previous conversation that ran out of context. Summary: ...' } });
const enterDeclined = (id) => toolResult(id, "The user doesn't want to proceed with this tool use. The tool use was rejected.", true);
const toolSearch = () => toolUse('ToolSearch', 'ts', {});
const enterPlan = () => toolUse('EnterPlanMode', 'enter', {});
const exitPlan = (id) => toolUse('ExitPlanMode', id, { plan: 'do the thing' });
const exitApproved = (id) => toolResult(id, 'User has approved your plan. You can now start coding. Start with updating your todo list if applicable', false);
const exitApprovedBig = (id) => toolResult(id, '<persisted-output>\nOutput too large (53.7KB). Full output saved to: C:\\x.txt', false);
const exitRejected = (id) => toolResult(id, "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.", true);
const exitHookDenied = (id) => toolResult(id, 'PreToolUse:ExitPlanMode hook error: Before exiting plan mode, deliver a Plan Briefing first', true);
const approveCmd = (label) => `node "C:/Users/someone/.claude/plugins/spec-driven-development/scripts/approve.mjs" ${label}`;
const approve = (id, label) => toolUse('Bash', id || 'a1', { command: approveCmd(label || 'feat-x') });
const approveOk = (id, label) => toolResult(id || 'a1', `Recorded: the user approved "${label || 'feat-x'}".`, false);
const approveBad = (id) => toolResult(id || 'a1', 'Usage: node approve.mjs <label>', true);

let seq = 0;
function run(entries, toolInput, extra) {
  const f = path.join(tmpDir, 'tr-' + (seq++) + '.jsonl');
  fs.writeFileSync(f, typeof entries === 'string' ? entries : entries.map((e) => JSON.stringify(e)).join('\n'));
  const input = Object.assign({
    transcript_path: f,
    tool_name: 'Agent',
    tool_input: toolInput || IMPL,
  }, extra || {});
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });
  return decide(r);
}
// A pass is exit 0 with NO output (an explicit "allow" would override the user's own permission
// rules); only a deny writes JSON.
function decide(r) {
  if (r.status === 0 && !r.stdout && !r.stderr) return { d: 'allow', reason: '' };
  try {
    const o = JSON.parse(r.stdout).hookSpecificOutput;
    if (r.status === 0 && o.permissionDecision === 'deny') return { d: 'deny', reason: o.permissionDecisionReason || '' };
  } catch (e) { /* fall through */ }
  return { d: 'ERR(' + r.status + '|' + (r.stdout || '') + '|' + (r.stderr || '') + ')', reason: '' };
}

const IMPL = { subagent_type: 'spec-driven-development:spec-implementer', prompt: 'Implement feature feat-x, tasks 1-4' };
const TESTER = { subagent_type: 'spec-driven-development:spec-tester', prompt: 'Write the tests for feat-x, cases T1-T6' };
const briefed = [uText('/create-spec feat-x'), aText('Plan Briefing: ...walks the scenario... anything that does not match?'), uText('looks good, go')];
const approvedSpec = [...briefed, approve('a1'), approveOk('a1')];

const cases = [
  // ---- what is gated ----
  ['unrelated subagent is allowed with no evidence', [uText('hi')], { subagent_type: 'spec-driven-development:spec-author', prompt: 'x' }, null, 'allow'],
  ['general-purpose / Explore allowed with no evidence', [uText('hi')], { subagent_type: 'Explore', prompt: 'find x' }, null, 'allow'],
  ['implementer with no evidence is denied', [uText('/implement feat-x'), aText('Condensed briefing...')], IMPL, null, 'deny'],
  ['bare-name implementer is denied too', [uText('hi')], { subagent_type: 'spec-implementer', prompt: 'feat-x' }, null, 'deny'],
  ['tester with no evidence is denied', [uText('hi')], TESTER, null, 'deny'],
  ['a call from inside a subagent is not addressed', [uText('hi')], IMPL, { agent_id: 'abc123' }, 'allow'],
  ['a tool_input without a prompt is judged by the transcript alone', [uText('hi')], { subagent_type: 'spec-implementer' }, null, 'deny'],

  // ---- (1) an approved ExitPlanMode ----
  ['ExitPlanMode: approved is evidence', [
    uText('fix the bug'), enterPlan(), aText('Briefing...'), uText('ok'), exitPlan('e1'), exitApproved('e1'),
  ], IMPL, null, 'allow'],

  ['ExitPlanMode: approved also releases the tester', [
    uText('fix the bug'), enterPlan(), aText('Briefing...'), uText('ok'), exitPlan('e1'), exitApproved('e1'),
  ], TESTER, null, 'allow'],

  ['ExitPlanMode: approved with a large (persisted-output) result is evidence', [
    uText('fix the bug'), enterPlan(), exitPlan('e1'), exitApprovedBig('e1'),
  ], IMPL, null, 'allow'],

  ['ExitPlanMode: rejected is not evidence', [
    uText('fix the bug'), enterPlan(), aText('Briefing...'), uText('ok'), exitPlan('e1'), exitRejected('e1'),
  ], IMPL, null, 'deny'],

  ['ExitPlanMode: a call our briefing hook denied is not evidence', [
    uText('fix the bug'), enterPlan(), exitPlan('e1'), exitHookDenied('e1'),
  ], IMPL, null, 'deny'],

  ['ExitPlanMode: no result yet is not evidence', [
    uText('fix the bug'), enterPlan(), exitPlan('e1'),
  ], IMPL, null, 'deny'],

  ['ExitPlanMode: approved, then EnterPlanMode voids it', [
    uText('fix the bug'), enterPlan(), exitPlan('e1'), exitApproved('e1'),
    aText('implemented'), uText('now also fix Y'), enterPlan(), aText('plan for Y'),
  ], IMPL, null, 'deny'],

  ['ExitPlanMode: approved, new cycle approved again -> allow', [
    uText('fix the bug'), enterPlan(), exitPlan('e1'), exitApproved('e1'),
    uText('now also fix Y'), enterPlan(), exitPlan('e2'), exitApproved('e2'),
  ], IMPL, null, 'allow'],

  ['ExitPlanMode: approved, a later exit rejected -> the earlier approval still stands until plan mode is re-entered', [
    uText('fix the bug'), enterPlan(), exitPlan('e1'), exitApproved('e1'),
    uText('more'), exitPlan('e2'), exitRejected('e2'),
  ], IMPL, null, 'allow'],

  ['ExitPlanMode: a subagent (sidechain) ExitPlanMode is not the main conversation', [
    uText('fix the bug'),
    Object.assign(exitPlan('e1'), { isSidechain: true }), Object.assign(exitApproved('e1'), { isSidechain: true }),
  ], IMPL, null, 'deny'],

  // ---- (2) approve.mjs after a briefing and a human reply ----
  ['approve: call as the first action after a human reply to a briefing is evidence', [
    ...briefed, approve('a1'), approveOk('a1'),
  ], IMPL, null, 'allow'],

  ['approve: the tester is released by the same approval', [
    ...approvedSpec,
  ], TESTER, null, 'allow'],

  ['approve: mechanical tool turns between the reply and the call are skipped', [
    ...briefed, toolSearch(), toolResult('ts', 'ok'), uMeta('<reminder>'), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'allow'],

  ['approve: call issued in the same message as the dispatch (no result yet) is evidence', [
    ...briefed, approve('a1'),
  ], IMPL, null, 'allow'],

  ['approve: PowerShell form of the call', [
    ...briefed, toolUse('PowerShell', 'a1', { command: '& node "C:\\Users\\someone\\.claude\\plugins\\spec-driven-development\\scripts\\approve.mjs" feat-x' }), approveOk('a1'),
  ], IMPL, null, 'allow'],

  ['approve: a quoted label with spaces', [
    ...briefed, toolUse('Bash', 'a1', { command: 'node "C:/p q/scripts/approve.mjs" "fix the null profile"' }),
  ], IMPL, null, 'allow'],

  ['approve: a plan path as the label', [
    ...briefed, approve('a1', 'C:/Users/someone/.claude/plans/fix-null-profile.md'),
  ], IMPL, null, 'allow'],

  ['approve: the label is not matched against the dispatch prompt', [
    ...briefed, approve('a1', 'something-unrelated'),
  ], { subagent_type: 'spec-implementer', prompt: 'Design basis: .spec/specs/other-feature/design.md; plan C:\\x\\y.md' }, null, 'allow'],

  ['approve: the dispatch prompt is not inspected at all (empty prompt)', [
    ...briefed, approve('a1'),
  ], { subagent_type: 'spec-implementer', prompt: '' }, null, 'allow'],

  ['approve: call right after the briefing text, with no user reply, is denied', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['approve: call with nothing at all before it is denied', [
    approve('a1'),
  ], IMPL, null, 'deny'],

  ['approve: a task-notification user entry is not a human reply', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'), uNotice('<task-notification>done</task-notification>'),
    approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['approve: a call whose own result was an error is not evidence', [
    ...briefed, approve('a1'), approveBad('a1'),
  ], IMPL, null, 'deny'],

  ['approve: a call with no label is not evidence', [
    ...briefed, toolUse('Bash', 'a1', { command: 'node "C:/p/scripts/approve.mjs"' }),
  ], IMPL, null, 'deny'],

  ['approve: entries from a subagent (sidechain) are not evidence', [
    ...briefed, Object.assign(approve('a1'), { isSidechain: true }),
  ], IMPL, null, 'deny'],

  ['approve: a command that merely mentions approve.mjs is not a call to it', [
    ...briefed, toolUse('Bash', 'a1', { command: 'cat scripts/approve.mjs' }),
  ], IMPL, null, 'deny'],

  ['approve: call after two agent texts and no human reply is denied (the call is not preceded by a human message)', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'), aText('Anything that does not match?'), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['approve: a compaction summary is not a human reply', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'), compactSummary(), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['approve: a compaction summary as the first message is not a reply to a briefing', [
    compactSummary(), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['approve: a non-shell tool whose input has a command field is not evidence (Write)', [
    ...briefed, toolUse('Write', 'a1', { command: approveCmd('feat-x') }), toolResult('a1', 'ok'),
  ], IMPL, null, 'deny'],

  ['approve: a non-shell tool whose input has a command field is not evidence (MCP tool)', [
    ...briefed, toolUse('mcp__x__run', 'a1', { command: approveCmd('feat-x') }), toolResult('a1', 'ok'),
  ], IMPL, null, 'deny'],

  // The call must really run: `node … approve.mjs <label>` starts a command; text that merely mentions it does not count.
  ...[
    ['inside double quotes (echo)', 'echo "node a/approve.mjs foo"'],
    ['inside single quotes (echo)', "echo 'node scripts/approve.mjs foo'"],
    ['after a hash (comment)', '# node scripts/approve.mjs foo'],
    ['after a separator that sits inside a comment', 'echo hi # ; node scripts/approve.mjs foo'],
    ['after a separator that sits inside double quotes', 'echo "x; node scripts/approve.mjs foo"'],
    ['after a separator that sits inside single quotes', "echo 'x && node scripts/approve.mjs foo'"],
    ['a comment line after another command', 'ls\n# node scripts/approve.mjs foo'],
    ['behind a literal false &&', 'false && node scripts/approve.mjs foo'],
    ['behind a literal true ||', 'true || node scripts/approve.mjs foo'],
    ['as the target of a pipe', 'echo hi | node scripts/approve.mjs foo'],
    ['as an argument of another command', 'git log -- node scripts/approve.mjs foo'],
    ['after quoted text on an earlier segment', 'echo "x"; echo "node scripts/approve.mjs foo"'],
    ['another script that merely takes approve.mjs as an argument', 'node other.js scripts/approve.mjs foo'],
    ['no label before the end of the line (the next line is not the label)', 'node scripts/approve.mjs\nls'],
    ['no label before a semicolon', 'node scripts/approve.mjs; ls foo'],
    ['no label before &&', 'node scripts/approve.mjs && echo foo'],
    ['no label before a pipe', 'node scripts/approve.mjs | cat foo'],
    ['an empty quoted label', 'node scripts/approve.mjs ""'],
  ].map(([what, command]) => [`approve: ${what} is not a call`, [
    ...briefed, toolUse('Bash', 'a1', { command }), approveOk('a1'),
  ], IMPL, null, 'deny']),

  ...[
    ['after cd &&', 'cd /repo && node scripts/approve.mjs foo'],
    ['after a semicolon', 'cd /repo; node scripts/approve.mjs foo'],
    ['on a later line', 'echo recording\nnode scripts/approve.mjs foo'],
    ['after false ||', 'false || node scripts/approve.mjs foo'],
    ['after true &&', 'true && node scripts/approve.mjs foo'],
    ['with a quoted Windows script path', 'node "C:\\Users\\someone\\scripts\\approve.mjs" foo'],
    ['with a single-quoted script path', "node 'C:/p q/scripts/approve.mjs' foo"],
    ['with node.exe', 'node.exe "C:/x/approve.mjs" foo'],
    ['with a quoted node.exe path and the PowerShell call operator', '& "C:\\Program Files\\nodejs\\node.exe" "C:\\x\\approve.mjs" foo'],
    ['with the PowerShell call operator', '& node "C:\\x\\approve.mjs" foo'],
    ['with a flag before the script', 'node --no-warnings scripts/approve.mjs foo'],
    ['with a flag that takes a value before the script', 'node --import ./hook.mjs scripts/approve.mjs foo'],
    ['with a label followed by &&', 'node scripts/approve.mjs foo && echo done'],
    ['with a label followed by a semicolon', 'node scripts/approve.mjs foo; ls'],
    ['with a quoted label followed by a pipe', 'node scripts/approve.mjs "fix it" | cat'],
    ['with a label followed by a comment', 'node scripts/approve.mjs foo # recorded'],
    ['with a label followed by a redirect', 'node scripts/approve.mjs foo > out.txt 2>&1'],
    ['with leading whitespace', '  node scripts/approve.mjs foo'],
  ].map(([what, command]) => [`approve: ${what} is a call`, [
    ...briefed, toolUse('Bash', 'a1', { command }), approveOk('a1'),
  ], IMPL, null, 'allow']),

  ['approve: an earlier approval keeps standing for later dispatches', [
    ...approvedSpec,
    aText('dispatching'), uText('also continue with phase 2'), aText('phase 2 done'), uText('next'),
  ], IMPL, null, 'allow'],

  // ---- (2) needs the briefing before the human reply, and the call as the first action ----
  ['approve: "/implement feat-x" straight into approve (no briefing before the human message) is denied', [
    uText('/implement feat-x'), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['approve: /implement, condensed briefing, user confirms, approve -> allowed', [
    uText('/implement feat-x'), aText('Condensed briefing: positioning, one walk-through, scope...'), uText('yes, go'),
    approve('a1'), approveOk('a1'),
  ], IMPL, null, 'allow'],

  ['approve: a tool-only assistant turn (no text) before the human message is not a briefing', [
    toolSearch(), toolResult('ts', 'ok'), uText('go'), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['approve: tool turns after the first human message, then a second human message, are not a briefing', [
    uText('/implement feat-x'), toolUse('Read', 'r1', { file_path: 'x' }), toolResult('r1', 'file'), uText('go'),
    approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['approve: agent text between the reply and the call (acknowledgement) is denied', [
    ...briefed, aText('Got it, recording the approval.'), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  // ---- manual plan-mode exit (shift+tab): no ExitPlanMode result, the reply carries a non-plan mode ----
  ['manual exit: EnterPlanMode, briefing, reply typed outside plan mode, approve -> allowed', [
    uMode('fix the bug', 'default'), enterPlan(), aText('Briefing: ...'), uMode('ok, go', 'default'), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'allow'],

  ['manual exit: the same flow without the approve call is denied', [
    uMode('fix the bug', 'default'), enterPlan(), aText('Briefing: ...'), uMode('ok, go', 'default'),
  ], IMPL, null, 'deny'],

  ['manual exit: reply typed while still in plan mode, approve -> allowed', [
    uMode('fix the bug', 'plan'), aText('Briefing: ...'), uMode('ok, go', 'plan'), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'allow'],

  // ---- invalidation by a later plan-mode entry ----
  ['void: approve, then a later EnterPlanMode -> denied', [
    ...approvedSpec, aText('done'), uText('another thing'), enterPlan(), aText('plan'),
  ], IMPL, null, 'deny'],

  ['void: approve, then a manual re-entry (permissionMode moves into plan) -> denied', [
    uMode('/create-spec feat-x', 'default'), aText('Plan Briefing: ...'), uMode('go', 'default'), approve('a1'), approveOk('a1'),
    aText('done'), uMode('one more thing', 'plan'), aText('plan for it'),
  ], IMPL, null, 'deny'],

  ['void: approve, re-entry, then a new briefing-reply-approve -> allowed', [
    uMode('/create-spec feat-x', 'default'), aText('Plan Briefing: ...'), uMode('go', 'default'), approve('a1'), approveOk('a1'),
    aText('done'), uMode('one more thing', 'plan'), aText('Briefing for the new thing'), uMode('ok', 'default'), approve('a2', 'thing-2'), approveOk('a2', 'thing-2'),
  ], IMPL, null, 'allow'],

  ['void: a declined EnterPlanMode (error result) does not void the approval', [
    ...approvedSpec, aText('done'), uText('another thing'), toolUse('EnterPlanMode', 'en2', {}), enterDeclined('en2'),
  ], IMPL, null, 'allow'],

  ['void: a declined EnterPlanMode does not put the session into plan, so a later plan-mode message still voids', [
    ...approvedSpec, aText('done'), uText('another thing'), toolUse('EnterPlanMode', 'en2', {}), enterDeclined('en2'),
    aText('ok, staying out'), uMode('plan this after all', 'plan'),
  ], IMPL, null, 'deny'],

  ['void: an EnterPlanMode that was accepted voids the approval', [
    ...approvedSpec, aText('done'), uText('another thing'), toolUse('EnterPlanMode', 'en2', {}), toolResult('en2', 'Entered plan mode.', false),
  ], IMPL, null, 'deny'],

  ['void: approve in default mode, EnterPlanMode and a default-mode reply, approve, then a later plan-mode message voids again', [
    uMode('fix the bug', 'default'), enterPlan(), aText('Briefing: ...'), uMode('ok, go', 'default'), approve('a1'), approveOk('a1'),
    aText('implemented'), uMode('now the next thing', 'plan'), aText('plan for it'),
  ], IMPL, null, 'deny'],

  ['void: approve, EnterPlanMode, then an approved ExitPlanMode -> allowed', [
    ...approvedSpec, uText('again'), enterPlan(), exitPlan('e1'), exitApproved('e1'),
  ], IMPL, null, 'allow'],

  ['void: approved ExitPlanMode, then a manual re-entry (permissionMode) -> denied', [
    uMode('fix the bug', 'plan'), aText('Briefing...'), uMode('ok', 'plan'), exitPlan('e1'), exitApproved('e1'),
    aText('implemented'), uMode('now also fix Y', 'default'), aText('done'), uMode('one more thing', 'plan'), aText('plan for it'),
  ], IMPL, null, 'deny'],

  ['void: ... and a fresh approved exit after the re-entry releases it again', [
    uMode('fix the bug', 'plan'), exitPlan('e1'), exitApproved('e1'),
    uMode('one more thing', 'default'), uMode('and replan', 'plan'), exitPlan('e2'), exitApproved('e2'),
  ], IMPL, null, 'allow'],

  ['void: messages typed while still in the plan session (permissionMode plan) before the exit do not void it', [
    uMode('fix the bug', 'plan'), aText('Briefing...'), uMode('ok', 'plan'), exitPlan('e1'), exitApproved('e1'),
    aText('implementing'), uMode('thanks', 'acceptEdits'),
  ], IMPL, null, 'allow'],

  ['void: a plan-mode message in a subagent (sidechain) is not a re-entry', [
    ...approvedSpec, Object.assign(uMode('x', 'plan'), { isSidechain: true }),
  ], IMPL, null, 'allow'],

  ['void: a plan-mode marker inside a blob is not a re-entry', [
    ...approvedSpec, Object.assign(blob('user', [{ type: 'text', text: 'x' }]), { permissionMode: 'plan' }),
  ], IMPL, null, 'allow'],

  ['void: an EnterPlanMode inside a blob does not void an approval', [
    ...approvedSpec, blobTool('EnterPlanMode', 'enter2', {}),
  ], IMPL, null, 'allow'],

  // ---- a prompt queued while the agent was working is a human reply ----
  ['queued: a queued prompt is the reply -> approve is allowed', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'), queued('looks good, go'), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'allow'],

  ['queued: reply in the middle of the briefing turn\'s tool work, then approve -> allowed', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'), toolUse('Read', 'r1', { file_path: 'x' }), queued('go'), toolResult('r1', 'file'), approve('a1'),
  ], IMPL, null, 'allow'],

  ['queued: a queued prompt with no briefing before it is not a reply to anything', [
    queued('go'), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['queued: a queued slash command is not a reply', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'), queued('/effort high'), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['queued: a queued task notification is not a reply', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'),
    queued('<task-notification>done</task-notification>', { commandMode: 'task-notification', origin: undefined }), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['queued: a queued prompt of another command mode (human origin) is not a reply', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'),
    queued('<task-notification>done</task-notification>', { commandMode: 'task-notification' }), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['queued: a queued prompt from a peer session is not a reply', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'),
    queued('<cross-session-message>hi</cross-session-message>', { origin: { kind: 'peer' } }), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['queued: a queued prompt in a subagent (sidechain) is not a reply', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'), Object.assign(queued('go'), { isSidechain: true }), approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['queued: an attachment of another kind is not a reply', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'), { type: 'attachment', attachment: { type: 'hook_success', prompt: 'go' } }, approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  // ---- stored API payloads (type api-request-blob) are not messages ----
  ['blob: a user-role blob written just before the human entry does not break the normal flow', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'), blobUser('looks good, go'), uText('looks good, go'),
    approve('a1'), approveOk('a1'),
  ], IMPL, null, 'allow'],

  ['blob: an assistant-text blob replaying the briefing AFTER the reply does not void the evidence', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'), blobUser('looks good, go'), uText('looks good, go'),
    blobAssistantText('Plan Briefing: ...'), blobUser('looks good, go'),
    approve('a1'), approveOk('a1'),
  ], IMPL, null, 'allow'],

  ['blob: blobs between the reply and the call, and an assistant-text blob before the briefing, are all ignored', [
    uText('/create-spec feat-x'), blobAssistantText('stale text'), aText('Plan Briefing: ...'), blobUser('go'), uText('go'),
    blobUser('go'), blobAssistantText('Plan Briefing: ...'), approve('a1'),
  ], IMPL, null, 'allow'],

  ['blob: a user-role blob is not a human reply', [
    uText('/create-spec feat-x'), aText('Plan Briefing: ...'), blobUser('looks good, go'),
    approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['blob: an assistant-text blob is not a briefing', [
    uText('/create-spec feat-x'), blobAssistantText('Plan Briefing: ...'), uText('go'),
    approve('a1'), approveOk('a1'),
  ], IMPL, null, 'deny'],

  ['blob: an approve call that only exists inside a blob is not evidence', [
    ...briefed, blobTool('Bash', 'a1', { command: approveCmd('feat-x') }), blob('user', [{ type: 'tool_result', tool_use_id: 'a1', content: 'Recorded' }]),
  ], IMPL, null, 'deny'],

  ['blob: a blob replaying an old approve call after a fresh reply does not stand in for a real call', [
    ...approvedSpec, aText('phase done'), uMode('and now more', 'plan'), blobTool('Bash', 'a2', { command: approveCmd('feat-y') }),
  ], IMPL, null, 'deny'],

  ['blob: an approved ExitPlanMode that only exists inside a blob is not evidence', [
    uText('fix the bug'), enterPlan(), blobTool('ExitPlanMode', 'e1', { plan: 'x' }),
    blob('user', [{ type: 'tool_result', tool_use_id: 'e1', content: 'User has approved your plan.' }]),
  ], IMPL, null, 'deny'],

  ['blob: a blob-only transcript is unrecognisable -> fail-open', [
    blobUser('hi'), blobAssistantText('hello'),
  ], IMPL, null, 'allow'],

  // ---- fail-open ----
  ['garbage transcript -> fail-open', 'this is not json\n{broken\n', IMPL, null, 'allow'],
  ['empty transcript -> fail-open', [], IMPL, null, 'allow'],
  ['transcript of unrecognisable entries only -> fail-open', [{ type: 'ai-title' }, { type: 'system' }], IMPL, null, 'allow'],
];

// ---- entries the human did not answer with are skipped: neither the reply nor a break in the walk ----
const NON_REPLIES = [
  ['slash command (<command-name> first)', () => uText('<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>')],
  ['slash command (<command-message> first)', () => uText('<command-message>x is running…</command-message>\n<command-name>/x</command-name>')],
  ['local-command stdout', () => uText('<local-command-stdout>Compacted</local-command-stdout>')],
  ['interrupt marker', () => uText('[Request interrupted by user]')],
  ['interrupt marker as a text block', () => uBlocks('[Request interrupted by user for tool use]')],
  ['queued slash command', () => queued('/effort high')],
];
for (const [kind, mk] of NON_REPLIES) {
  cases.push(
    [`non-reply (${kind}) right after the briefing is not a human reply`, [
      uText('/create-spec feat-x'), aText('Plan Briefing: ...'), mk(), approve('a1'), approveOk('a1'),
    ], IMPL, null, 'deny'],
    [`non-reply (${kind}) between the reply and the call is skipped`, [
      ...briefed, mk(), approve('a1'), approveOk('a1'),
    ], IMPL, null, 'allow'],
    [`non-reply (${kind}) between the briefing and the reply is skipped`, [
      uText('/create-spec feat-x'), aText('Plan Briefing: ...'), mk(), uText('looks good, go'), approve('a1'), approveOk('a1'),
    ], IMPL, null, 'allow'],
    [`non-reply (${kind}) as the first message is not a briefing's reply`, [
      mk(), approve('a1'), approveOk('a1'),
    ], IMPL, null, 'deny'],
  );
}

let pass = 0, fail = 0;
for (const [name, entries, toolInput, extra, expected] of cases) {
  const got = run(entries, toolInput, extra).d;
  const ok = got === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${name}]  expected=${expected} got=${got}`);
  ok ? pass++ : fail++;
}

// ---- inputs the hook cannot judge fall open ----
function runRaw(stdin) {
  const r = spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8' });
  return decide(r).d;
}
const raw = [
  ['stdin is not JSON -> fail-open', 'not json', 'allow'],
  ['no transcript_path -> fail-open', JSON.stringify({ tool_name: 'Agent', tool_input: IMPL }), 'allow'],
  ['unreadable transcript path -> fail-open', JSON.stringify({ transcript_path: path.join(tmpDir, 'missing.jsonl'), tool_name: 'Agent', tool_input: IMPL }), 'allow'],
  ['no tool_input -> fail-open', JSON.stringify({ transcript_path: path.join(tmpDir, 'missing.jsonl') }), 'allow'],
];
for (const [name, stdin, expected] of raw) {
  const got = runRaw(stdin);
  const ok = got === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${name}]  expected=${expected} got=${got}`);
  ok ? pass++ : fail++;
}

// ---- the label of a call: the word after the script, ending at the end of the line / ; / && / || / | ----
{
  const { approveLabel } = require('./approval-gate');
  const labels = [
    ['node a/approve.mjs foo', 'foo'],
    ['node a/approve.mjs foo\nls', 'foo'],
    ['node a/approve.mjs\nls', ''],
    ['node a/approve.mjs foo; ls', 'foo'],
    ['node a/approve.mjs foo && ls', 'foo'],
    ['node a/approve.mjs "a b" | cat', 'a b'],
    ["node a/approve.mjs 'fix: the thing' || true", 'fix: the thing'],
    ['node a/approve.mjs ; ls', ''],
    ['node a/approve.mjs foo bar', 'foo'],
    ['echo "node a/approve.mjs foo"', ''],
    ['echo x\nnode a/approve.mjs foo', 'foo'],
  ];
  for (const [cmd, want] of labels) {
    const got = approveLabel(cmd);
    const ok = got === want;
    console.log(`${ok ? 'PASS' : 'FAIL'}  [label of ${JSON.stringify(cmd)}]  expected=${JSON.stringify(want)} got=${JSON.stringify(got)}`);
    ok ? pass++ : fail++;
  }
}

// ---- an allow emits no output at all (an explicit "allow" would override the user's permission rules) ----
{
  const f = path.join(tmpDir, 'tr-silent.jsonl');
  fs.writeFileSync(f, [...briefed, approve('a1'), approveOk('a1')].map((e) => JSON.stringify(e)).join('\n'));
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ transcript_path: f, tool_name: 'Agent', tool_input: IMPL }), encoding: 'utf8' });
  const ok = r.status === 0 && r.stdout === '' && r.stderr === '';
  console.log(`${ok ? 'PASS' : 'FAIL'}  [allow emits no output]  status=${r.status} stdout=${JSON.stringify(r.stdout)}`);
  ok ? pass++ : fail++;
}

// ---- the deny reason is actionable ----
{
  const r = run([uText('hi')]);
  const ok = r.d === 'deny' && /approve\.mjs/.test(r.reason) && /<label>/.test(r.reason) && /ExitPlanMode/.test(r.reason) && /briefing/i.test(r.reason) && /shift\+tab/.test(r.reason);
  console.log(`${ok ? 'PASS' : 'FAIL'}  [deny reason names the script, the label argument, ExitPlanMode, shift+tab and the briefing]  reason=${r.reason.slice(0, 80)}...`);
  ok ? pass++ : fail++;
}

console.log(`\n${pass}/${pass + fail} passed`);
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
process.exit(fail ? 1 : 0);
