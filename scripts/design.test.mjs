/*
 * Tests for design.mjs: the pure helpers, the install/list/set-mirror CLI, and the local server.
 *
 * No test framework — run with plain Node:
 *   node scripts/design.test.mjs          (or:  node --test scripts/design.test.mjs)
 *
 * Every fixture is a small synthetic file written into a temp directory; no real Design runtime is
 * used or executed. Servers bind 127.0.0.1 on an ephemeral port and are killed by the test.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  validFeature, route, hostAllowed, contentType, filesListing, buildStamp, injectSwitcher, listDesigns, SWITCHER, HOME_PAGE,
} from './design.mjs';

const DESIGN = fileURLToPath(new URL('./design.mjs', import.meta.url));
const tempDirs = [];
const STAMP_A = 'a'.repeat(32);
const STAMP_B = 'b'.repeat(32);
const URL_1 = 'https://claude.ai/artifact/AbC123_-x';
const URL_2 = 'https://claude.ai/code/artifact/0123-abcd';

// --- fixtures ---

function tmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `design-test-${label}-`));
  tempDirs.push(dir);
  return dir;
}

const indexHtml = (stamp, body = '<div id="app"></div>') =>
  `<!doctype html><html><head><meta name="mega-build-stamp" content="${stamp}"></head><body>${body}</body></html>`;

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// A folder shaped like a downloaded canvas: the runtime plus a canvas that must never be read.
function viewerSource(dir, { stamp = STAMP_A, reference = true, html } = {}) {
  write(path.join(dir, 'index.html'), html ?? indexHtml(stamp));
  write(path.join(dir, 'artifact-type', 'app.js'), 'console.log("app");');
  write(path.join(dir, 'artifact-type', 'fonts', 'x.woff2'), 'FONT');
  if (reference) write(path.join(dir, 'artifact-type', 'reference', 'format.md'), '# format');
  write(path.join(dir, 'project', 'canvas.json'), '{"v":3,"boards":{},"order":[]}');
  return dir;
}

function mkDesign(root, name, boards = ['one']) {
  const base = path.join(root, '.spec', 'design', name, 'project');
  const entries = {};
  for (const board of boards) {
    entries[`${board}.dc.html`] = { x: 0, y: 0, w: 100, h: 100, title: board };
    write(path.join(base, `${board}.dc.html`), `<html><body>${name}:${board}</body></html>`);
  }
  write(path.join(base, 'canvas.json'), JSON.stringify({ v: 3, boards: entries, order: boards.map((b) => `${b}.dc.html`) }));
  return path.join(root, '.spec', 'design', name);
}

// Lay a viewer straight into _viewer/ (what install-viewer produces, without the process hop).
function mkViewer(root, { html, format = true } = {}) {
  const dir = path.join(root, '.spec', 'design', '_viewer');
  write(path.join(dir, 'index.html'), html ?? indexHtml(STAMP_A));
  write(path.join(dir, 'artifact-type', 'app.js'), 'console.log("app");');
  write(path.join(dir, 'artifact-type', 'fonts', 'x.woff2'), 'FONT');
  write(path.join(dir, 'viewer.json'), JSON.stringify({ buildStamp: STAMP_A, format, source: URL_1, installedAt: 'now' }));
  return dir;
}

function cli(root, ...args) {
  const result = spawnSync(process.execPath, [DESIGN, ...args, '--root', root], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function removeLink(link) {
  try { fs.unlinkSync(link); } catch (_) { try { fs.rmdirSync(link); } catch (__) { /* gone */ } }
}

