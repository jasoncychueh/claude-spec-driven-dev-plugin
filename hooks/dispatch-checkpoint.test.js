'use strict';
/*
 * Regression tests for dispatch-checkpoint.js.
 *
 * Spawns the REAL hook against a synthetic subagent transcript. No test framework:
 *   node hooks/dispatch-checkpoint.test.js
 *
 * Guards that the hook only ever informs: it emits additionalContext (at the per-agent
 * threshold) or nothing at all, and NEVER a permissionDecision. An explicit "allow" would
 * override the user's own permission rules.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'dispatch-checkpoint.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-hook-test-'));

const dispatch = (t) => ({ type: 'user', message: { role: 'user', content: t } });
const toolTurn = (i) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', id: 't' + i, input: {} }] } });
const toolDone = (i) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't' + i, content: 'ok' }] } });
const turns = (n) => { const out = []; for (let i = 0; i < n; i++) out.push(toolTurn(i), toolDone(i)); return out; };

function run(entries, extra) {
  const f = path.join(tmpDir, 'agent-abc123.jsonl');
  fs.writeFileSync(f, entries.map((e) => JSON.stringify(e)).join('\n'));
  const input = Object.assign({ transcript_path: f, tool_name: 'Read', agent_id: 'abc123', agent_type: 'spec-driven-development:spec-tester' }, extra || {});
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });
}
const parse = (r) => { try { return JSON.parse(r.stdout).hookSpecificOutput; } catch (_) { return null; } };

let pass = 0, fail = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${name}]${ok ? '' : '  ' + detail}`);
  ok ? pass++ : fail++;
}
// A silent pass: exit 0, no stdout, no stderr.
const silent = (r) => r.status === 0 && r.stdout === '' && r.stderr === '';
// A note: additionalContext only, never a permissionDecision.
function isNote(r) {
  const o = parse(r);
  return r.status === 0 && !!o && o.hookEventName === 'PreToolUse' && /Dispatch checkpoint/.test(o.additionalContext || '') && !('permissionDecision' in o);
}

// spec-tester threshold is 20
check('below the threshold: silent pass, no output at all', silent(run([dispatch('go'), ...turns(5)])), '');
check('at the threshold: additionalContext and no permissionDecision', isNote(run([dispatch('go'), ...turns(20)])), '');
check('past the threshold: still only additionalContext', isNote(run([dispatch('go'), ...turns(45)])), '');
check('bare agent type name is matched too', isNote(run([dispatch('go'), ...turns(20)], { agent_type: 'spec-tester' })), '');
check('the main thread (no agent_id) is not addressed: silent pass', silent(run([dispatch('go'), ...turns(30)], { agent_id: undefined })), '');
check('an agent type this plugin does not own: silent pass', silent(run([dispatch('go'), ...turns(60)], { agent_type: 'Explore' })), '');
check('no transcript_path: silent pass', silent(run([dispatch('go'), ...turns(30)], { transcript_path: undefined })), '');
check('unreadable transcript: silent pass', silent(run([dispatch('go'), ...turns(30)], { transcript_path: path.join(tmpDir, 'agent-abc123-missing.jsonl') })), '');
{
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
  check('stdin is not JSON: silent pass', silent(r), JSON.stringify(r.stdout));
}
check('the previous checkpoint note resets the count: silent pass', silent(run([
  dispatch('go'), ...turns(20),
  { type: 'user', message: { role: 'user', content: '[spec-driven-development] Dispatch checkpoint: 20 tool calls' } },
  ...turns(3),
])), '');

console.log(`\n${pass}/${pass + fail} passed`);
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
process.exit(fail ? 1 : 0);
