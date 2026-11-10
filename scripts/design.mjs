#!/usr/bin/env node
// spec-driven-development — visual designs: list them, install the viewer runtime, view them offline.
// Zero dependencies; needs Node 18 or later (the plugin's hooks already require Node).
//
// A design is a Design-type canvas kept in the repo: the feature directory .spec/design/<feature>/
// is the canvas at its published paths (project/canvas.json and one project/<name>.dc.html per
// board). The viewer runtime is the Design type's fixed files (index.html and artifact-type/**),
// installed once per project into .spec/design/_viewer/ from a canvas the user owns and downloaded
// by the agent. This script only copies and serves those files; it never executes them. Node
// reads nothing but the page and the artifact-type/ tree, and only to copy them.
//
// One local server mounts every design under /d/<feature>/ and answers a home page, a design list
// and the canvas's synthesized _files.json, so an edit shows on a browser reload.
//
// Paths: feature directories resolve in the current worktree (versioned with the branch);
// _viewer/ resolves in the main worktree (an ignored, machine-local cache). --root sets both.
//
// Exit codes: 0 ok, 1 failure (one-line reason on stderr), 2 usage, 3 viewer runtime not installed.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { mainWorktreeRoot, worktreeRoot } from './lib/repo.mjs';

class UsageError extends Error {}
class Failure extends Error {}
class ViewerNeeded extends Error {}

const USAGE = `Usage: node design.mjs <command> [args] [--root <dir>]

  list                                           The installed viewer and every design.
  install-viewer --from <dir> --source <url>     Install the viewer runtime from a downloaded Design
                                                 canvas (index.html and artifact-type/**); <url> is
                                                 that canvas's claude.ai artifact url.
  set-mirror <feature> <url>                     Record the claude.ai artifact a design was published to.
  view [<feature>] [--port <n>] [--no-open]      Serve every design locally; open the home page, or the
                                                 feature's canvas. Runs until Ctrl+C.

Designs live in <worktree>/.spec/design/<feature>/; the viewer in <main worktree>/.spec/design/_viewer/.
--root <dir> sets both.`;

const FEATURE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ARTIFACT_URL = /^https:\/\/claude\.ai\/(code\/)?artifact\/[A-Za-z0-9_-]+$/;
const BOOLEAN_OPTIONS = new Set(['no-open', 'help']);
const VALUE_OPTIONS = new Set(['root', 'from', 'source', 'port']);

// ---------------------------------------------------------------------------
// Pure helpers

// `_viewer`, its `_viewer.install-*` swap directories, `..`, separators and a leading `.` all fail.
export function validFeature(name) {
  return typeof name === 'string' && FEATURE_NAME.test(name);
}

export function buildStamp(indexHtml) {
  const tag = /<meta\b[^>]*\bname\s*=\s*["']mega-build-stamp["'][^>]*>/i.exec(indexHtml);
  if (!tag) return null;
  const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag[0]);
  return content ? content[1] : null;
}