// Hash of every file under a directory, to show it was left untouched.
function snapshot(dir) {
  const out = {};
  const walk = (current, prefix) => {
    for (const name of fs.readdirSync(current)) {
      const full = path.join(current, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else out[rel] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  };
  walk(dir, '');
  return out;
}

// --- a running server ---

function startView(root, ...extra) {
  const child = spawn(process.execPath, [DESIGN, 'view', ...extra, '--root', root, '--no-open', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`no listen line; stdout=${stdout} stderr=${stderr}`)); }, 15000);
    child.stdout.on('data', (d) => {
      stdout += d;
      const m = /Design viewer at (http:\/\/127\.0\.0\.1:(\d+)(\S*)) \(Ctrl\+C to stop\)\n/.exec(stdout);
      if (!m) return;
      clearTimeout(timer);
      resolve({
        url: m[1], port: Number(m[2]), pathname: m[3], child, stdout: () => stdout, stderr: () => stderr,
        stop: () => new Promise((done) => { child.once('exit', done); child.kill(); }),
      });
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`exited ${code} before listening; stderr=${stderr}`)); });
  });
}

function request(port, method, rawPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: rawPath, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

// --- tiny runner ---

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let failures = 0;

// --- validFeature ---

test('validFeature accepts ordinary names', () => {
  for (const name of ['settings', 'Settings-v2', 'a.b_c']) assert.equal(validFeature(name), true, name);
});

test('validFeature refuses reserved, traversal and over-long names', () => {
  for (const name of ['_viewer', '_viewer.install-tmp', '.x', '..', 'a/b', 'x'.repeat(65), '', 'a b']) assert.equal(validFeature(name), false, name);
  assert.equal(validFeature('x'.repeat(64)), true);
});

// --- route ---

test('route maps the served paths', () => {
  assert.deepEqual(route('/'), { kind: 'home' });
  assert.deepEqual(route('/__designs.json'), { kind: 'designs' });
  assert.deepEqual(route('/d/x'), { kind: 'redirect', feature: 'x' });
  assert.deepEqual(route('/d/x/'), { kind: 'featureIndex', feature: 'x' });
  assert.deepEqual(route('/d/Settings/'), { kind: 'featureIndex', feature: 'Settings' });
  assert.deepEqual(route('/d/x/_files.json'), { kind: 'files', feature: 'x' });
  assert.deepEqual(route('/d/x/project/canvas.json'), { kind: 'canvasFile', feature: 'x', rel: 'project/canvas.json' });
  assert.deepEqual(route('/d/x/artifact-type/app.js'), { kind: 'viewerFile', feature: 'x', rel: 'artifact-type/app.js' });
  assert.deepEqual(route('/d/x/_files.json?cache=1'), { kind: 'files', feature: 'x' });
});

test('route answers notFound for reserved features and unmounted paths', () => {
  assert.equal(route('/d/_viewer/').kind, 'notFound');
  assert.equal(route('/project/canvas.json').kind, 'notFound');
  assert.equal(route('/d/').kind, 'notFound');
});

test('route rejects traversal and unsafe path forms', () => {
  for (const p of ['/../x', '/d/x/../../y', '/d/x/project/../../y', '/d/%2e%2e/x', '/d/x/..%5cy', '/d/x/a%00b', '/%E0%A4', '/d/x/C:/Windows/win.ini', '//x']) {
    assert.equal(route(p).kind, 'bad', p);
  }
});

// --- hostAllowed / contentType ---

test('hostAllowed accepts only loopback names on the served port', () => {
  assert.equal(hostAllowed('127.0.0.1:5000', 5000), true);
  assert.equal(hostAllowed('localhost:5000', 5000), true);
  assert.equal(hostAllowed('LocalHost:5000', 5000), true);
  assert.equal(hostAllowed('127.0.0.1:5001', 5000), false);
  assert.equal(hostAllowed('evil.example:5000', 5000), false);
  assert.equal(hostAllowed(undefined, 5000), false);
});

test('contentType names the common types', () => {
  assert.equal(contentType('a/b.woff2'), 'font/woff2');
  assert.equal(contentType('app.js'), 'text/javascript; charset=utf-8');
  assert.equal(contentType('index.html'), 'text/html; charset=utf-8');
  assert.equal(contentType('canvas.json'), 'application/json; charset=utf-8');
  assert.equal(contentType('x.css'), 'text/css; charset=utf-8');
  assert.equal(contentType('x.weird'), 'application/octet-stream');
});

// --- filesListing ---

test('filesListing lists the canvas files with posix keys, hashes and sizes', () => {
  const dir = path.join(tmp('files'), 'feat');
  write(path.join(dir, 'project', 'canvas.json'), '{"order":[]}');
  write(path.join(dir, 'project', 'one.dc.html'), '<p>one</p>');
  const png = Buffer.from([1, 2, 3, 4, 5]);
  write(path.join(dir, 'project', 'assets', 'x.png'), png);
  const listing = filesListing(dir);
  assert.deepEqual(Object.keys(listing.files), ['project/assets/x.png', 'project/canvas.json', 'project/one.dc.html']);
  assert.equal(listing.files['project/assets/x.png'].bytes, 5);
  assert.equal(listing.files['project/assets/x.png'].sha256, crypto.createHash('sha256').update(png).digest('hex'));
  assert.equal(listing.files['project/canvas.json'].sha256, crypto.createHash('sha256').update('{"order":[]}').digest('hex'));
});

test('filesListing skips a junction pointing outside the feature directory', () => {
  const base = tmp('files-link');
  const dir = path.join(base, 'feat');
  write(path.join(dir, 'project', 'canvas.json'), '{}');
  write(path.join(base, 'outside', 'secret.txt'), 'secret');
  fs.symlinkSync(path.join(base, 'outside'), path.join(dir, 'project', 'escape'), 'junction');
  try {
    assert.deepEqual(Object.keys(filesListing(dir).files), ['project/canvas.json']);
  } finally {
    removeLink(path.join(dir, 'project', 'escape'));
  }
});

// A file system in which chosen entries fail like a file renamed away mid-walk.
function flakyFs(failures) {
  const failOn = (op, target) => {
    const code = failures[`${op}:${path.basename(target)}`];
    if (code) throw Object.assign(new Error(`${code}: ${target}`), { code });
  };
  return {
    readdirSync: (p) => fs.readdirSync(p),
    lstatSync: (p) => { failOn('lstat', p); return fs.lstatSync(p); },
    readFileSync: (p) => { failOn('read', p); return fs.readFileSync(p); },
  };
}

test('filesListing skips an entry that vanishes mid-walk but fails on any other error', () => {
  const dir = path.join(tmp('files-vanish'), 'feat');
  write(path.join(dir, 'project', 'canvas.json'), '{}');
  write(path.join(dir, 'project', 'gone-at-lstat.dc.html'), 'x');
  write(path.join(dir, 'project', 'gone-at-read.dc.html'), 'x');
  const listing = filesListing(dir, flakyFs({ 'lstat:gone-at-lstat.dc.html': 'ENOENT', 'read:gone-at-read.dc.html': 'ENOENT' }));
  assert.deepEqual(Object.keys(listing.files), ['project/canvas.json']);
  assert.throws(() => filesListing(dir, flakyFs({ 'lstat:canvas.json': 'EACCES' })), { code: 'EACCES' });
  assert.throws(() => filesListing(dir, flakyFs({ 'read:canvas.json': 'EACCES' })), { code: 'EACCES' });
});

// --- buildStamp / injectSwitcher ---

test('buildStamp reads the meta tag and is null without one', () => {
  assert.equal(buildStamp(indexHtml(STAMP_A)), STAMP_A);
  assert.equal(buildStamp('<html><head></head><body></body></html>'), null);
});

test('injectSwitcher inserts the switcher immediately before the last </body>', () => {
  const html = '<html><body><p>a</p></body></html>';
  const result = injectSwitcher(html);
  assert.equal(result.injected, true);
  assert.equal(result.html, `<html><body><p>a</p>${SWITCHER}</body></html>`);
  const twice = injectSwitcher('<body>x</body> text <body>y</body>');
  assert.equal(twice.html, `<body>x</body> text <body>y${SWITCHER}</body>`);
});

test('injectSwitcher leaves a page without </body> byte-identical', () => {
  const html = '<html><body><p>no end';
  assert.deepEqual(injectSwitcher(html), { html, injected: false });
});

test('the home page is a fixed document listing designs from /__designs.json', () => {
  assert.match(HOME_PAGE, /__designs\.json/);
  assert.match(HOME_PAGE, /No designs yet/);
});

// --- listDesigns ---

test('listDesigns skips the viewer, swap directories and non-designs, and tolerates a bad canvas.json', () => {
  const root = tmp('list-designs');
  mkDesign(root, 'beta', ['a', 'b']);
  mkDesign(root, 'alpha', ['a']);
  mkViewer(root);
  const designRoot = path.join(root, '.spec', 'design');
  write(path.join(designRoot, '_viewer.install-tmp', 'project', 'canvas.json'), '{"order":[]}');
  write(path.join(designRoot, 'empty', 'notes.txt'), 'no canvas');
  write(path.join(designRoot, 'broken', 'project', 'canvas.json'), '{ not json');
  assert.deepEqual(listDesigns(designRoot), [
    { name: 'alpha', boards: 1 },
    { name: 'beta', boards: 2 },
    { name: 'broken', boards: null },
  ]);
  assert.deepEqual(listDesigns(path.join(root, 'nope')), []);
});

// --- set-mirror and list ---

test('set-mirror records each design and list shows the urls', () => {
  const root = tmp('mirror');
  mkViewer(root);
  mkDesign(root, 'a', ['one', 'two']);
  mkDesign(root, 'b', ['one']);
  assert.equal(cli(root, 'set-mirror', 'a', URL_1).status, 0);
  assert.equal(cli(root, 'set-mirror', 'b', URL_2).status, 0);
  const mirrors = JSON.parse(fs.readFileSync(path.join(root, '.spec', 'design', '_viewer', 'mirrors.json'), 'utf8'));
  assert.deepEqual(mirrors, { a: URL_1, b: URL_2 });
  const listed = cli(root, 'list');
  assert.equal(listed.status, 0);
  const lines = listed.stdout.split('\n');
  assert.ok(lines.find((l) => l.startsWith('a:') && l.includes(URL_1) && l.includes('2 board')), listed.stdout);
  assert.ok(lines.find((l) => l.startsWith('b:') && l.includes(URL_2) && l.includes('1 board')), listed.stdout);
});

test('set-mirror refuses a non-claude.ai url (2), a missing viewer (3) and an unparsable mirrors.json (1)', () => {
  const root = tmp('mirror-refuse');
  assert.equal(cli(root, 'set-mirror', 'a', URL_1).status, 3);
  mkViewer(root);
  assert.equal(cli(root, 'set-mirror', 'a', 'https://example.com/artifact/abc').status, 2);
  assert.equal(cli(root, 'set-mirror', 'a', 'http://claude.ai/artifact/abc').status, 2);
  assert.equal(cli(root, 'set-mirror', '_viewer', URL_1).status, 2);
  write(path.join(root, '.spec', 'design', '_viewer', 'mirrors.json'), '{ nope');
  const refused = cli(root, 'set-mirror', 'a', URL_1);
  assert.equal(refused.status, 1);
  assert.equal(fs.readFileSync(path.join(root, '.spec', 'design', '_viewer', 'mirrors.json'), 'utf8'), '{ nope');
});

test('list reports the viewer: not installed, format installed, format absent', () => {
  const root = tmp('list');
  mkDesign(root, 'a');
  assert.match(cli(root, 'list').stdout, /^viewer: not installed/);
  mkViewer(root, { format: true });
  assert.match(cli(root, 'list').stdout, new RegExp(`^viewer: build ${STAMP_A}, format installed at `));
  mkViewer(root, { format: false });
  assert.match(cli(root, 'list').stdout, /format absent at /);
  assert.match(cli(root, 'list').stdout, /\na: 1 board/);
});

test('list says so when there are no designs', () => {
  const root = tmp('list-none');
  assert.match(cli(root, 'list').stdout, /no designs/);
});

// --- install-viewer ---

test('install-viewer lays out the runtime, the format, .gitignore and viewer.json, and no feature directory', () => {
  const root = tmp('install');
  const from = viewerSource(tmp('install-src'));
  const result = cli(root, 'install-viewer', '--from', from, '--source', URL_1);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`viewer installed: build ${STAMP_A}`));
  assert.doesNotMatch(result.stdout, /no authoring format/);
  const viewer = path.join(root, '.spec', 'design', '_viewer');
  assert.equal(fs.readFileSync(path.join(viewer, 'index.html'), 'utf8'), indexHtml(STAMP_A));
  assert.equal(fs.readFileSync(path.join(viewer, 'artifact-type', 'app.js'), 'utf8'), 'console.log("app");');
  assert.equal(fs.readFileSync(path.join(viewer, 'artifact-type', 'fonts', 'x.woff2'), 'utf8'), 'FONT');
  assert.equal(fs.readFileSync(path.join(viewer, 'artifact-type', 'reference', 'format.md'), 'utf8'), '# format');
  assert.equal(fs.existsSync(path.join(viewer, 'project')), false);
  assert.equal(fs.readFileSync(path.join(viewer, '.gitignore'), 'utf8'), '*\n');
  const info = JSON.parse(fs.readFileSync(path.join(viewer, 'viewer.json'), 'utf8'));
  assert.equal(info.buildStamp, STAMP_A);
  assert.equal(info.format, true);
  assert.equal(info.source, URL_1);
  assert.equal(typeof info.installedAt, 'string');
  assert.deepEqual(fs.readdirSync(path.join(root, '.spec', 'design')), ['_viewer']);
});

