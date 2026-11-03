'use strict';
/*
 * Regression tests for briefing-checkpoint.js.
 *
 * Spawns the REAL hook against synthetic transcripts built from VERIFIED entry
 * shapes (observed in actual Claude Code transcripts). No test framework — run
 * with plain Node:  node hooks/briefing-checkpoint.test.js
 *
 * Guards the plan-session anchoring: a briefing+reply is required SINCE the
 * current plan mode was (re-)entered — whether the agent entered via the
 * EnterPlanMode tool or the user re-entered manually. The check must NOT leak
 * past that boundary to a stale reply from before a restart. (This is the bug
 * that returned after 1.6.6 dropped the manual-entry path; the test pins both
 * entry kinds.)
 *
 * ALSO guards against routine-marker false-blocks: a bare {type:"permission-mode",permissionMode:"plan"}
 * marker recurs at EVERY plan-mode turn boundary (not only on a manual re-entry),
 * so it must NOT act as a session boundary while already in plan — otherwise a
 * routine marker sitting between the user's reply and ExitPlanMode FALSE-BLOCKS
 * the compliant flow. Manual re-entry is now detected from the reliable signal
 * (a real user message's own permissionMode field, or a bare marker seen while
 * NOT already in plan).
 *
 * Output contract: a verified human reply after the briefing -> stdout is EXACTLY the explicit-allow
 * JSON (the plugin's single deliberate allow); every fail-open / uncertain case -> no output at all;
 * a skipped briefing -> the deny JSON.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'briefing-checkpoint.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'briefing-hook-test-'));

// --- entry builders (shapes verified against real transcripts) ---
const manualPlan = () => ({ type: 'permission-mode', permissionMode: 'plan', sessionId: 's' }); // user shift+tab into plan
const permNoise = (m) => ({ type: 'permission-mode', permissionMode: m, sessionId: 's' });      // normal / acceptEdits / bypassPermissions
const enterPlan = () => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'calling EnterPlanMode' }, { type: 'tool_use', name: 'EnterPlanMode', input: {} }] } });
const exitPlan = (id) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'ExitPlanMode', id: id || 'exit', input: { plan: 'do the thing' } }] } });
const toolSearch = () => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'ToolSearch', input: {} }] } });
const aText = (t) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: t }] } });
const uText = (t) => ({ type: 'user', message: { role: 'user', content: t } });
const uPlan = (t) => ({ type: 'user', permissionMode: 'plan', message: { role: 'user', content: t } });          // user reply typed while in plan mode
const uMode = (t, pm) => ({ type: 'user', permissionMode: pm, message: { role: 'user', content: t } });          // user reply carrying an explicit permissionMode
const uToolResult = () => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } });
const uApproved = (id) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id || 'exit', content: 'User has approved your plan. You can now start coding.' }] } }); // approval, correlated to an ExitPlanMode id -> closes the session
const uResult = (t, id) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id || 'other', content: t }] } }); // arbitrary tool output (e.g. a Read), NOT correlated to an exit
const uDenied = (id) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: 'PreToolUse:ExitPlanMode hook error: Before exiting plan mode, deliver a Plan Briefing first: output a use-case-driven summary as a turn-final message, end the turn, wait for the user to reply, and only then call ExitPlanMode.' }] } }); // our own deny, correlated to the exit it denied
const compactSummary = () => ({ type: 'user', isCompactSummary: true, message: { role: 'user', content: 'This session is being continued from a previous conversation that ran out of context. Summary: ...' } }); // no isMeta, no origin
const uMeta = (t) => ({ type: 'user', isMeta: true, message: { role: 'user', content: t } });
const noise = (type) => ({ type }); // ai-title / mode / system / attachment / queue-operation
// A prompt the user typed while the agent's turn was running (verified shape: an attachment entry).
const queued = (t, over) => ({ type: 'attachment', isSidechain: false, attachment: Object.assign({ type: 'queued_command', prompt: t, commandMode: 'prompt', origin: { kind: 'human' } }, over || {}) });
// A stored API payload: type api-request-blob, message.role says user / assistant. A user-role blob
// with the human's text is written just before each human entry, and blobs replay old assistant
// text and tool calls. None of it is the conversation.
const blob = (role, content) => ({ type: 'api-request-blob', hash: 'h', message: { role, content } });
const blobUser = (t) => blob('user', [{ type: 'text', text: t }]);
const blobAssistantText = (t) => blob('assistant', [{ type: 'text', text: t }]);
const blobTool = (name, id) => blob('assistant', [{ type: 'tool_use', name, id, input: {} }]);
const blobApproved = (id) => blob('user', [{ type: 'tool_result', tool_use_id: id, content: 'User has approved your plan. You can now start coding.' }]);

let seq = 0;
function run(entries) {
  const f = path.join(tmpDir, 'tr-' + (seq++) + '.jsonl');
  fs.writeFileSync(f, entries.map(e => JSON.stringify(e)).join('\n'));
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ transcript_path: f }), encoding: 'utf8' });
  return classifyResult(r);
}

// The single deliberate explicit allow: exactly this JSON, nothing else on stdout.
const ALLOW_JSON = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } });

// 'allow' = verified human reply -> exactly the explicit-allow JSON; 'pass' = silent (exit 0, no output,
// the user's own permission rules decide: fail-open / uncertainty); 'deny' = deny JSON.
function classifyResult(r) {
  if (r.status === 0 && r.stdout === ALLOW_JSON && !r.stderr) return 'allow';
  if (r.status === 0 && !r.stdout && !r.stderr) return 'pass';
  try {
    const o = JSON.parse(r.stdout).hookSpecificOutput;
    if (r.status === 0 && o.hookEventName === 'PreToolUse' && o.permissionDecision === 'deny' && o.permissionDecisionReason) return 'deny';
  } catch (e) { /* fall through */ }
  return 'ERR(' + r.status + '|' + (r.stdout || '') + '|' + (r.stderr || '') + ')';
}

