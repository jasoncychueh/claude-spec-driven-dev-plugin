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
const uMeta = (t) => ({ type: 'user', isMeta: true, message: { role: 'user', content: t } });
const noise = (type) => ({ type }); // ai-title / mode / system / attachment / queue-operation

let seq = 0;
function run(entries) {
  const f = path.join(tmpDir, 'tr-' + (seq++) + '.jsonl');
  fs.writeFileSync(f, entries.map(e => JSON.stringify(e)).join('\n'));
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ transcript_path: f }), encoding: 'utf8' });
  try { return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision; }
  catch (e) { return 'ERR(' + (r.stdout || '') + '|' + (r.stderr || '') + ')'; }
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
  ['denied exit does not close the session; recovery still allows', [
    uText('plan X'), enterPlan(), aText('Briefing: ...'), exitPlan(),   // 1st attempt denied (no reply yet)
    uToolResult(),                                                      // deny-reason residue (not an approval)
    aText('re-briefing turn-final...'), uPlan('ok go'), toolSearch(), exitPlan(),
  ], 'allow'],

  // no identifiable plan session (entry scrolled off / compacted) + assistant text before
  // the exit. Documented behavior is fail-open ALLOW, not a boundary deny.
  ['no identifiable session + assistant text before exit -> fail-open allow', [
    aText('some analysis text with no plan entry in view'), exitPlan(),
  ], 'allow'],

  ['empty transcript -> fail-open', [], 'allow'],
];

let pass = 0, fail = 0;
for (const [name, entries, expected] of cases) {
  const got = run(entries);
  const ok = got === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${name}]  expected=${expected} got=${got}`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass}/${pass + fail} passed`);
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
process.exit(fail ? 1 : 0);