test('install-viewer without reference/ installs with format false and says so', () => {
  const root = tmp('install-noref');
  const from = viewerSource(tmp('install-noref-src'), { reference: false });
  const result = cli(root, 'install-viewer', '--from', from, '--source', URL_1);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no authoring format installed/);
  const info = JSON.parse(fs.readFileSync(path.join(root, '.spec', 'design', '_viewer', 'viewer.json'), 'utf8'));
  assert.equal(info.format, false);
});

test('a reinstall keeps mirrors.json byte-identical and leaves no swap directories', () => {
  const root = tmp('reinstall');
  const from = viewerSource(tmp('reinstall-src'));
  assert.equal(cli(root, 'install-viewer', '--from', from, '--source', URL_1).status, 0);
  assert.equal(cli(root, 'set-mirror', 'a', URL_1).status, 0);
  const mirrorsFile = path.join(root, '.spec', 'design', '_viewer', 'mirrors.json');
  const before = fs.readFileSync(mirrorsFile);
  assert.equal(cli(root, 'install-viewer', '--from', from, '--source', URL_2).status, 0);
  assert.deepEqual(fs.readFileSync(mirrorsFile), before);
  assert.deepEqual(fs.readdirSync(path.join(root, '.spec', 'design')), ['_viewer']);
});

