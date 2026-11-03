'use strict';
/*
 * Regression tests for session-longevity-checkpoint.js.
 *
 * Spawns the REAL hook against a synthetic main transcript plus a synthetic subagent transcript
 * at <dir>/<session-id>/subagents/agent-<id>.jsonl. No test framework:
 *   node hooks/session-longevity-checkpoint.test.js
 *
 * Guards that the hook only ever informs: it emits additionalContext (at 300K / 400K of context,
 * or after a compact boundary) or nothing at all, and NEVER a permissionDecision. An explicit
 * "allow" would override the user's own permission rules.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'session-longevity-checkpoint.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'longevity-hook-test-'));
const SID = 'sess1';
const AGENT = 'a0123456789abcdef';
const main = path.join(tmpDir, SID + '.jsonl');
fs.writeFileSync(main, JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }));
const subDir = path.join(tmpDir, SID, 'subagents');
fs.mkdirSync(subDir, { recursive: true });

const usage = (tokens) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 10, cache_read_input_tokens: tokens - 10, cache_creation_input_tokens: 0 } } });
const boundary = () => ({ type: 'system', subtype: 'compact_boundary' });

function run(subEntries, toolInput, extra) {
  const sub = path.join(subDir, 'agent-' + AGENT + '.jsonl');
  if (subEntries === null) { try { fs.rmSync(sub); } catch (_) {} }
  else fs.writeFileSync(sub, subEntries.map((e) => JSON.stringify(e)).join('\n'));
  const input = Object.assign({ transcript_path: main, tool_name: 'SendMessage', tool_input: toolInput || { to: AGENT, message: 'go on' } }, extra || {});
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
function isNote(r, re) {
  const o = parse(r);
  return r.status === 0 && !!o && o.hookEventName === 'PreToolUse' && re.test(o.additionalContext || '') && !('permissionDecision' in o);
}

check('under 300K: silent pass, no output at all', silent(run([usage(120000)])), '');
check('300K: watch note is additionalContext only', isNote(run([usage(320000)]), /approaching/), '');
check('400K: retire note is additionalContext only', isNote(run([usage(450000)]), /retirement ceiling/), '');
check('a compact boundary: note is additionalContext only', isNote(run([boundary(), usage(100000)]), /autocompacted/), '');
check('no usage record yet: silent pass', silent(run([{ type: 'user', message: { role: 'user', content: 'hi' } }])), '');
check('a target that is not a subagent id: silent pass', silent(run([usage(450000)], { to: 'teammate' })), '');
check('no subagent transcript on disk: silent pass', silent(run(null)), '');
check('no transcript_path: silent pass', silent(run([usage(450000)], null, { transcript_path: undefined })), '');
{
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
  check('stdin is not JSON: silent pass', silent(r), JSON.stringify(r.stdout));
}

console.log(`\n${pass}/${pass + fail} passed`);
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
process.exit(fail ? 1 : 0);
