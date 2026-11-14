/*
 * Tests for board.mjs: the backlog registry, the roadmap tree, their cross-checks, option
 * parsing, and the lock that serializes concurrent writers.
 *
 * No test framework — run with plain Node:
 *   node scripts/board.test.mjs
 *
 * Every test builds its board in a fresh temp directory and drives the CLI as a child process
 * with --root <scratch>, so nothing here ever touches the repository's own .spec/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BOARD = fileURLToPath(new URL('./board.mjs', import.meta.url));
const tempDirs = [];

// --- fixtures ---

function tmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `board-test-${label}-`));
  tempDirs.push(dir);
  return dir;
}

function cli(root, ...args) {
  const result = spawnSync(process.execPath, [BOARD, ...args, '--root', root], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function cliAsync(root, ...args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BOARD, ...args, '--root', root]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function ok(result) {
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
}

// Records a ticket and returns its id.
function add(root, title, ...extra) {
  const out = ok(cli(root, 'backlog', 'add', title, '--type', 'idea', '--source', 'test', ...extra)).stdout;
  return out.match(/Added (bl-[0-9a-f]{6})/)[1];
}

const backlogJson = (root) => JSON.parse(fs.readFileSync(path.join(root, '.spec', 'backlog', 'backlog.json'), 'utf8'));
const roadmapJson = (root) => JSON.parse(fs.readFileSync(path.join(root, '.spec', 'roadmap', 'roadmap.json'), 'utf8'));
const ticket = (root, id) => backlogJson(root).tickets.find((t) => t.id === id);
const files = (dir) => { try { return fs.readdirSync(dir); } catch (_) { return []; } };
const liveBodies = (root, id) => files(path.join(root, '.spec', 'backlog')).filter((n) => n.startsWith(id));
const archivedBodies = (root, id) => files(path.join(root, '.spec', 'backlog', 'archive')).filter((n) => n.startsWith(id));

function findNode(nodes, id) {
  for (const n of nodes ?? []) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let failures = 0;

// --- backlog ---

test('add records a ticket with a body file; list, show, check see it', () => {
  const root = tmp('add');
  const id = add(root, 'First idea', '--feature', 'alpha');
  const t = ticket(root, id);
  assert.equal(t.title, 'First idea');
  assert.equal(t.type, 'idea');
  assert.equal(t.feature, 'alpha');
  assert.deepEqual(liveBodies(root, id), [`${id}-first-idea.md`]);
  assert.match(ok(cli(root, 'backlog', 'list')).stdout, new RegExp(`\\[ \\] ${id}`));
  const show = ok(cli(root, 'backlog', 'show', id)).stdout;
  assert.match(show, /First idea/);
  assert.match(show, /feature alpha/);
  ok(cli(root, 'check'));
});

test('close and drop record how the ticket closed and move the body to archive/ byte for byte', () => {
  const root = tmp('close');
  const a = add(root, 'To close');
  const b = add(root, 'To drop');
  // A leading "---" paragraph is body text, not frontmatter: it must survive the move.
  const text = '---\nnot frontmatter\n---\n\n**Problem:** x\r\n';
  fs.writeFileSync(path.join(root, '.spec', 'backlog', liveBodies(root, a)[0]), text);
  ok(cli(root, 'backlog', 'close', a, '--resolution', 'commit abc'));
  ok(cli(root, 'backlog', 'drop', b, '--resolution', 'not worth it'));
  assert.deepEqual(ticket(root, a).closed.status, 'done');
  assert.equal(ticket(root, a).closed.resolution, 'commit abc');
  assert.equal(ticket(root, b).closed.status, 'dropped');
  assert.deepEqual(liveBodies(root, a), []);
  assert.equal(fs.readFileSync(path.join(root, '.spec', 'backlog', 'archive', archivedBodies(root, a)[0]), 'utf8'), text);
  assert.equal(archivedBodies(root, b).length, 1);
  assert.match(ok(cli(root, 'backlog', 'list')).stdout, /No ticket\(s\) in the basket/);
  const closed = ok(cli(root, 'backlog', 'list', '--closed')).stdout;
  assert.match(closed, new RegExp(`\\[x\\] ${a}`));
  assert.match(closed, new RegExp(`\\[-\\] ${b}`));
  assert.equal(cli(root, 'backlog', 'close', a, '--resolution', 'again').status, 2);
  ok(cli(root, 'check'));
});

test('claim refuses (exit 3) when held; --force keeps the fields not passed', () => {
  const root = tmp('claim');
  const id = add(root, 'Claim me');
  ok(cli(root, 'backlog', 'claim', id));
  assert.deepEqual({ branch: ticket(root, id).claim.branch, note: ticket(root, id).claim.note }, { branch: 'TBD', note: 'under discussion' });
  ok(cli(root, 'backlog', 'claim', id, '--force', '--branch', 'feat/one', '--note', 'designing it'));

  const refused = cli(root, 'backlog', 'claim', id, '--branch', 'feat/other');
  assert.equal(refused.status, 3);
  assert.match(refused.stderr, /feat\/one/);
  assert.equal(ticket(root, id).claim.branch, 'feat/one');

  ok(cli(root, 'backlog', 'claim', id, '--force', '--branch', 'feat/two'));
  assert.equal(ticket(root, id).claim.branch, 'feat/two');
  assert.equal(ticket(root, id).claim.note, 'designing it');
  ok(cli(root, 'backlog', 'claim', id, '--force', '--note', 'implementing'));
  assert.deepEqual({ branch: ticket(root, id).claim.branch, note: ticket(root, id).claim.note }, { branch: 'feat/two', note: 'implementing' });
  assert.match(ticket(root, id).claim.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('release drops a claim, and says so when there was none', () => {
  const root = tmp('release');
  const id = add(root, 'Held');
  ok(cli(root, 'backlog', 'claim', id, '--branch', 'b', '--note', 'n'));
  ok(cli(root, 'backlog', 'release', id));
  assert.equal(ticket(root, id).claim, undefined);
  assert.match(ok(cli(root, 'backlog', 'release', id)).stdout, /was not claimed/);
});

// --- promote / demote ---

test('promote puts a ticket on the tree (a claimed one arrives active); demote returns it', () => {
  const root = tmp('promote');
  const a = add(root, 'Plain');
  const b = add(root, 'Claimed');
  ok(cli(root, 'backlog', 'claim', b));
  ok(cli(root, 'roadmap', 'init', 'Plan'));
  ok(cli(root, 'roadmap', 'add', 'root', 'core', 'Core'));
  ok(cli(root, 'promote', a, 'core', 'core.a', '--title', 'A', '--ordinal', '10'));
  ok(cli(root, 'promote', b, 'core', 'core.b', '--ordinal', '10'));
  const tree = roadmapJson(root);
  assert.deepEqual(findNode(tree.children, 'core.a').tickets, [a]);
  assert.equal(findNode(tree.children, 'core.a').status, 'planned');
  assert.equal(findNode(tree.children, 'core.b').status, 'active');
  assert.equal(ticket(root, b).claim, undefined);
  assert.match(ok(cli(root, 'backlog', 'list')).stdout, /No ticket\(s\) in the basket/);
  assert.match(ok(cli(root, 'roadmap', 'next')).stdout, /core\.a/);

  ok(cli(root, 'demote', a));
  assert.equal(findNode(roadmapJson(root).children, 'core.a').tickets, undefined);
  assert.match(ok(cli(root, 'backlog', 'list')).stdout, new RegExp(a));
  ok(cli(root, 'promote', a, '--into', 'core.b'));
  assert.deepEqual(findNode(roadmapJson(root).children, 'core.b').tickets, [b, a]);
  ok(cli(root, 'check'));
});

// --- design questions holding tickets ---

test('a question holding a ticket can be decided; finishing its parent closes that ticket', () => {
  const root = tmp('question');
  const main = add(root, 'Main item');
  const q = add(root, 'Question body');
  const kept = add(root, 'Question with work under it');
  ok(cli(root, 'roadmap', 'init', 'Plan'));
  ok(cli(root, 'roadmap', 'add', 'root', 'item', 'Item', '--status', 'active'));
  ok(cli(root, 'promote', main, '--into', 'item'));
  ok(cli(root, 'roadmap', 'add', 'item', 'item.q', 'Which way?', '--status', 'open'));
  ok(cli(root, 'promote', q, '--into', 'item.q'));
  ok(cli(root, 'roadmap', 'add', 'item', 'item.q2', 'Split it?', '--status', 'open'));
  ok(cli(root, 'promote', kept, '--into', 'item.q2'));
  ok(cli(root, 'roadmap', 'add', 'item.q2', 'item.q2.w', 'The split', '--status', 'active'));

  // The parent cannot finish while a question is unsettled (exit 3), and a question is never finished.
  assert.equal(cli(root, 'roadmap', 'finish', 'item', '--resolution', 'x').status, 3);
  assert.equal(cli(root, 'roadmap', 'finish', 'item.q', '--resolution', 'x').status, 2);

  // Settling the questions is allowed although they hold open tickets.
  ok(cli(root, 'roadmap', 'set', 'item.q', 'status', 'decided'));
  ok(cli(root, 'roadmap', 'set', 'item.q2', 'status', 'decided'));
  ok(cli(root, 'check'));
  assert.equal(ticket(root, q).closed, undefined);

  ok(cli(root, 'roadmap', 'finish', 'item.q2.w', '--resolution', 'split done'));
  ok(cli(root, 'roadmap', 'finish', 'item', '--resolution', 'landed in abc'));
  for (const id of [main, q, kept]) {
    assert.equal(ticket(root, id).closed?.status, 'done', `${id} should be closed`);
    assert.deepEqual(liveBodies(root, id), []);
    assert.equal(archivedBodies(root, id).length, 1);
  }
  const item = findNode(roadmapJson(root).children, 'item');
  assert.equal(item.status, 'done');
  assert.equal(findNode([item], 'item.q'), null, 'the settled leaf question folds away');
  assert.ok(findNode([item], 'item.q2'), 'a settled question holding work stays');
  ok(cli(root, 'check'));
});

test('a closed ticket on a question that is not decided is reported', () => {
  const root = tmp('question-closed');
  const id = add(root, 'Q');
  ok(cli(root, 'roadmap', 'init', 'Plan'));
  ok(cli(root, 'roadmap', 'add', 'root', 'item', 'Item', '--status', 'active'));
  ok(cli(root, 'roadmap', 'add', 'item', 'item.q', 'Q', '--status', 'decided'));
  ok(cli(root, 'promote', id, '--into', 'item.q'));
  ok(cli(root, 'roadmap', 'finish', 'item', '--resolution', 'r'));
  // Hand-edit the finished tree back into an inconsistent shape: an open question holding a closed ticket.
  const tree = roadmapJson(root);
  findNode(tree.children, 'item').children = [{ id: 'item.q', title: 'Q', status: 'open', tickets: [id] }];
  fs.writeFileSync(path.join(root, '.spec', 'roadmap', 'roadmap.json'), JSON.stringify(tree));
  const check = cli(root, 'check');
  assert.equal(check.status, 1);
  assert.match(check.stderr, /is closed but its roadmap node "item\.q" is not done/);
});

// --- "done" only through finish ---

test('status done is refused outside finish: set (even after clearing), add, promote', () => {
  const root = tmp('done');
  const id = add(root, 'T');
  ok(cli(root, 'roadmap', 'init', 'Plan'));
  ok(cli(root, 'roadmap', 'add', 'root', 'w', 'W', '--status', 'planned'));
  ok(cli(root, 'roadmap', 'set', 'w', 'status', '-'));
  const set = cli(root, 'roadmap', 'set', 'w', 'status', 'done');
  assert.equal(set.status, 2);
  assert.match(set.stderr, /roadmap finish w/);
  assert.equal(findNode(roadmapJson(root).children, 'w').status, undefined);
  assert.equal(cli(root, 'roadmap', 'add', 'root', 'w2', 'W2', '--status', 'done').status, 2);
  assert.equal(findNode(roadmapJson(root).children, 'w2'), null);
  assert.equal(cli(root, 'promote', id, 'root', 'w3', '--status', 'done').status, 2);
  assert.equal(findNode(roadmapJson(root).children, 'w3'), null);
});

test('remove refuses a finished node and a branch containing one', () => {
  const root = tmp('remove');
  ok(cli(root, 'roadmap', 'init', 'Plan'));
  ok(cli(root, 'roadmap', 'add', 'root', 'g', 'Group'));
  ok(cli(root, 'roadmap', 'add', 'g', 'g.w', 'W', '--status', 'active'));
  ok(cli(root, 'roadmap', 'add', 'root', 'x', 'X', '--status', 'planned'));
  ok(cli(root, 'roadmap', 'finish', 'g.w', '--resolution', 'r'));
  assert.equal(cli(root, 'roadmap', 'remove', 'g.w').status, 2);
  assert.match(cli(root, 'roadmap', 'remove', 'g', '--force').stderr, /finished/);
  ok(cli(root, 'roadmap', 'remove', 'x'));
  assert.equal(findNode(roadmapJson(root).children, 'x'), null);
});

test('note and move set updated on a node with a status', () => {
  const root = tmp('updated');
  ok(cli(root, 'roadmap', 'init', 'Plan'));
  ok(cli(root, 'roadmap', 'add', 'root', 'a', 'A', '--status', 'planned'));
  ok(cli(root, 'roadmap', 'add', 'root', 'b', 'B'));
  ok(cli(root, 'roadmap', 'set', 'a', 'updated', '2000-01-01'));
  ok(cli(root, 'roadmap', 'note', 'a', 'a note'));
  assert.notEqual(findNode(roadmapJson(root).children, 'a').updated, '2000-01-01');
  ok(cli(root, 'roadmap', 'set', 'a', 'updated', '2000-01-01'));
  ok(cli(root, 'roadmap', 'move', 'a', 'b'));
  assert.notEqual(findNode(roadmapJson(root).children, 'a').updated, '2000-01-01');
});

// --- options ---

test('an option the command does not take is a usage error (exit 2) and changes nothing', () => {
  const root = tmp('options');
  const id = add(root, 'T');
  const typo = cli(root, 'backlog', 'claim', id, '--brnach', 'feat/x');
  assert.equal(typo.status, 2);
  assert.match(typo.stderr, /--brnach/);
  assert.equal(ticket(root, id).claim, undefined);
  assert.equal(cli(root, 'backlog', 'list', '--force').status, 2);
  assert.equal(cli(root, 'check', '--all').status, 2);
  assert.equal(cli(root, 'backlog', 'add', 'x', '--type', 'idea', '--source', 's', '--dry-run').status, 2);
  assert.equal(cli(root, 'migrate').status, 2, 'migrate is gone');
});

test('render --out refuses .spec/backlog/ and roadmap.json, and writes elsewhere', () => {
  const root = tmp('render');
  const id = add(root, 'T');
  ok(cli(root, 'roadmap', 'init', 'Plan'));
  const body = path.join(root, '.spec', 'backlog', liveBodies(root, id)[0]);
  const before = fs.readFileSync(body, 'utf8');
  assert.equal(cli(root, 'roadmap', 'render', '--out', body).status, 2);
  assert.equal(fs.readFileSync(body, 'utf8'), before);
  assert.equal(cli(root, 'roadmap', 'render', '--out', path.join(root, '.spec', 'backlog', 'archive', 'x.md')).status, 2);
  assert.equal(cli(root, 'roadmap', 'render', '--out', path.join(root, '.spec', 'roadmap', 'roadmap.json')).status, 2);
  const out = path.join(root, 'ROADMAP.md');
  ok(cli(root, 'roadmap', 'render', '--out', out));
  assert.match(fs.readFileSync(out, 'utf8'), /^# Plan/);
});

// --- check ---

test('check names an orphan body file, live or archived', () => {
  const root = tmp('orphan');
  add(root, 'T');
  ok(cli(root, 'check'));
  fs.writeFileSync(path.join(root, '.spec', 'backlog', 'bl-abcdef-stray.md'), 'x');
  let check = cli(root, 'check');
  assert.equal(check.status, 1);
  assert.match(check.stderr, /orphan body \.spec\/backlog\/bl-abcdef-stray\.md/);
  fs.rmSync(path.join(root, '.spec', 'backlog', 'bl-abcdef-stray.md'));
  fs.mkdirSync(path.join(root, '.spec', 'backlog', 'archive'), { recursive: true });
  fs.writeFileSync(path.join(root, '.spec', 'backlog', 'archive', 'bl-123456.md'), 'x');
  check = cli(root, 'check');
  assert.equal(check.status, 1);
  assert.match(check.stderr, /orphan body \.spec\/backlog\/archive\/bl-123456\.md/);
});

test('check names a body left in both places by an interrupted move', () => {
  const root = tmp('duplicate');
  const id = add(root, 'T');
  const name = liveBodies(root, id)[0];
  fs.mkdirSync(path.join(root, '.spec', 'backlog', 'archive'), { recursive: true });
  fs.copyFileSync(path.join(root, '.spec', 'backlog', name), path.join(root, '.spec', 'backlog', 'archive', name));
  const check = cli(root, 'check');
  assert.equal(check.status, 1);
  assert.match(check.stderr, /2 body files/);
});

// --- concurrency and the lock ---

test('six concurrent adds all land, and the board checks clean', async () => {
  const root = tmp('concurrent');
  add(root, 'Seed'); // the board exists before the race
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => cliAsync(root, 'backlog', 'add', `Parallel ${i}`, '--type', 'idea', '--source', 'race')));
  for (const r of results) assert.equal(r.status, 0, r.stderr);
  const raced = backlogJson(root).tickets.filter((t) => t.source === 'race');
  assert.equal(raced.length, 6);
  assert.deepEqual(raced.map((t) => t.title).sort(), Array.from({ length: 6 }, (_, i) => `Parallel ${i}`));
  ok(cli(root, 'check'));
  assert.ok(!fs.existsSync(path.join(root, '.spec', '.board.lock')), 'the lock is released');
  assert.deepEqual(files(path.join(root, '.spec', 'backlog')).filter((n) => n.endsWith('.tmp')), [], 'no temp files left');
});

test('concurrent claims: exactly one wins, the rest are refused', async () => {
  const root = tmp('claim-race');
  const id = add(root, 'Contested');
  const results = await Promise.all(Array.from({ length: 4 }, (_, i) => cliAsync(root, 'backlog', 'claim', id, '--branch', `b${i}`)));
  assert.equal(results.filter((r) => r.status === 0).length, 1);
  assert.equal(results.filter((r) => r.status === 3).length, 3);
});

test('a stale lock is removed; a fresh one does not block read-only commands', () => {
  const root = tmp('lock');
  add(root, 'T');
  const lock = path.join(root, '.spec', '.board.lock');
  fs.writeFileSync(lock, 'dead process');
  ok(cli(root, 'backlog', 'list'));
  ok(cli(root, 'check'));
  const old = new Date(Date.now() - 5 * 60_000);
  fs.utimesSync(lock, old, old);
  add(root, 'After a crash');
  assert.ok(!fs.existsSync(lock));
});

// --- run ---

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}\n     ${String(error.stack ?? error).split('\n').join('\n     ')}`);
  }
}

for (const dir of tempDirs) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}
console.log(`\n${tests.length - failures}/${tests.length} passed`);
process.exit(failures === 0 ? 0 : 1);