test('install-viewer refuses a folder missing app.js or index.html and leaves an existing viewer untouched', () => {
  const root = tmp('refuse');
  const good = viewerSource(tmp('refuse-good'));
  assert.equal(cli(root, 'install-viewer', '--from', good, '--source', URL_1).status, 0);
  const viewer = path.join(root, '.spec', 'design', '_viewer');
  const before = snapshot(viewer);

  const noApp = viewerSource(tmp('refuse-noapp'));
  fs.rmSync(path.join(noApp, 'artifact-type', 'app.js'));
  const a = cli(root, 'install-viewer', '--from', noApp, '--source', URL_1);
  assert.equal(a.status, 1);
  assert.match(a.stderr, /artifact-type\/app\.js missing/);

  const noIndex = viewerSource(tmp('refuse-noindex'));
  fs.rmSync(path.join(noIndex, 'index.html'));
  const b = cli(root, 'install-viewer', '--from', noIndex, '--source', URL_1);
  assert.equal(b.status, 1);
  assert.match(b.stderr, /index\.html missing/);

  assert.deepEqual(snapshot(viewer), before);
  assert.deepEqual(fs.readdirSync(path.join(root, '.spec', 'design')), ['_viewer']);
});

test('install-viewer refuses a junction inside artifact-type/', () => {
  const root = tmp('junction');
  const from = viewerSource(tmp('junction-src'));
  const outside = tmp('junction-outside');
  write(path.join(outside, 'leak.txt'), 'leak');
  const link = path.join(from, 'artifact-type', 'linked');
  fs.symlinkSync(outside, link, 'junction');
  try {
    const result = cli(root, 'install-viewer', '--from', from, '--source', URL_1);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /linked/);
    assert.equal(fs.existsSync(path.join(root, '.spec', 'design', '_viewer')), false);
  } finally {
    removeLink(link);
  }
});