export function hostAllowed(hostHeader, port) {
  if (typeof hostHeader !== 'string') return false;
  const host = hostHeader.toLowerCase();
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

export function contentType(file) {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

// Maps a raw request path to what should answer it. Whether a feature has a directory is the
// server's question, which keeps this pure.
export function route(rawUrlPath) {
  if (typeof rawUrlPath !== 'string') return { kind: 'bad' };
  let decoded;
  try { decoded = decodeURIComponent(rawUrlPath.split(/[?#]/)[0]); } catch (_) { return { kind: 'bad' }; }
  if (decoded.includes('\0') || decoded.includes('\\') || !decoded.startsWith('/')) return { kind: 'bad' };
  if (decoded === '/') return { kind: 'home' };

  const segments = decoded.slice(1).split('/');
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === '..' || segment === '.' || segment.includes(':')) return { kind: 'bad' };
    if (segment === '' && i !== segments.length - 1) return { kind: 'bad' };
  }
  if (segments[segments.length - 1] === '') segments.pop();

  if (segments.length === 1 && segments[0] === '__designs.json') return { kind: 'designs' };
  if (segments[0] !== 'd' || segments.length < 2) return { kind: 'notFound' };

  const feature = segments[1];
  if (!validFeature(feature)) return { kind: 'notFound' };
  const rest = segments.slice(2);
  const trailingSlash = decoded.endsWith('/');
  if (rest.length === 0) return trailingSlash ? { kind: 'featureIndex', feature } : { kind: 'redirect', feature };
  const rel = rest.join('/');
  if (rel === 'index.html') return { kind: 'featureIndex', feature };
  if (rel === '_files.json') return { kind: 'files', feature };
  if (rest[0] === 'artifact-type') return { kind: 'viewerFile', feature, rel };
  return { kind: 'canvasFile', feature, rel };
}

// The switcher is one fixed script: it reads the current feature from the page's own path, lives
// in a Shadow DOM host appended to <html> (outside <body>, so the app's re-renders cannot remove
// it) and fills a <select> from /__designs.json. Nothing from a design is interpolated as markup.
export const SWITCHER = String.raw`<script>
(function () {
  var match = /^\/d\/([^\/]+)\//.exec(location.pathname);
  if (!match) return;
  var current;
  try { current = decodeURIComponent(match[1]); } catch (e) { return; }
  var host = document.createElement('div');
  host.setAttribute('data-design-switcher', '');
  var shadow = host.attachShadow({ mode: 'open' });
  var style = document.createElement('style');
  style.textContent =
    ':host{all:initial;position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647}' +
    'select{font:13px system-ui,sans-serif;padding:4px 8px;border:1px solid #888;border-radius:6px;background:#fff;color:#111;max-width:40vw}';
  var select = document.createElement('select');
  select.setAttribute('aria-label', 'Switch design');
  function fill(names) {
    while (select.firstChild) select.removeChild(select.firstChild);
    names.forEach(function (name) {
      var option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      option.selected = name === current;
      select.appendChild(option);
    });
  }
  fill([current]);
  select.addEventListener('change', function () {
    location.href = '/d/' + encodeURIComponent(select.value) + '/';
  });
  shadow.appendChild(style);
  shadow.appendChild(select);
  document.documentElement.appendChild(host);
  fetch('/__designs.json').then(function (r) { return r.json(); }).then(function (data) {
    var names = (data.designs || []).map(function (d) { return d.name; });
    if (names.indexOf(current) < 0) names.unshift(current);
    fill(names);
  }).catch(function () {});
})();
</script>`;

// Inserts the switcher immediately before the last </body>. A page without one is returned as is.
export function injectSwitcher(html) {
  let last = null;
  for (const match of html.matchAll(/<\/body\s*>/gi)) last = match;
  if (!last) return { html, injected: false };
  return { html: html.slice(0, last.index) + SWITCHER + html.slice(last.index), injected: true };
}

export const HOME_PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Designs</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0 auto; max-width: 40rem; padding: 2rem 1rem; color: #111; background: #fff; }
  @media (prefers-color-scheme: dark) { body { color: #eee; background: #161616; } a { color: #8ab4f8; } }
  li { margin: 0.4rem 0; }
  .boards { color: #777; margin-left: 0.5rem; font-size: 0.9em; }
</style>
</head>
<body>
<h1>Designs</h1>
<ul id="list"></ul>
<p id="empty" hidden>No designs yet</p>
<script>
fetch('/__designs.json').then(function (r) { return r.json(); }).then(function (data) {
  var designs = data.designs || [];
  var list = document.getElementById('list');
  if (designs.length === 0) { document.getElementById('empty').hidden = false; return; }
  designs.forEach(function (design) {
    var item = document.createElement('li');
    var link = document.createElement('a');
    link.href = '/d/' + encodeURIComponent(design.name) + '/';
    link.textContent = design.name;
    item.appendChild(link);
    var boards = document.createElement('span');
    boards.className = 'boards';
    boards.textContent = design.boards === null ? 'canvas.json unreadable' : design.boards + ' board(s)';
    item.appendChild(boards);
    list.appendChild(item);
  });
}).catch(function () { document.getElementById('empty').hidden = false; });
</script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// File system helpers

function lstatOrNull(p) {
  try { return fs.lstatSync(p); } catch (_) { return null; }
}

const isRegularFile = (p) => lstatOrNull(p)?.isFile() === true;
const isRealDirectory = (p) => lstatOrNull(p)?.isDirectory() === true;

function readJsonFile(file) {
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, file);
}

// Every regular file under `dir`, POSIX relative paths, sorted. A link or junction is skipped, or
// refused when `refuseLinks` is set; so is anything that is neither a file nor a directory.
// With `skipVanished`, an entry that disappears between the directory read and its lstat (an
// editor's rename-during-save) is left out; any other error still fails. `io` is the file system
// the walk reads through.
function walkFiles(dir, { refuseLinks = false, skipVanished = false, io = fs } = {}) {
  const found = [];
  const walk = (current, prefix) => {
    let names;
    try {
      names = io.readdirSync(current);
    } catch (error) {
      if (skipVanished && prefix && error.code === 'ENOENT') return;
      throw error;
    }
    for (const name of names) {
      const full = path.join(current, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      let stat;
      try {
        stat = io.lstatSync(full);
      } catch (error) {
        if (skipVanished && error.code === 'ENOENT') continue;
        throw error;
      }
      if (stat.isSymbolicLink()) {
        if (refuseLinks) throw new Failure(`refused: ${rel} is a symlink or junction`);
        continue;
      }
      if (stat.isDirectory()) walk(full, rel);
      else if (stat.isFile()) found.push(rel);
      else if (refuseLinks) throw new Failure(`refused: ${rel} is not a regular file`);
    }
  };
  walk(dir, '');
  return found.sort();
}

// `io` lets a test hand the walk a file system in which an entry vanishes mid-walk.
export function filesListing(featureDir, io = fs) {
  const files = {};
  for (const rel of walkFiles(featureDir, { skipVanished: true, io })) {
    let content;
    try {
      content = io.readFileSync(path.join(featureDir, ...rel.split('/')));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    files[rel] = { sha256: crypto.createHash('sha256').update(content).digest('hex'), bytes: content.length };
  }
  return { files };
}

export function listDesigns(designRoot) {
  let entries;
  try { entries = fs.readdirSync(designRoot, { withFileTypes: true }); } catch (_) { return []; }
  const designs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !validFeature(entry.name)) continue;
    const canvas = path.join(designRoot, entry.name, 'project', 'canvas.json');
    if (!isRegularFile(canvas)) continue;
    let boards = null;
    try {
      const data = readJsonFile(canvas);
      boards = Array.isArray(data?.order) ? data.order.length : 0;
    } catch (_) { /* listed with boards: null */ }
    designs.push({ name: entry.name, boards });
  }
  return designs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Paths and viewer state

function resolvePaths(options) {
  const root = options.root ? path.resolve(options.root) : null;
  const worktree = root ?? worktreeRoot(process.cwd());
  const main = root ?? mainWorktreeRoot(process.cwd());
  return {
    designRoot: path.join(worktree, '.spec', 'design'),
    mainDesignRoot: path.join(main, '.spec', 'design'),
    viewerDir: path.join(main, '.spec', 'design', '_viewer'),
  };
}

const viewerRuntimePresent = (viewerDir) =>
  isRegularFile(path.join(viewerDir, 'index.html')) && isRegularFile(path.join(viewerDir, 'artifact-type', 'app.js'));

// What `list` and `set-mirror` know about an installed viewer: viewer.json when it parses, else
// what the files show. null when there is no viewer at all.
function viewerState(viewerDir) {
  let info = null;
  try { info = readJsonFile(path.join(viewerDir, 'viewer.json')); } catch (_) { /* fall back to the files */ }
  if (!info || typeof info !== 'object') {
    if (!viewerRuntimePresent(viewerDir)) return null;
    info = {};
  }
  let stamp = typeof info.buildStamp === 'string' ? info.buildStamp : null;
  if (stamp === null) {
    try { stamp = buildStamp(fs.readFileSync(path.join(viewerDir, 'index.html'), 'utf8')); } catch (_) { /* unknown */ }
  }
  const format = typeof info.format === 'boolean' ? info.format : isRealDirectory(path.join(viewerDir, 'artifact-type', 'reference'));
  return { stamp, format };
}

function readMirrors(viewerDir) {
  const file = path.join(viewerDir, 'mirrors.json');
  if (!lstatOrNull(file)) return { mirrors: {}, valid: true };
  try {
    const data = readJsonFile(file);
    if (data && typeof data === 'object' && !Array.isArray(data)) return { mirrors: data, valid: true };
  } catch (_) { /* reported below */ }
  return { mirrors: {}, valid: false };
}

// ---------------------------------------------------------------------------
// install-viewer

// On Windows a scanner or indexer can briefly hold a directory and fail a rename with EPERM,
// EBUSY or EACCES; a few short, synchronous retries ride that out.
function renameWithRetry(from, to) {
  const transient = new Set(['EPERM', 'EBUSY', 'EACCES']);
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      if (!transient.has(error.code) || attempt >= 5) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * attempt);
    }
  }
}

function installViewer({ from, source }, { mainDesignRoot, viewerDir }) {
  if (!from || !source) throw new UsageError('Usage: install-viewer --from <dir> --source <url>');
  if (!ARTIFACT_URL.test(source)) throw new UsageError(`--source must be a claude.ai artifact url (https://claude.ai/artifact/<id>), got "${source}".`);

  const tmpDir = path.join(mainDesignRoot, '_viewer.install-tmp');
  const oldDir = path.join(mainDesignRoot, '_viewer.install-old');

  // A previous run may have been interrupted between the two renames of its swap.
  if (!lstatOrNull(viewerDir) && lstatOrNull(oldDir)) fs.renameSync(oldDir, viewerDir);
  else if (lstatOrNull(viewerDir) && lstatOrNull(oldDir)) fs.rmSync(oldDir, { recursive: true, force: true });
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const src = path.resolve(from);
  const problems = [];
  const checkFile = (rel) => {
    const stat = lstatOrNull(path.join(src, ...rel.split('/')));
    if (!stat) problems.push(`${rel} missing`);
    else if (!stat.isFile()) problems.push(`${rel} is not a regular file`);
  };
  checkFile('index.html');
  const runtimeStat = lstatOrNull(path.join(src, 'artifact-type'));
  if (!runtimeStat) problems.push('artifact-type/ missing');
  else if (!runtimeStat.isDirectory()) problems.push('artifact-type/ is not a real directory');
  else checkFile('artifact-type/app.js');
  if (problems.length > 0) throw new Failure(`no viewer runtime in ${src}: ${problems.join(', ')}`);

  const runtimeFiles = walkFiles(path.join(src, 'artifact-type'), { refuseLinks: true });
  const previous = viewerState(viewerDir);

  let stamp;
  let format;
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.copyFileSync(path.join(src, 'index.html'), path.join(tmpDir, 'index.html'));
    for (const rel of runtimeFiles) {
      const target = path.join(tmpDir, 'artifact-type', ...rel.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(src, 'artifact-type', ...rel.split('/')), target);
    }
    format = isRealDirectory(path.join(tmpDir, 'artifact-type', 'reference'));
    stamp = buildStamp(fs.readFileSync(path.join(tmpDir, 'index.html'), 'utf8'));
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '*\n', 'utf8');
    writeJsonFile(path.join(tmpDir, 'viewer.json'), { buildStamp: stamp, format, source, installedAt: new Date().toISOString() });
    const mirrors = path.join(viewerDir, 'mirrors.json');
    if (isRegularFile(mirrors)) fs.copyFileSync(mirrors, path.join(tmpDir, 'mirrors.json'));
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }

  const hadViewer = Boolean(lstatOrNull(viewerDir));
  if (hadViewer) renameWithRetry(viewerDir, oldDir);
  try {
    renameWithRetry(tmpDir, viewerDir);
  } catch (error) {
    if (hadViewer) { try { renameWithRetry(oldDir, viewerDir); } catch (_) { /* recovered by the next install */ } }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
  if (hadViewer) {
    try { fs.rmSync(oldDir, { recursive: true, force: true }); } catch (error) { console.error(`could not remove ${oldDir}: ${error.message}`); }
  }

  const lines = [`viewer installed: build ${stamp ?? 'unknown'}`];
  if (previous && previous.stamp !== stamp) lines.push(`VIEWER BUILD CHANGED: ${previous.stamp ?? 'unknown'} -> ${stamp ?? 'unknown'}`);
  if (!format) lines.push('no authoring format installed (artifact-type/reference/ absent)');
  return lines;
}

// ---------------------------------------------------------------------------
// list and set-mirror

function listCommand({ designRoot, viewerDir }) {
  const lines = [];
  const state = viewerState(viewerDir);
  lines.push(state ? `viewer: build ${state.stamp ?? 'unknown'}, format ${state.format ? 'installed' : 'absent'} at ${viewerDir}` : 'viewer: not installed');
  const { mirrors, valid } = readMirrors(viewerDir);
  const designs = listDesigns(designRoot);
  if (designs.length === 0) lines.push('no designs under .spec/design/');
  for (const design of designs) {
    const url = Object.hasOwn(mirrors, design.name) && typeof mirrors[design.name] === 'string' ? mirrors[design.name] : null;
    const boards = design.boards === null ? 'canvas.json unreadable' : `${design.boards} board(s)`;
    lines.push(`${design.name}: ${boards}${url ? ` - mirror ${url}` : ''}`);
  }
  if (!valid) lines.push('warning: _viewer/mirrors.json is not a valid JSON object; mirrors are not shown');
  return lines;
}

function setMirror(args, { viewerDir }) {
  const [feature, url] = args;
  if (!feature || !url) throw new UsageError('Usage: set-mirror <feature> <url>');
  if (!validFeature(feature)) throw new UsageError(`"${feature}" is not a valid feature name.`);
  if (!ARTIFACT_URL.test(url)) throw new UsageError(`"${url}" is not a claude.ai artifact url (https://claude.ai/artifact/<id>).`);
  if (!viewerState(viewerDir)) throw new ViewerNeeded(`VIEWER NEEDED: no viewer at ${viewerDir}; install it first (mirrors.json lives there)`);
  const { mirrors, valid } = readMirrors(viewerDir);
  if (!valid) throw new Failure(`${path.join(viewerDir, 'mirrors.json')} is not a valid JSON object; fix or delete it first`);
  mirrors[feature] = url;
  writeJsonFile(path.join(viewerDir, 'mirrors.json'), mirrors);
  return [`Recorded the mirror of ${feature}: ${url}`];
}

// ---------------------------------------------------------------------------
// view

const COMMON_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function respond(req, res, status, type, body, extra) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body ?? '', 'utf8');
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': buffer.length, ...COMMON_HEADERS, ...extra });
  res.end(req.method === 'HEAD' ? undefined : buffer);
}

const respondText = (req, res, status, text, extra) => respond(req, res, status, 'text/plain; charset=utf-8', text, extra);

// The real path of a regular file below `root`, or null. Containment is judged on resolved real
// paths, so a symlink or junction inside a root cannot lead out of it.
function resolveInside(root, rel) {
  try {
    const realRoot = fs.realpathSync.native(root);
    const real = fs.realpathSync.native(path.join(realRoot, ...rel.split('/')));
    if (!real.startsWith(realRoot + path.sep)) return null;
    return fs.statSync(real).isFile() ? real : null;
  } catch (_) {
    return null;
  }
}

function sendFile(req, res, real, name) {
  let size;
  try { size = fs.statSync(real).size; } catch (_) { respondText(req, res, 404, 'Not found'); return; }
  const headers = { 'Content-Type': contentType(name), 'Content-Length': size, ...COMMON_HEADERS };
  if (req.method === 'HEAD') { res.writeHead(200, headers); res.end(); return; }
  const stream = fs.createReadStream(real);
  stream.once('open', () => { res.writeHead(200, headers); stream.pipe(res); });
  stream.on('error', () => {
    if (res.headersSent) res.destroy();
    else respondText(req, res, 500, 'Could not read the file');
  });
  res.on('close', () => stream.destroy());
}

function makeHandler({ designRoot, viewerDir, getPort }) {
  let warnedNoBody = false;
  return (req, res) => {
    try {
      if (!hostAllowed(req.headers.host, getPort())) { respondText(req, res, 403, 'Forbidden'); return; }
      if (req.method !== 'GET' && req.method !== 'HEAD') { respondText(req, res, 405, 'Method not allowed', { Allow: 'GET, HEAD' }); return; }
      const target = route(req.url);
      switch (target.kind) {
        case 'bad': respondText(req, res, 400, 'Bad request'); return;
        case 'notFound': respondText(req, res, 404, 'Not found'); return;
        case 'home': respond(req, res, 200, 'text/html; charset=utf-8', HOME_PAGE); return;
        case 'designs':
          respond(req, res, 200, 'application/json; charset=utf-8', JSON.stringify({ designs: listDesigns(designRoot) }));
          return;
      }
      const featureDir = path.join(designRoot, target.feature);
      if (!isRealDirectory(featureDir)) { respondText(req, res, 404, 'Not found'); return; }
      switch (target.kind) {
        case 'redirect':
          respondText(req, res, 302, '', { Location: `/d/${encodeURIComponent(target.feature)}/` });
          return;
        case 'files':
          respond(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(filesListing(featureDir)));
          return;
        case 'featureIndex': {
          const real = resolveInside(viewerDir, 'index.html');
          if (!real) { respondText(req, res, 404, 'Not found'); return; }
          const original = fs.readFileSync(real);
          const result = injectSwitcher(original.toString('utf8'));
          if (!result.injected && !warnedNoBody) {
            warnedNoBody = true;
            console.error('switcher not injected: no </body> in _viewer/index.html');
          }
          respond(req, res, 200, 'text/html; charset=utf-8', result.injected ? Buffer.from(result.html, 'utf8') : original);
          return;
        }
        case 'viewerFile':
        case 'canvasFile': {
          const real = resolveInside(target.kind === 'viewerFile' ? viewerDir : featureDir, target.rel);
          if (!real) { respondText(req, res, 404, 'Not found'); return; }
          sendFile(req, res, real, target.rel);
          return;
        }
        default:
          respondText(req, res, 404, 'Not found');
      }
    } catch (_) {
      if (res.headersSent) res.destroy();
      else respondText(req, res, 500, 'Internal error');
    }
  };
}

function openBrowser(url) {
  const hint = () => console.log(`Open ${url} in a browser`);
  try {
    let child;
    if (process.platform === 'win32') {
      child = spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
    } else {
      child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' });
    }
    child.on('error', hint);
    child.unref();
  } catch (_) {
    hint();
  }
}

function parsePort(value) {
  if (value === undefined) return 0;
  if (!/^\d+$/.test(value) || Number(value) > 65535) throw new UsageError(`--port must be an integer from 0 to 65535, got "${value}".`);
  return Number(value);
}

function viewCommand(args, options, { designRoot, viewerDir }) {
  const [feature] = args;
  if (!viewerRuntimePresent(viewerDir)) {
    throw new ViewerNeeded(`VIEWER NEEDED: no offline viewer at ${viewerDir}; install it from any Design canvas you own`);
  }
  if (feature !== undefined && !validFeature(feature)) throw new UsageError(`"${feature}" is not a valid feature name.`);
  const requestedPort = parsePort(options.port);
  const designs = listDesigns(designRoot);
  if (designs.length === 0) throw new Failure('no designs under .spec/design/');
  if (feature !== undefined && !designs.some((d) => d.name === feature)) {
    throw new Failure(`no design "${feature}" (needs .spec/design/${feature}/project/canvas.json); run \`list\` to see the designs`);
  }

  // Resolves never: the server runs until a signal ends the process.
  return new Promise((_resolve, reject) => {
    let port = 0;
    const server = http.createServer(makeHandler({ designRoot, viewerDir, getPort: () => port }));
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') reject(new Failure(`port ${requestedPort} is already in use`));
      else reject(new Failure(`could not start the server: ${error.message}`));
    });
    server.listen(requestedPort, '127.0.0.1', () => {
      port = server.address().port;
      const url = `http://127.0.0.1:${port}${feature === undefined ? '/' : `/d/${encodeURIComponent(feature)}/`}`;
      console.log(`Design viewer at ${url} (Ctrl+C to stop)`);
      if (!options['no-open']) openBrowser(url);
    });
    const stop = () => {
      server.close();
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      process.exit(0);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const name = arg.slice(2);
    if (BOOLEAN_OPTIONS.has(name)) { options[name] = true; continue; }
    if (!VALUE_OPTIONS.has(name)) throw new UsageError(`Unknown option --${name}.`);
    if (i + 1 >= argv.length) throw new UsageError(`Option --${name} needs a value.`);
    options[name] = argv[++i];
  }
  return { positional, options };
}

async function main(argv) {
  const { positional, options } = parseArgs(argv);
  const [command, ...args] = positional;
  if (options.help || command === 'help') { console.log(USAGE); return 0; }
  if (!command) throw new UsageError('Missing command. Run with --help for usage.');
  const paths = resolvePaths(options);

  switch (command) {
    case 'list':
      console.log(listCommand(paths).join('\n'));
      return 0;
    case 'install-viewer':
      console.log(installViewer(options, paths).join('\n'));
      return 0;
    case 'set-mirror':
      console.log(setMirror(args, paths).join('\n'));
      return 0;
    case 'view':
      return viewCommand(args, options, paths);
    default:
      throw new UsageError(`Unknown command "${command}". Run with --help for usage.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof ViewerNeeded) { console.error(error.message); process.exitCode = 3; }
    else if (error instanceof UsageError) { console.error(`error: ${error.message}`); process.exitCode = 2; }
    else if (error instanceof Failure) { console.error(error.message); process.exitCode = 1; }
    else { console.error(error?.message ?? String(error)); process.exitCode = 1; }
  }
}