const cases = [
  ['spec-driven: agent entry, briefed + user reply', [
    uText('fix this bug'), enterPlan(), permNoise('bypassPermissions'),
    noise('system'), aText('design review done'), aText('Briefing: this fix walks the scenario...'),
    uText('ok looks good'), toolSearch(), exitPlan(),
  ], 'allow'],

  ['spec-driven: briefing skipped (agent text then exit)', [
    uText('fix this bug'), enterPlan(), aText('here is my plan: ...'), exitPlan(),
  ], 'deny'],

  ['agent entry: no briefing, only mechanical since entry', [
    uText('fix this bug'), enterPlan(), toolSearch(), uToolResult(), exitPlan(),
  ], 'deny'],

  ['manual re-entry + agent re-orientation text, no reply', [
    aText('(pre-restart) previous progress'), uText('ok continue'),
    manualPlan(), aText('resuming the flow, about to exit plan mode'), exitPlan(),
  ], 'deny'],

  ['manual re-entry, briefed + user reply', [
    aText('(pre-restart) old content'), manualPlan(),
    aText('Condensed briefing: the resumed fix will...'), uText('good'), exitPlan(),
  ], 'allow'],

  ['manual entry + fresh user request inside plan', [
    manualPlan(), uText('plan this refactor for me'), toolSearch(), exitPlan(),
  ], 'allow'],

  ['ANCHOR: manual re-entry must not leak to a stale pre-restart reply', [
    aText('(pre-restart) briefing'), uText('ok'),
    manualPlan(), toolSearch(), exitPlan(),
  ], 'deny'],

  // never-deadlock: after a deny, the agent briefs turn-final, the user replies, the retry ALLOWs.
  // (Includes the first denied ExitPlanMode + its tool_result residue, which must not break recovery.)
  ['recovery round: deny -> brief -> reply -> retry allows', [
    aText('(pre-restart) old content'), manualPlan(),
    exitPlan(), uToolResult(),                 // 1st attempt denied; deny-reason returns as tool_result residue
    aText('Condensed briefing: resuming, here is the plan...'), uText('ok go'),
    toolSearch(), exitPlan(),                  // retry
  ], 'allow'],

  // agent-entry no-leak across sessions: a 2nd plan session with no briefing must DENY,
  // not leak back to the 1st session's reply (iterative re-planning in one conversation).
  ['agent re-plan: 2nd session w/o briefing must not leak to session #1 reply', [
    uText('fix X'), enterPlan(), aText('briefing #1'), uText('ok'), exitPlan(), // session #1: briefed, approved
    enterPlan(), toolSearch(), exitPlan(),                                       // session #2: no briefing
  ], 'deny'],

  ['noise permission-modes are not a plan boundary', [
    enterPlan(), aText('briefing...'), uText('ok'), permNoise('acceptEdits'), permNoise('normal'),
    toolSearch(), exitPlan(),
  ], 'allow'],

  ['meta + tool_result between reply and exit are skipped', [
    enterPlan(), aText('briefing...'), uText('ok'), uMeta('<reminder>'), uToolResult(),
    toolSearch(), exitPlan(),
  ], 'allow'],

  // ---- routine `permission-mode:plan` markers recur at plan-mode turn boundaries and
  //      must NOT act as a session boundary while already in plan. ----

  // agent-initiated session, briefed + user replied, but a routine marker sits between the
  // reply and the exit. A single backward walk hits the marker first and DENIES; must ALLOW.
  ['routine plan marker between reply and exit (agent session) must NOT block', [
    uText('plan X'), enterPlan(), aText('Briefing: walk the scenario...'), uPlan('ok looks good'),
    manualPlan(),                              // routine turn-boundary marker, plan already active
    toolSearch(), exitPlan(),
  ], 'allow'],

  // The user's exact report: brief turn-final -> reply -> (routine marker) -> exit.
  ['briefed turn-final, user replied, routine marker, then exit -> allow', [
    uText('fix this'), enterPlan(), aText('design review done'), aText('Briefing: ...'),
    uPlan('沒問題'), manualPlan(), exitPlan(),
  ], 'allow'],

  // Manual re-entry detected from the user message's OWN permissionMode transition
  // (bypassPermissions -> plan), with no EnterPlanMode and no bare marker: still anchored.
  ['manual re-entry via user-message pm transition, no reply after -> deny', [
    uMode('earlier non-plan reply', 'bypassPermissions'), aText('some agent work'),
    uPlan('resume the flow'), aText('resuming, about to exit plan mode'), exitPlan(),
  ], 'deny'],

  ['manual re-entry via user-message pm transition, briefed + replied -> allow', [
    uMode('earlier non-plan reply', 'bypassPermissions'),
    uPlan('resume the flow'), aText('Condensed briefing: ...'), uPlan('good'), exitPlan(),
  ], 'allow'],

  // ---- session-close model (approved exit) + fail-open boundary ----

  // an approved session, then a bare-marker (shift+tab) re-entry with NO briefing, and NO
  // intervening non-plan user message. Must NOT leak to the previous session's reply.
  // (Without a session-close signal inPlan would stay true across sessions; the approved exit closes it.)
  ['approved exit then unbriefed bare-marker re-entry must not leak to prior reply', [
    uText('plan X'), enterPlan(), aText('briefing #1'), uPlan('ok'), exitPlan('e1'), uApproved('e1'),
    manualPlan(),                              // shift+tab back into plan, no message typed
    toolSearch(), exitPlan('e2'),
  ], 'deny'],

  // Same shape, but this time the re-entry IS briefed + replied -> allow.
  ['approved exit then briefed bare-marker re-entry -> allow', [
    uText('plan X'), enterPlan(), aText('briefing #1'), uPlan('ok'), exitPlan('e1'), uApproved('e1'),
    manualPlan(), aText('Condensed briefing: ...'), uPlan('go'), exitPlan('e2'),
  ], 'allow'],

  // the approval signal is correlated by tool_use_id, so a benign tool_result (e.g. a Read of
  // this hook / its test) that merely ECHOES "approved your plan" must NOT close the session
  // and false-block a compliant briefed-then-replied flow.
  ['non-approval tool_result echoing the approval phrase must not close the session', [
    uText('plan X'), enterPlan(), aText('Briefing: ...'), uPlan('ok looks good'),
    uResult('file contents: ... User has approved your plan. You can now start coding ...', 'read-1'),
    manualPlan(), toolSearch(), exitPlan('e1'),
  ], 'allow'],

  // A DENIED exit must NOT close the session (its tool_result is the deny reason, not an
  // approval), so the recovery brief+reply that follows is still found -> allow. Guards
  // against the approved-close logic accidentally breaking the never-deadlock invariant.
  // The deny reason comes back as a tool_result CORRELATED to the denied exit's id, so only the
  // approval text tells it from an approval. A routine marker after the reply discriminates: were the
  // denied exit to close the session, the marker would open a new one after the reply and the
  // retry would find no human reply since (deny).
  ['denied exit does not close the session; recovery still allows', [
    uText('plan X'), enterPlan(), aText('Briefing: ...'), exitPlan('e1'),  // 1st attempt denied (no reply yet)
    uDenied('e1'),                                                          // the deny reason, correlated to the exit (not an approval)
    aText('re-briefing turn-final...'), uPlan('ok go'), manualPlan(), toolSearch(), exitPlan('e2'),
  ], 'allow'],

  // no identifiable plan session (entry scrolled off / compacted) + assistant text before
  // the exit. Documented behavior is fail-open ALLOW, not a boundary deny.
  ['no identifiable session + assistant text before exit -> fail-open, silent pass', [
    aText('some analysis text with no plan entry in view'), exitPlan(),
  ], 'pass'],


  // ---- stored API payloads (type api-request-blob) are not messages ----
  ['blob: a user-role blob written just before the human reply does not break the briefed flow', [
    uText('plan X'), enterPlan(), aText('Briefing: ...'), blobUser('ok'), uPlan('ok'), blobUser('ok'), toolSearch(), exitPlan(),
  ], 'allow'],

  ['blob: a user-role blob is not a human reply', [
    enterPlan(), aText('Briefing: ...'), blobUser('ok'), exitPlan(),
  ], 'deny'],

  ['blob: an assistant-text blob replaying the briefing after the reply does not void it', [
    enterPlan(), aText('Briefing: ...'), uPlan('ok'), blobAssistantText('Briefing: ...'), exitPlan(),
  ], 'allow'],

  ['blob: an assistant-text blob is not a briefing text the walk can stop at', [
    enterPlan(), blobAssistantText('Briefing: ...'), uPlan('ok'), exitPlan(),
  ], 'allow'],

  ['blob: an EnterPlanMode inside a blob does not open a new plan session', [
    enterPlan(), aText('Briefing: ...'), uPlan('ok'), blobTool('EnterPlanMode'), exitPlan(),
  ], 'allow'],

  ['blob: an approved exit that only exists inside a blob does not close the session', [
    uText('plan X'), enterPlan(), aText('Briefing: ...'), uPlan('ok'),
    blobTool('ExitPlanMode', 'e1'), blobApproved('e1'),
    manualPlan(), toolSearch(), exitPlan('e2'),
  ], 'allow'],

  // ---- entries that are not human replies are skipped (neither the reply nor a break) ----

  ['non-reply (slash command (<command-name> first)) right after the briefing is not a human reply', [
    enterPlan(), aText('Briefing: ...'), uText('<command-name>/clear</command-name><command-message>clear</command-message><command-args></command-args>'), exitPlan(),
  ], 'deny'],
  ['non-reply (slash command (<command-name> first)) after the reply is skipped', [
    enterPlan(), aText('Briefing: ...'), uPlan('ok'), uText('<command-name>/clear</command-name><command-message>clear</command-message><command-args></command-args>'), exitPlan(),
  ], 'allow'],
  ['non-reply (slash command (<command-name> first)) before the reply is skipped', [
    enterPlan(), aText('Briefing: ...'), uText('<command-name>/clear</command-name><command-message>clear</command-message><command-args></command-args>'), uPlan('ok'), exitPlan(),
  ], 'allow'],

  ['non-reply (slash command (<command-message> first)) right after the briefing is not a human reply', [
    enterPlan(), aText('Briefing: ...'), uText('<command-message>x is running…</command-message><command-name>/x</command-name>'), exitPlan(),
  ], 'deny'],
  ['non-reply (slash command (<command-message> first)) after the reply is skipped', [
    enterPlan(), aText('Briefing: ...'), uPlan('ok'), uText('<command-message>x is running…</command-message><command-name>/x</command-name>'), exitPlan(),
  ], 'allow'],
  ['non-reply (slash command (<command-message> first)) before the reply is skipped', [
    enterPlan(), aText('Briefing: ...'), uText('<command-message>x is running…</command-message><command-name>/x</command-name>'), uPlan('ok'), exitPlan(),
  ], 'allow'],

  ['non-reply (local-command stdout) right after the briefing is not a human reply', [
    enterPlan(), aText('Briefing: ...'), uText('<local-command-stdout>Compacted</local-command-stdout>'), exitPlan(),
  ], 'deny'],
  ['non-reply (local-command stdout) after the reply is skipped', [
    enterPlan(), aText('Briefing: ...'), uPlan('ok'), uText('<local-command-stdout>Compacted</local-command-stdout>'), exitPlan(),
  ], 'allow'],
  ['non-reply (local-command stdout) before the reply is skipped', [
    enterPlan(), aText('Briefing: ...'), uText('<local-command-stdout>Compacted</local-command-stdout>'), uPlan('ok'), exitPlan(),
  ], 'allow'],

  ['non-reply (interrupt marker) right after the briefing is not a human reply', [
    enterPlan(), aText('Briefing: ...'), uText('[Request interrupted by user]'), exitPlan(),
  ], 'deny'],
  ['non-reply (interrupt marker) after the reply is skipped', [
    enterPlan(), aText('Briefing: ...'), uPlan('ok'), uText('[Request interrupted by user]'), exitPlan(),
  ], 'allow'],
  ['non-reply (interrupt marker) before the reply is skipped', [
    enterPlan(), aText('Briefing: ...'), uText('[Request interrupted by user]'), uPlan('ok'), exitPlan(),
  ], 'allow'],

  ['non-reply (interrupt marker as a text block) right after the briefing is not a human reply', [
    enterPlan(), aText('Briefing: ...'), ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } }), exitPlan(),
  ], 'deny'],
  ['non-reply (interrupt marker as a text block) after the reply is skipped', [
    enterPlan(), aText('Briefing: ...'), uPlan('ok'), ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } }), exitPlan(),
  ], 'allow'],
  ['non-reply (interrupt marker as a text block) before the reply is skipped', [
    enterPlan(), aText('Briefing: ...'), ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } }), uPlan('ok'), exitPlan(),
  ], 'allow'],

  // a prompt typed while the agent's turn was running is an attachment entry (queued_command, origin human): a human reply
  ['queued: a queued human prompt after the briefing is the reply', [
    enterPlan(), aText('Briefing: ...'), queued('ok, go'), exitPlan(),
  ], 'allow'],
  ['queued: a queued prompt that arrived during the exit turn\'s tool work still counts', [
    enterPlan(), aText('Briefing: ...'), toolSearch(), queued('ok, go'), uToolResult(), exitPlan(),
  ], 'allow'],
  ['queued: a queued slash command is not a reply', [
    enterPlan(), aText('Briefing: ...'), queued('/effort high'), exitPlan(),
  ], 'deny'],
  ['queued: a queued task notification is not a reply', [
    enterPlan(), aText('Briefing: ...'), queued('<task-notification>done</task-notification>', { commandMode: 'task-notification', origin: undefined }), exitPlan(),
  ], 'deny'],
  ['queued: a queued prompt of another command mode (human origin) is not a reply', [
    enterPlan(), aText('Briefing: ...'), queued('<task-notification>done</task-notification>', { commandMode: 'task-notification' }), exitPlan(),
  ], 'deny'],
  ['queued: a queued prompt from another session (origin peer) is not a reply', [
    enterPlan(), aText('Briefing: ...'), queued('hello', { origin: { kind: 'peer' } }), exitPlan(),
  ], 'deny'],
  ['queued: a queued prompt from before the plan session is stale', [
    queued('earlier'), enterPlan(), aText('here is my plan: ...'), exitPlan(),
  ], 'deny'],

  // a compaction summary is written as a user entry (isCompactSummary, no isMeta, no origin) and is not a human reply
  ['a compaction summary after the briefing is not a human reply', [
    enterPlan(), aText('Briefing: ...'), compactSummary(), exitPlan(),
  ], 'deny'],
  ['a compaction summary after the reply is skipped', [
    enterPlan(), aText('Briefing: ...'), uPlan('ok'), compactSummary(), exitPlan(),
  ], 'allow'],

  ['empty transcript -> fail-open, silent pass', [], 'pass'],
];