test('install-viewer over a different build exits 0 and names both stamps', () => {
  const root = tmp('changed');
  const first = viewerSource(tmp('changed-a'), { stamp: STAMP_A });
  const second = viewerSource(tmp('changed-b'), { stamp: STAMP_B });
  const one = cli(root, 'install-viewer', '--from', first, '--source', URL_1);
  assert.equal(one.status, 0);
  assert.doesNotMatch(one.stdout, /VIEWER BUILD CHANGED/);
  const two = cli(root, 'install-viewer', '--from', second, '--source', URL_1);
  assert.equal(two.status, 0, two.stderr);
  assert.match(two.stdout, new RegExp(`VIEWER BUILD CHANGED: ${STAMP_A} -> ${STAMP_B}`));
  const same = cli(root, 'install-viewer', '--from', second, '--source', URL_1);
  assert.doesNotMatch(same.stdout, /VIEWER BUILD CHANGED/);
});

test('an interrupted swap is recovered, even when the install that follows is refused', () => {
  const root = tmp('interrupted');
  const designRoot = path.join(root, '.spec', 'design');
  const old = path.join(designRoot, '_viewer.install-old');
  write(path.join(old, 'index.html'), indexHtml(STAMP_B));
  write(path.join(old, 'artifact-type', 'app.js'), 'old app');
  const empty = tmp('interrupted-empty');
  const refused = cli(root, 'install-viewer', '--from', empty, '--source', URL_1);
  assert.equal(refused.status, 1);
  assert.equal(fs.readFileSync(path.join(designRoot, '_viewer', 'artifact-type', 'app.js'), 'utf8'), 'old app');
  assert.equal(fs.existsSync(old), false);
});

