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
 * EnterPlanMode tool or the user re-entered manually (shift+tab, which emits a
 * {type:"permission-mode",permissionMode:"plan"} marker after a restart drops
 * plan-mode state). The check must NOT leak past that boundary to a stale reply
 * from before a restart. (This is the bug that returned after 1.6.6 dropped the
 * manual-entry path; the test pins both entry kinds.)
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
const exitPlan = () => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'ExitPlanMode', input: { plan: 'do the thing' } }] } });
const toolSearch = () => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'ToolSearch', input: {} }] } });
const aText = (t) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: t }] } });
const uText = (t) => ({ type: 'user', message: { role: 'user', content: t } });
const uToolResult = () => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } });
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