let pass = 0, fail = 0;
for (const [name, entries, expected] of cases) {
  const got = run(entries);
  const ok = got === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${name}]  expected=${expected} got=${got}`);
  ok ? pass++ : fail++;
}
// ---- fail-open / uncertain inputs: silent pass, never an explicit allow ----
const garbage = path.join(tmpDir, 'garbage.jsonl');
fs.writeFileSync(garbage, 'this is not json\n{broken\n');
const rawCases = [
  ['stdin is not JSON -> silent pass', 'not json', 'pass'],
  ['stdin is empty -> silent pass', '', 'pass'],
  ['no transcript_path -> silent pass', JSON.stringify({ tool_name: 'ExitPlanMode' }), 'pass'],
  ['unreadable transcript path -> silent pass', JSON.stringify({ transcript_path: path.join(tmpDir, 'missing.jsonl') }), 'pass'],
  ['garbage transcript lines only -> silent pass', JSON.stringify({ transcript_path: garbage }), 'pass'],
];
for (const [name, input, expected] of rawCases) {
  const got = classifyResult(spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' }));
  const ok = got === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${name}]  expected=${expected} got=${got}`);
  ok ? pass++ : fail++;
}

// ---- the verified-reply allow is byte-exact and the only output ----
{
  const f = path.join(tmpDir, 'tr-exact.jsonl');
  fs.writeFileSync(f, [enterPlan(), aText('Briefing: ...'), uPlan('ok'), exitPlan()].map(e => JSON.stringify(e)).join('\n'));
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ transcript_path: f }), encoding: 'utf8' });
  const ok = r.status === 0 && r.stdout === ALLOW_JSON && r.stderr === '';
  console.log(`${ok ? 'PASS' : 'FAIL'}  [verified reply emits exactly the allow JSON]  status=${r.status} stdout=${JSON.stringify(r.stdout)}`);
  ok ? pass++ : fail++;
}

console.log(`\n${pass}/${pass + fail} passed`);
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
process.exit(fail ? 1 : 0);