test('a successful install leaves no .install-old or .install-tmp behind', () => {
  const root = tmp('clean');
  const designRoot = path.join(root, '.spec', 'design');
  write(path.join(designRoot, '_viewer.install-old', 'stale.txt'), 'stale');
  write(path.join(designRoot, '_viewer.install-tmp', 'stale.txt'), 'stale');
  const from = viewerSource(tmp('clean-src'));
  assert.equal(cli(root, 'install-viewer', '--from', from, '--source', URL_1).status, 0);
  assert.deepEqual(fs.readdirSync(designRoot), ['_viewer']);
});

test('install-viewer exits 2 for a --source that is not a claude.ai artifact url', () => {
  const root = tmp('badsource');
  const from = viewerSource(tmp('badsource-src'));
  for (const source of ['https://example.com/artifact/abc', 'http://claude.ai/artifact/abc', 'https://claude.ai/artifact/', 'claude.ai/artifact/abc']) {
    assert.equal(cli(root, 'install-viewer', '--from', from, '--source', source).status, 2, source);
  }
  assert.equal(fs.existsSync(path.join(root, '.spec', 'design', '_viewer')), false);
});

// --- view ---

test('view prints the home URL with no feature and the canvas URL with one', async () => {
  const root = tmp('view-url');
  mkViewer(root);
  mkDesign(root, 'a');
  mkDesign(root, 'b');
  const home = await startView(root);
  try { assert.equal(home.pathname, '/'); } finally { await home.stop(); }
  const direct = await startView(root, 'a');
  try { assert.equal(direct.pathname, '/d/a/'); } finally { await direct.stop(); }
});

test('view serves the home page and the design list without the viewer entry', async () => {
  const root = tmp('view-home');
  mkViewer(root);
  mkDesign(root, 'a', ['one', 'two']);
  mkDesign(root, 'b');
  const server = await startView(root);
  try {
    const home = await request(server.port, 'GET', '/');
    assert.equal(home.status, 200);
    assert.match(home.headers['content-type'], /^text\/html/);
    assert.equal(home.headers['cache-control'], 'no-store');
    assert.equal(home.headers['x-content-type-options'], 'nosniff');
    assert.match(home.body.toString(), /__designs\.json/);
    const list = await request(server.port, 'GET', '/__designs.json');
    assert.deepEqual(JSON.parse(list.body.toString()), { designs: [{ name: 'a', boards: 2 }, { name: 'b', boards: 1 }] });
  } finally { await server.stop(); }
});

test('view redirects /d/a and serves the viewer page with the switcher, leaving the disk file alone', async () => {
  const root = tmp('view-index');
  const viewer = mkViewer(root);
  mkDesign(root, 'a');
  const onDisk = fs.readFileSync(path.join(viewer, 'index.html'));
  const server = await startView(root, 'a');
  try {
    const redirect = await request(server.port, 'GET', '/d/a');
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.location, '/d/a/');
    const page = await request(server.port, 'GET', '/d/a/');
    assert.equal(page.status, 200);
    assert.ok(page.body.toString().includes(SWITCHER));
    assert.ok(page.body.toString().indexOf(SWITCHER) < page.body.toString().lastIndexOf('</body>'));
    assert.equal(onDisk.includes(Buffer.from(SWITCHER)), false);
    assert.deepEqual(fs.readFileSync(path.join(viewer, 'index.html')), onDisk);
  } finally { await server.stop(); }
});

test('view serves a viewer page without </body> byte-identical and says so on stderr', async () => {
  const root = tmp('view-nobody');
  const html = '<html><head><meta name="mega-build-stamp" content="' + STAMP_A + '"></head><body><div>unterminated';
  const viewer = mkViewer(root, { html });
  mkDesign(root, 'a');
  const server = await startView(root, 'a');
  try {
    const page = await request(server.port, 'GET', '/d/a/');
    assert.equal(page.status, 200);
    assert.deepEqual(page.body, fs.readFileSync(path.join(viewer, 'index.html')));
    assert.match(server.stderr(), /switcher not injected/);
  } finally { await server.stop(); }
});

test('view serves each design its own files, live, plus viewer files under the feature prefix', async () => {
  const root = tmp('view-files');
  mkViewer(root);
  const featureA = mkDesign(root, 'a', ['one']);
  mkDesign(root, 'b', ['bee']);
  const server = await startView(root, 'a');
  try {
    const filesA = JSON.parse((await request(server.port, 'GET', '/d/a/_files.json')).body.toString());
    const filesB = JSON.parse((await request(server.port, 'GET', '/d/b/_files.json')).body.toString());
    assert.deepEqual(Object.keys(filesA.files), ['project/canvas.json', 'project/one.dc.html']);
    assert.deepEqual(Object.keys(filesB.files), ['project/bee.dc.html', 'project/canvas.json']);

    write(path.join(featureA, 'project', 'two.dc.html'), '<p>new</p>');
    const after = JSON.parse((await request(server.port, 'GET', '/d/a/_files.json')).body.toString());
    assert.ok('project/two.dc.html' in after.files);
    assert.equal(after.files['project/two.dc.html'].sha256, crypto.createHash('sha256').update('<p>new</p>').digest('hex'));

    const canvas = await request(server.port, 'GET', '/d/a/project/canvas.json');
    assert.equal(canvas.status, 200);
    assert.match(canvas.headers['content-type'], /^application\/json/);
    assert.deepEqual(canvas.body, fs.readFileSync(path.join(featureA, 'project', 'canvas.json')));

    const font = await request(server.port, 'GET', '/d/a/artifact-type/fonts/x.woff2');
    assert.equal(font.status, 200);
    assert.equal(font.headers['content-type'], 'font/woff2');
    assert.equal(font.body.toString(), 'FONT');

    assert.equal((await request(server.port, 'GET', '/d/missing/')).status, 404);
    assert.equal((await request(server.port, 'GET', '/d/a/project/')).status, 404);
    assert.equal((await request(server.port, 'GET', '/d/a/project/nope.dc.html')).status, 404);
    assert.equal((await request(server.port, 'GET', '/d/_viewer/')).status, 404);
  } finally { await server.stop(); }
});

test('view rejects raw traversal paths, non-GET methods and foreign Host headers', async () => {
  const root = tmp('view-reject');
  mkViewer(root);
  mkDesign(root, 'a');
  const server = await startView(root, 'a');
  try {
    assert.equal((await request(server.port, 'GET', '/d/a/../../x')).status, 400);
    assert.equal((await request(server.port, 'GET', '/d/a/C:/Windows/win.ini')).status, 400);
    assert.equal((await request(server.port, 'POST', '/d/a/_files.json')).status, 405);
    assert.equal((await request(server.port, 'GET', '/', { Host: `evil.example:${server.port}` })).status, 403);
    assert.equal((await request(server.port, 'GET', '/', { Host: `localhost:${server.port}` })).status, 200);
    assert.equal((await request(server.port, 'HEAD', '/d/a/project/canvas.json')).status, 200);
  } finally { await server.stop(); }
});

test('view does not follow a junction out of the feature directory', async () => {
  const root = tmp('view-escape');
  mkViewer(root);
  const feature = mkDesign(root, 'a');
  const outside = tmp('view-escape-outside');
  write(path.join(outside, 'secret.txt'), 'secret');
  const link = path.join(feature, 'project', 'escape');
  fs.symlinkSync(outside, link, 'junction');
  const server = await startView(root, 'a');
  try {
    assert.equal((await request(server.port, 'GET', '/d/a/project/escape/secret.txt')).status, 404);
    const files = JSON.parse((await request(server.port, 'GET', '/d/a/_files.json')).body.toString());
    assert.equal(Object.keys(files.files).some((k) => k.includes('escape')), false);
  } finally {
    await server.stop();
    removeLink(link);
  }
});

test('view exits 3 with VIEWER NEEDED when no viewer is installed', () => {
  const root = tmp('view-noviewer');
  mkDesign(root, 'a');
  const result = cli(root, 'view', 'a', '--no-open');
  assert.equal(result.status, 3);
  assert.ok(result.stderr.startsWith('VIEWER NEEDED'), result.stderr);
});

test('view exits 1 for an unknown feature or no designs, and 2 for a bad port', () => {
  const root = tmp('view-refuse');
  mkViewer(root);
  const none = cli(root, 'view', '--no-open');
  assert.equal(none.status, 1);
  assert.match(none.stderr, /no designs/);
  mkDesign(root, 'a');
  const missing = cli(root, 'view', 'ghost', '--no-open');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /list/);
  assert.equal(cli(root, 'view', 'a', '--no-open', '--port', '70000').status, 2);
  assert.equal(cli(root, 'view', 'a', '--no-open', '--port', 'abc').status, 2);
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
