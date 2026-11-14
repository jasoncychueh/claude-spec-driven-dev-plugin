#!/usr/bin/env node
// spec-driven-development — the planning board: a ticket registry and a roadmap tree.
// Zero dependencies; needs Node 18 or later (the plugin's hooks already require Node).
//
// Two JSON stores, normalized like two tables joined by id:
//   .spec/backlog/backlog.json  - every ticket's record: id, title, type, date, source,
//                                 feature, claim, and — once it is closed — how it closed.
//                                 Records are never deleted; closing adds a `closed` field.
//   .spec/roadmap/roadmap.json  - structure only: the tree of work, its scheduling status,
//                                 order and dependencies. Nodes reference tickets by id.
// The unsorted basket is not a third store but a query: live tickets no node references.
// `promote` adds a reference; it never moves or copies a record, so nothing a ticket carries
// can be lost on the way onto the tree, and a finished node's tickets stay resolvable forever.
//
// Long-form content — the problem, the context, the discussion conclusions — lives in one
// Markdown body per ticket, with no frontmatter: .spec/backlog/<id>-<slug>.md while the ticket
// is live, .spec/backlog/archive/ once it is closed.
//
// Every command reads and writes the MAIN worktree's copy, resolved through git, so a session
// inside a linked worktree still edits the one shared board rather than its stale branch copy.
// Every command validates both stores and every cross-reference first, and an edit that would
// leave any problem behind is refused without saving.
//
// A command that writes holds an exclusive lock (.spec/.board.lock) for its whole
// read-validate-write, so concurrent sessions queue rather than overwrite each other; each JSON
// store is replaced atomically (temp file + rename). Read-only commands take no lock.
//
// Ordering on the tree:
//   ordinal    - the order we want; smaller first, equal means "can run in parallel".
//                A node without one takes its parent's. Ties break by depth, then tree position.
//   dependsOn  - nodes that must be finished first. A node also waits for whatever its
//                ancestors wait for.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { mainWorktreeRoot } from './lib/repo.mjs';

// ---------------------------------------------------------------------------
// Vocabulary

const WORK_STATUS = {
  done: { icon: '✅', label: 'done' },
  active: { icon: '🔄', label: 'in progress' },
  planned: { icon: '⏳', label: 'planned' },
  unplanned: { icon: '❌', label: 'unplanned' },
};
const QUESTION_STATUS = {
  decided: { icon: '●', label: 'decided' },
  open: { icon: '○', label: 'open' },
  ruling: { icon: '◇', label: 'awaiting ruling' },
  proposed: { icon: '◆', label: 'proposed' },
};
const ALL_STATUS = { ...WORK_STATUS, ...QUESTION_STATUS };
const FINISHED = new Set(['done', 'decided']);
const UNSETTLED_QUESTION = new Set(['open', 'ruling', 'proposed']);

const ROOT_KEYS = ['title', 'intro', 'now', 'children'];
const NODE_KEYS = ['id', 'title', 'status', 'tickets', 'spec', 'ordinal', 'dependsOn', 'updated', 'summary', 'detail', 'notes', 'children'];
const NODE_SETTABLE = ['status', 'ordinal', 'title', 'summary', 'detail', 'spec', 'dependsOn', 'updated'];

const TICKET_KEYS = ['id', 'title', 'type', 'date', 'source', 'feature', 'claim', 'closed', 'legacy'];
const TICKET_SETTABLE = ['title', 'type', 'source', 'feature'];
const CLAIM_KEYS = ['date', 'branch', 'note'];
const CLOSED_KEYS = ['status', 'date', 'resolution'];
const CLOSED_STATUS = ['done', 'dropped'];

const ROOT_ID = 'root';
const NODE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const TICKET_ID = /^bl-[0-9a-f]{6}$/;
const TYPE_NAME = /^[a-z][a-z-]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const BOOLEAN_OPTIONS = new Set(['all', 'closed', 'full', 'force', 'help', 'done']);

// The options each command takes (besides --root and --help, which every command takes).
// Anything else is a usage error, so a typo such as --brnach cannot silently become a default.
const NODE_OPTIONS = ['status', 'ordinal', 'depends', 'summary', 'detail', 'spec', 'before'];
const COMMAND_OPTIONS = {
  'check': [],
  'backlog list': ['all', 'closed'],
  'backlog show': [],
  'backlog add': ['type', 'source', 'feature', 'slug'],
  'backlog claim': ['branch', 'note', 'force'],
  'backlog release': [],
  'backlog set': [],
  'backlog close': ['resolution'],
  'backlog drop': ['resolution'],
  'promote': [...NODE_OPTIONS, 'title', 'into'],
  'demote': [],
  'roadmap init': [],
  'roadmap show': ['full', 'done'],
  'roadmap next': ['all'],
  'roadmap root': [],
  'roadmap set': [],
  'roadmap add': [...NODE_OPTIONS, 'tickets'],
  'roadmap move': ['before'],
  'roadmap rename': [],
  'roadmap remove': ['force'],
  'roadmap finish': ['resolution'],
  'roadmap note': [],
  'roadmap render': ['out'],
  'roadmap format': [],
};

const LOCK_TIMEOUT_MS = 10_000;
const STALE_LOCK_MS = 60_000;

class UsageError extends Error {}
class RefusedError extends Error {} // a deliberate refusal the caller must act on (e.g. an existing claim)
class LockError extends Error {} // another command held the board's lock for longer than LOCK_TIMEOUT_MS

const USAGE = `Usage: node board.mjs <area> <command> [args] [--root <projectDir>]

Backlog — the ticket registry
  backlog list [--all | --closed]                The basket: live tickets on no roadmap node, oldest
                                                 first. --all: every live ticket. --closed: closed ones.
  backlog show <id>                              A ticket's record, where it sits, and its body path.
  backlog add <title> --type <t> --source <s> [--feature f] [--slug s]
                                                 Record a ticket; prints the body file to fill in.
  backlog claim <id> [--branch b] [--note n] [--force]
                                                 Mark a basket ticket as being worked on. Refuses
                                                 (exit 3) if someone else holds it, unless --force;
                                                 re-claiming keeps the fields not passed.
  backlog release <id>                           Drop a claim.
  backlog set <id> <field> <value>               Fields: ${TICKET_SETTABLE.join(', ')}. "-" clears feature.
                                                 resolution: a closed ticket's, e.g. after a commit hash changed.
  backlog close <id> --resolution <text>         Done without scheduling: closed, body to archive/.
  backlog drop <id> --resolution <text>          Not doing it: closed as dropped, body to archive/.

Promote — put a basket ticket on the tree (adds a reference; the record is untouched)
  promote <id> <parentNodeId> <newNodeId> [--title t] [--status s] [--ordinal n] [--depends a,b]
          [--summary text] [--detail text] [--spec name] [--before siblingId]
  promote <id> --into <nodeId>                   Attach to an existing node instead.
  demote <id>                                    Take an open ticket off its node, back to the basket. To move
                                                 it to another node: demote, then promote --into.

Roadmap — the scheduled tree
  roadmap init <title>                           Create an empty roadmap.
  roadmap show [id] [--full] [--done]            Print the tree (or one branch). Finished parts fold to one
                                                 line unless --done.
  roadmap next [--all]                           Work that can start now; --all lists every ordered item.
  roadmap root [title|intro|now] [paragraph...]  Print the root, or replace one of its fields. intro and now take
                                                 one argument per paragraph; "-" clears them.
  roadmap set <id> <field> <value>               Fields: ${NODE_SETTABLE.join(', ')}. "-" clears.
                                                 dependsOn takes a comma-separated list; tickets arrive only via promote.
  roadmap add <parentId> <id> <title> [--status s] [--ordinal n] [--depends a,b]
              [--summary text] [--detail text] [--spec name] [--before siblingId]
  roadmap move <id> <newParentId> [--before siblingId]
                                                 Re-parent or reorder; the root's id is "root".
  roadmap rename <id> <newId>                    Change a node's id; every dependsOn on it follows.
  roadmap remove <id> [--force]                  An unfinished branch only. --force is required when the node
                                                 has children or tickets; its live tickets return to the basket.
  roadmap finish <id> --resolution <text>        Mark a work item done: its tickets close, bodies go to
                                                 archive/, settled question nodes fold away, the node stays.
  roadmap note <id> <text>                       Append a history note.
  roadmap render [--out <path>]                  Markdown view to stdout (or a file outside .spec/backlog/).
                                                 Not meant to be committed.
  roadmap format                                 Rewrite roadmap.json in canonical key order.

Whole board
  check                                          Validate both stores and their cross-references.

The board lives under the main worktree of the git repository containing the current directory.
--root <dir> points it somewhere else explicitly.

Exit codes: 0 ok; 1 not saved (the board or the change failed validation, or the board stayed
locked by another command for ${LOCK_TIMEOUT_MS / 1000} s); 2 usage error; 3 refused (a claim is held, or finish found
unfinished parts).`;

// ---------------------------------------------------------------------------
// Paths

function boardPaths(root) {
  const backlogDir = path.join(root, '.spec', 'backlog');
  return {
    root,
    backlogDir,
    backlogJson: path.join(backlogDir, 'backlog.json'),
    archiveDir: path.join(backlogDir, 'archive'),
    roadmapJson: path.join(root, '.spec', 'roadmap', 'roadmap.json'),
    lock: path.join(root, '.spec', '.board.lock'),
  };
}

// Body files are "<id>.md" or "<id>-<slug>.md", live in .spec/backlog/ or closed in archive/.
// `view` lets validation see the files an edit is about to create or remove, so a change is
// checked as it will be on disk without writing anything first.
const BODY_NAME = /^bl-.*\.md$/;
const bodyId = (name) => (name.match(/^(bl-[0-9a-f]{6})(?:-.*)?\.md$/) ?? [])[1];

function bodyFiles(dir, view) {
  let names;
  try { names = fs.readdirSync(dir); } catch (_) { names = []; }
  if (view) {
    names = names.filter((n) => !view.removed.has(path.join(dir, n)));
    for (const f of view.added) if (path.dirname(f) === dir && !names.includes(path.basename(f))) names.push(path.basename(f));
  }
  return names.filter((n) => BODY_NAME.test(n));
}

// Every body file of a ticket: normally one; two means a move was interrupted.
function findBodies(paths, id, view) {
  const found = [];
  for (const [dir, archived] of [[paths.backlogDir, false], [paths.archiveDir, true]]) {
    for (const name of bodyFiles(dir, view)) if (bodyId(name) === id) found.push({ file: path.join(dir, name), archived });
  }
  return found;
}

function findBody(paths, id, view) {
  const found = findBodies(paths, id, view);
  return found.find((b) => !b.archived) ?? found[0] ?? null;
}

// ---------------------------------------------------------------------------
// Loading and saving

function readJson(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return undefined; }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try { return JSON.parse(text); } catch (error) { throw new UsageError(`${file} is not valid JSON: ${error.message}`); }
}

const sleeper = new Int32Array(new SharedArrayBuffer(4));
const sleep = (ms) => Atomics.wait(sleeper, 0, 0, ms);
const BUSY = new Set(['EEXIST', 'EPERM', 'EACCES', 'EBUSY']); // Windows reports a contended file as EPERM/EBUSY

// Written to a temp file beside the target and renamed over it, so a reader or a crash sees
// either the old store or the new one, never half of one.
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(temp, file); return; } catch (error) {
      if (!BUSY.has(error.code) || attempt >= 20) { fs.rmSync(temp, { force: true }); throw error; }
      sleep(25);
    }
  }
}

// ---------------------------------------------------------------------------
// The board lock

// Held for a writing command's whole read-validate-write. Returns the release function.
function acquireLock(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const token = `${process.pid} ${crypto.randomBytes(8).toString('hex')} ${new Date().toISOString()}\n`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let delay = 5;
  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      try { fs.writeSync(fd, token); } finally { fs.closeSync(fd); }
      return () => {
        try { if (fs.readFileSync(file, 'utf8') === token) fs.rmSync(file, { force: true }); } catch (_) { /* already gone */ }
      };
    } catch (error) {
      if (!BUSY.has(error.code)) throw error;
    }
    if (removeStaleLock(file)) continue;
    if (Date.now() >= deadline) {
      throw new LockError(`the board is locked by another command: ${file}. If no board command is running, delete that file and retry.`);
    }
    sleep(delay + Math.floor(Math.random() * delay));
    delay = Math.min(delay * 2, 100);
  }
}

// A lock older than STALE_LOCK_MS belongs to a command that died. It is renamed aside before it
// is deleted, so of two processes that both find it stale only one removes it; if what was
// renamed turns out to be fresh (a new holder got in between), it is put back.
function removeStaleLock(file) {
  let age;
  try { age = Date.now() - fs.statSync(file).mtimeMs; } catch (_) { return true; } // released meanwhile: retry now
  if (age <= STALE_LOCK_MS) return false;
  const grave = `${file}.${process.pid}.stale`;
  try { fs.renameSync(file, grave); } catch (_) { return true; }
  try {
    if (Date.now() - fs.statSync(grave).mtimeMs <= STALE_LOCK_MS) fs.linkSync(grave, file);
  } catch (_) { /* the original is back, or someone else holds a new lock */ }
  fs.rmSync(grave, { force: true });
  return true;
}

function ordered(obj, keys) {
  const out = {};
  for (const key of keys) if (obj[key] !== undefined) out[key] = obj[key];
  return out;
}

function saveBacklog(file, backlog) {
  const tickets = [...backlog.tickets]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))
    .map((t) => {
      const out = ordered(t, TICKET_KEYS);
      if (out.claim) out.claim = ordered(out.claim, CLAIM_KEYS);
      if (out.closed) out.closed = ordered(out.closed, CLOSED_KEYS);
      return out;
    });
  writeJson(file, { tickets });
}

function normalizeNode(node) {
  const result = {};
  for (const key of NODE_KEYS) {
    if (node[key] === undefined) continue;
    result[key] = key === 'children' ? node.children.map(normalizeNode) : node[key];
  }
  return result;
}

function saveRoadmap(file, data) {
  const result = {};
  for (const key of ROOT_KEYS) {
    if (data[key] === undefined) continue;
    result[key] = key === 'children' ? data.children.map(normalizeNode) : data[key];
  }
  writeJson(file, result);
}

// ---------------------------------------------------------------------------
// Tree index and relations

function indexTree(data) {
  const entries = new Map();
  const list = [];
  const root = { node: { id: ROOT_ID, title: data.title, children: data.children }, parent: null, depth: 0, order: -1 };
  entries.set(ROOT_ID, root);
  let order = 0;
  const walk = (children, parent, depth) => {
    if (!Array.isArray(children)) return;
    for (const node of children) {
      const entry = { node, parent, depth, order: order++ };
      list.push(entry);
      if (node && typeof node.id === 'string' && !entries.has(node.id)) entries.set(node.id, entry);
      walk(node?.children, entry, depth + 1);
    }
  };
  walk(data.children, root, 1);
  return { entries, list, root };
}

function requireNode(index, id) {
  const entry = index.entries.get(id);
  if (!entry) throw new UsageError(`No roadmap node with id "${id}".`);
  return entry;
}

function isAncestor(candidate, entry) {
  for (let e = entry.parent; e; e = e.parent) if (e === candidate) return true;
  return false;
}

function effectiveOrdinal(entry) {
  for (let e = entry; e && e.node.id !== ROOT_ID; e = e.parent) if (Number.isInteger(e.node.ordinal)) return e.node.ordinal;
  return null;
}

function effectiveDependencies(entry) {
  const ids = [];
  for (let e = entry; e && e.node.id !== ROOT_ID; e = e.parent) {
    for (const id of e.node.dependsOn ?? []) if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function pendingDependencies(entry, index, ownOnly = false) {
  const ids = ownOnly ? entry.node.dependsOn ?? [] : effectiveDependencies(entry);
  return ids.map((id) => index.entries.get(id)).filter((dep) => dep && !FINISHED.has(dep.node.status));
}

const referenceLabel = (node) => node.tickets?.[0] ?? node.id;

function unsettledQuestionCount(node) {
  let count = 0;
  for (const child of node.children ?? []) {
    if (UNSETTLED_QUESTION.has(child.status)) count++;
    count += unsettledQuestionCount(child);
  }
  return count;
}

function compareWork(a, b) {
  return effectiveOrdinal(a) - effectiveOrdinal(b) || a.depth - b.depth || a.order - b.order;
}

function orderedOpenWork(index) {
  const open = index.list.filter((e) => e.node.status in WORK_STATUS && e.node.status !== 'done');
  const orderedWork = open.filter((e) => effectiveOrdinal(e) !== null).sort(compareWork);
  return { ordered: orderedWork, unorderedCount: open.length - orderedWork.length };
}

// ---------------------------------------------------------------------------
// Ticket queries

// Which node references each ticket. A ticket is on at most one node (validated).
function ticketHolders(roadmap) {
  const holders = new Map();
  if (!roadmap) return holders;
  for (const entry of indexTree(roadmap).list) for (const t of entry.node.tickets ?? []) if (!holders.has(t)) holders.set(t, entry);
  return holders;
}

const isLive = (ticket) => ticket.closed === undefined;

// ---------------------------------------------------------------------------
// Validation (backlog side and cross-references)

const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

function validateBacklog(backlog) {
  if (!backlog || typeof backlog !== 'object' || Array.isArray(backlog)) return ['backlog.json must be a JSON object.'];
  const errors = [];
  for (const key of Object.keys(backlog)) if (key !== 'tickets') errors.push(`backlog.json has unknown key "${key}".`);
  if (!Array.isArray(backlog.tickets)) return [...errors, 'backlog.json "tickets" must be an array.'];
  const seen = new Set();
  backlog.tickets.forEach((t, i) => {
    const where = `ticket ${t && typeof t.id === 'string' ? `"${t.id}"` : `#${i}`}`;
    if (!t || typeof t !== 'object' || Array.isArray(t)) { errors.push(`${where}: must be a JSON object.`); return; }
    for (const key of Object.keys(t)) if (!TICKET_KEYS.includes(key)) errors.push(`${where}: unknown key "${key}".`);
    if (typeof t.id !== 'string' || !TICKET_ID.test(t.id)) errors.push(`${where}: "id" must match ${TICKET_ID}.`);
    else if (seen.has(t.id)) errors.push(`${where}: duplicate id.`);
    else seen.add(t.id);
    if (!nonEmpty(t.title)) errors.push(`${where}: "title" must be a non-empty string.`);
    if (typeof t.type !== 'string' || !TYPE_NAME.test(t.type)) errors.push(`${where}: "type" must match ${TYPE_NAME}.`);
    if (typeof t.date !== 'string' || !DATE.test(t.date)) errors.push(`${where}: "date" must look like YYYY-MM-DD.`);
    if (!nonEmpty(t.source)) errors.push(`${where}: "source" must be a non-empty string.`);
    if (t.feature !== undefined && !nonEmpty(t.feature)) errors.push(`${where}: "feature" must be a non-empty string.`);
    if (t.claim !== undefined) {
      const c = t.claim;
      if (!c || typeof c !== 'object' || Array.isArray(c)) errors.push(`${where}: "claim" must be an object.`);
      else {
        for (const key of Object.keys(c)) if (!CLAIM_KEYS.includes(key)) errors.push(`${where}: claim has unknown key "${key}".`);
        if (typeof c.date !== 'string' || !DATE.test(c.date)) errors.push(`${where}: claim "date" must look like YYYY-MM-DD.`);
        if (!nonEmpty(c.branch)) errors.push(`${where}: claim "branch" must be a non-empty string (use "TBD").`);
        if (!nonEmpty(c.note)) errors.push(`${where}: claim "note" must say what is being done.`);
      }
      if (t.closed !== undefined) errors.push(`${where}: a closed ticket cannot hold a claim.`);
    }
    if (t.closed !== undefined) {
      const c = t.closed;
      if (!c || typeof c !== 'object' || Array.isArray(c)) errors.push(`${where}: "closed" must be an object.`);
      else {
        for (const key of Object.keys(c)) if (!CLOSED_KEYS.includes(key)) errors.push(`${where}: closed has unknown key "${key}".`);
        if (!CLOSED_STATUS.includes(c.status)) errors.push(`${where}: closed "status" must be ${CLOSED_STATUS.join(' or ')}.`);
        if (c.date !== undefined && !(typeof c.date === 'string' && DATE.test(c.date))) errors.push(`${where}: closed "date" must look like YYYY-MM-DD.`);
        if (!nonEmpty(c.resolution)) errors.push(`${where}: closed "resolution" must say where it landed or why not.`);
      }
    }
    if (t.legacy !== undefined) {
      const l = t.legacy;
      if (!l || typeof l !== 'object' || Array.isArray(l) || !Object.values(l).every((v) => typeof v === 'string')) {
        errors.push(`${where}: "legacy" must be an object of strings (fields carried over from the old layout).`);
      }
    }
  });
  return errors;
}

function describeNode(entry) {
  const id = entry.node && typeof entry.node.id === 'string' ? entry.node.id : `#${entry.order}`;
  return `roadmap node "${id}"`;
}

function validateRoadmap(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['roadmap.json must be a JSON object.'];
  const errors = [];
  for (const key of Object.keys(data)) if (!ROOT_KEYS.includes(key)) errors.push(`roadmap root has unknown key "${key}".`);
  if (!nonEmpty(data.title)) errors.push('roadmap root "title" must be a non-empty string.');
  for (const key of ['intro', 'now']) if (data[key] !== undefined && !isStringArray(data[key])) errors.push(`roadmap root "${key}" must be an array of strings.`);
  if (!Array.isArray(data.children)) return [...errors, 'roadmap root "children" must be an array.'];

  const index = indexTree(data);
  const seen = new Set();
  for (const entry of index.list) {
    const node = entry.node;
    const where = describeNode(entry);
    if (!node || typeof node !== 'object' || Array.isArray(node)) { errors.push(`${where}: must be a JSON object.`); continue; }
    for (const key of Object.keys(node)) if (!NODE_KEYS.includes(key)) errors.push(`${where}: unknown key "${key}".`);
    if (typeof node.id !== 'string' || !NODE_ID.test(node.id)) errors.push(`${where}: "id" must match ${NODE_ID}.`);
    else if (node.id === ROOT_ID) errors.push(`${where}: the id "${ROOT_ID}" is reserved.`);
    else if (seen.has(node.id)) errors.push(`${where}: duplicate id.`);
    else seen.add(node.id);
    if (!nonEmpty(node.title)) errors.push(`${where}: "title" must be a non-empty string.`);
    if (node.status !== undefined && !(node.status in ALL_STATUS)) errors.push(`${where}: unknown status "${node.status}". Allowed: ${Object.keys(ALL_STATUS).join(', ')}.`);
    if (node.ordinal !== undefined && !(Number.isInteger(node.ordinal) && node.ordinal >= 0)) errors.push(`${where}: "ordinal" must be a non-negative integer.`);
    for (const key of ['spec', 'summary', 'detail']) if (node[key] !== undefined && !nonEmpty(node[key])) errors.push(`${where}: "${key}" must be a non-empty string.`);
    if (node.updated !== undefined && !(typeof node.updated === 'string' && DATE.test(node.updated))) errors.push(`${where}: "updated" must look like YYYY-MM-DD.`);
    if (node.tickets !== undefined) {
      if (!isStringArray(node.tickets)) errors.push(`${where}: "tickets" must be an array of strings.`);
      else for (const t of node.tickets) if (!TICKET_ID.test(t)) errors.push(`${where}: ticket "${t}" must match ${TICKET_ID}.`);
    }
    if (node.notes !== undefined && !isStringArray(node.notes)) errors.push(`${where}: "notes" must be an array of strings.`);
    if (node.children !== undefined && !Array.isArray(node.children)) errors.push(`${where}: "children" must be an array.`);
    if (node.dependsOn !== undefined) {
      if (!isStringArray(node.dependsOn)) errors.push(`${where}: "dependsOn" must be an array of strings.`);
      else if (new Set(node.dependsOn).size !== node.dependsOn.length) errors.push(`${where}: "dependsOn" lists the same node twice.`);
    }
  }
  if (errors.length > 0) return errors;

  for (const entry of index.list) {
    const where = describeNode(entry);
    for (const depId of entry.node.dependsOn ?? []) {
      const dep = depId === ROOT_ID ? undefined : index.entries.get(depId);
      if (!dep) { errors.push(`${where}: depends on "${depId}", which does not exist.`); continue; }
      if (dep === entry) { errors.push(`${where}: depends on itself.`); continue; }
      if (isAncestor(dep, entry) || isAncestor(entry, dep)) errors.push(`${where}: depends on "${depId}", which is its own ancestor or descendant.`);
      if (dep.node.status === undefined) errors.push(`${where}: depends on "${depId}", which is a grouping node without a status.`);
      const own = effectiveOrdinal(entry);
      const other = effectiveOrdinal(dep);
      if (own !== null && other === null) errors.push(`${where}: has ordinal ${own} but its dependency "${depId}" has none.`);
      if (own !== null && other !== null && other >= own) errors.push(`${where}: ordinal ${own} must be greater than the ordinal ${other} of its dependency "${depId}".`);
    }
  }

  const state = new Map();
  const visit = (id, stack) => {
    state.set(id, 'visiting');
    stack.push(id);
    for (const depId of index.entries.get(id).node.dependsOn ?? []) {
      if (!index.entries.has(depId) || depId === ROOT_ID) continue;
      if (state.get(depId) === 'visiting') errors.push(`Dependency cycle: ${[...stack.slice(stack.indexOf(depId)), depId].join(' -> ')}.`);
      else if (!state.has(depId)) visit(depId, stack);
    }
    stack.pop();
    state.set(id, 'done');
  };
  for (const entry of index.list) if (!state.has(entry.node.id)) visit(entry.node.id, []);
  return errors;
}

// The rules that keep the two tables joined correctly.
function validateCross(board, view) {
  const errors = [];
  const byId = new Map(board.backlog.tickets.map((t) => [t.id, t]));
  const holders = new Map();
  if (board.roadmap) {
    for (const entry of indexTree(board.roadmap).list) {
      for (const id of entry.node.tickets ?? []) {
        const t = byId.get(id);
        if (!t) { errors.push(`roadmap node "${entry.node.id}": ticket "${id}" is not in backlog.json.`); continue; }
        if (holders.has(id)) errors.push(`ticket "${id}" is on two roadmap nodes, "${holders.get(id)}" and "${entry.node.id}".`);
        else holders.set(id, entry.node.id);
        // A work item's tickets close when it is finished. A settled design question's tickets
        // close with its parent work item (`finish` collects them), so until that item is
        // finished a decided question may hold open tickets.
        if (isLive(t)) {
          if (entry.node.status === 'done') errors.push(`roadmap node "${entry.node.id}" is done but its ticket "${id}" is still open — finish nodes with \`roadmap finish\`.`);
          else if (entry.node.status === 'decided') {
            const owner = workAncestor(entry);
            if (owner?.node.status === 'done') errors.push(`roadmap node "${entry.node.id}" is a settled question under finished item "${owner.node.id}", but its ticket "${id}" is still open.`);
          }
        } else if (!FINISHED.has(entry.node.status)) errors.push(`ticket "${id}" is closed but its roadmap node "${entry.node.id}" is not done.`);
      }
    }
  }
  const known = new Set();
  for (const t of board.backlog.tickets) {
    known.add(t.id);
    const bodies = findBodies(board.paths, t.id, view);
    const body = bodies.find((b) => !b.archived) ?? bodies[0];
    if (!body) errors.push(`ticket "${t.id}": no body file ${t.id}-<slug>.md in .spec/backlog/ or archive/.`);
    else if (bodies.length > 1) errors.push(`ticket "${t.id}": ${bodies.length} body files (${bodies.map((b) => path.relative(board.paths.backlogDir, b.file)).join(', ')}) — an interrupted move; keep the one that matches its ${isLive(t) ? 'open' : 'closed'} state (${isLive(t) ? '.spec/backlog/' : 'archive/'}) and delete the other.`);
    else if (isLive(t) && body.archived) errors.push(`ticket "${t.id}": open, but its body is in archive/.`);
    else if (!isLive(t) && !body.archived) errors.push(`ticket "${t.id}": closed, but its body is still in .spec/backlog/ rather than archive/.`);
    if (t.claim && holders.has(t.id)) errors.push(`ticket "${t.id}": claimed, but it is on roadmap node "${holders.get(t.id)}" — on the tree, "active" is the claim.`);
  }
  for (const [dir, label] of [[board.paths.backlogDir, '.spec/backlog/'], [board.paths.archiveDir, '.spec/backlog/archive/']]) {
    for (const name of bodyFiles(dir, view)) {
      if (!known.has(bodyId(name))) errors.push(`orphan body ${label}${name}: no ticket in backlog.json has its id — record it (\`backlog add\`) or delete the file.`);
    }
  }
  return errors;
}

// The nearest ancestor that is a work item: the item a design question belongs to.
function workAncestor(entry) {
  for (let e = entry.parent; e; e = e.parent) if (e.node.status in WORK_STATUS) return e;
  return null;
}

function validateBoard(board, view) {
  const errors = [...validateBacklog(board.backlog)];
  if (board.roadmap) errors.push(...validateRoadmap(board.roadmap));
  if (errors.length === 0) errors.push(...validateCross(board, view));
  return errors;
}

function loadBoard(paths) {
  const backlog = readJson(paths.backlogJson) ?? { tickets: [] };
  const roadmap = readJson(paths.roadmapJson) ?? null;
  return { paths, backlog, roadmap };
}

// ---------------------------------------------------------------------------
// Small helpers

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const splitList = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);

function parseOrdinal(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new UsageError(`Ordinal "${value}" must be a non-negative integer.`);
  return number;
}

function slugify(text) {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
  return slug.length >= 3 ? slug : '';
}

// Random, never sequential: a counter would force every writer to read global state first,
// and two sessions reading concurrently would both write the same next number.
function newTicketId(board) {
  const taken = new Set(board.backlog.tickets.map((t) => t.id));
  for (let attempt = 0; attempt < 100; attempt++) {
    const id = `bl-${crypto.randomBytes(3).toString('hex')}`;
    if (!taken.has(id) && !findBody(board.paths, id)) return id;
  }
  throw new Error('Could not find a free ticket id after 100 attempts.');
}

function requireTicket(board, id) {
  const t = board.backlog.tickets.find((x) => x.id === id);
  if (!t) throw new UsageError(`No ticket "${id}".`);
  return t;
}

function requireRoadmap(board) {
  if (!board.roadmap) throw new UsageError(`No roadmap yet at ${board.paths.roadmapJson}. Create one with: roadmap init <title>`);
  return board.roadmap;
}

const claimText = (claim) => `claimed ${claim.date}, branch ${claim.branch} — ${claim.note}`;

// Moving a body into archive/, byte for byte: written there first, removed from .spec/backlog/
// only after both stores are saved (see `apply`).
function archiveMove(paths, id) {
  const body = findBody(paths, id);
  if (!body || body.archived) return { files: [], remove: [] };
  const text = fs.readFileSync(body.file);
  return { files: [{ file: path.join(paths.archiveDir, path.basename(body.file)), text }], remove: [body.file] };
}

// ---------------------------------------------------------------------------
// Backlog commands

function describeTicket(t, holder) {
  const lines = [`${t.id}  ${t.title}`, `  type ${t.type} · recorded ${t.date} · source: ${t.source}${t.feature ? ` · feature ${t.feature}` : ''}`];
  if (t.claim) lines.push(`  ${claimText(t.claim)}`);
  if (holder) lines.push(`  on the roadmap: "${holder.node.id}" — ${holder.node.title}${holder.node.status ? ` (${holder.node.status})` : ''}`);
  if (t.closed) lines.push(`  closed ${t.closed.status}${t.closed.date ? ` ${t.closed.date}` : ''} — ${t.closed.resolution}`);
  for (const [k, v] of Object.entries(t.legacy ?? {})) lines.push(`  legacy ${k}: ${v}`);
  return lines;
}

function backlogCommand(board, command, args, options) {
  const tickets = board.backlog.tickets;
  const holders = ticketHolders(board.roadmap);
  switch (command) {
    case 'list':
    case undefined: {
      let rows;
      let heading;
      if (options.closed) { rows = tickets.filter((t) => !isLive(t)); heading = 'closed ticket(s)'; }
      else if (options.all) { rows = tickets.filter(isLive); heading = 'open ticket(s), basket and roadmap'; }
      else { rows = tickets.filter((t) => isLive(t) && !holders.has(t.id)); heading = 'ticket(s) in the basket'; }
      if (rows.length === 0) return { print: [`No ${heading}.`] };
      rows = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const lines = [`${rows.length} ${heading}, oldest first:`];
      for (const t of rows) {
        const holder = holders.get(t.id);
        const mark = t.closed ? (t.closed.status === 'done' ? '[x]' : '[-]') : holder ? '[>]' : t.claim ? '[~]' : '[ ]';
        lines.push(`${mark} ${t.id}  ${t.date}  ${t.type}  ${t.title}${holder && !options.closed ? `  -> ${holder.node.id}` : ''}`);
        if (t.claim) lines.push(`      ${claimText(t.claim)}`);
        if (t.closed) lines.push(`      ${t.closed.status}${t.closed.date ? ` ${t.closed.date}` : ''} — ${t.closed.resolution}`);
      }
      return { print: lines };
    }
    case 'show': {
      const [id] = args;
      if (!id) throw new UsageError('Usage: backlog show <id>');
      const t = requireTicket(board, id);
      const body = findBody(board.paths, id);
      return { print: [...describeTicket(t, holders.get(id)), `  body: ${body ? body.file : '(missing)'}`] };
    }
    case 'add': {
      const [title] = args;
      if (!title || !options.type || !options.source) throw new UsageError('Usage: backlog add <title> --type <t> --source <s> [--feature f] [--slug s]');
      const id = newTicketId(board);
      const t = { id, title, type: options.type, date: today(), source: options.source };
      if (options.feature) t.feature = options.feature;
      tickets.push(t);
      const slug = slugify(options.slug ?? title);
      const file = path.join(board.paths.backlogDir, `${id}${slug ? `-${slug}` : ''}.md`);
      return {
        saveBacklog: true,
        files: [{ file, text: '**Problem:** \n\n**Context:** \n\n**Suggested next step:** \n\n**Why deferrable:** \n' }],
        print: [`Added ${id}. Write its body in ${file}`],
      };
    }
    case 'claim': {
      const [id] = args;
      if (!id) throw new UsageError('Usage: backlog claim <id> [--branch b] [--note n] [--force]');
      const t = requireTicket(board, id);
      if (!isLive(t)) throw new UsageError(`${id} is closed.`);
      if (holders.has(id)) throw new UsageError(`${id} is on roadmap node "${holders.get(id).node.id}" — on the tree, set that node active instead of claiming.`);
      if (t.claim && !options.force) throw new RefusedError(`${id} is already ${claimText(t.claim)}. Report this to the user; take it over only with --force once they say so.`);
      // Re-claiming keeps every field not passed. The date is when the work started, which is what
      // makes a stale claim visible, so it changes only for a new claim or a change of branch
      // (a takeover); updating the note keeps it.
      const prior = t.claim ?? { branch: 'TBD', note: 'under discussion' };
      const branch = options.branch ?? prior.branch;
      const date = t.claim && branch === prior.branch ? t.claim.date : today();
      t.claim = { date, branch, note: options.note ?? prior.note };
      return { saveBacklog: true, print: [`Claimed ${id}: ${claimText(t.claim)}.`] };
    }
    case 'release': {
      const [id] = args;
      if (!id) throw new UsageError('Usage: backlog release <id>');
      const t = requireTicket(board, id);
      if (!t.claim) return { print: [`${id} was not claimed.`] };
      delete t.claim;
      return { saveBacklog: true, print: [`Released ${id}.`] };
    }
    case 'set': {
      const [id, field, value] = args;
      if (value === undefined) throw new UsageError('Usage: backlog set <id> <field> <value>');
      const t = requireTicket(board, id);
      if (field === 'resolution') {
        if (isLive(t)) throw new UsageError(`${id} is open; a resolution is set when it closes.`);
        if (value === '-') throw new UsageError('A resolution cannot be cleared.');
        t.closed.resolution = value;
        return { saveBacklog: true, print: [`Set the resolution of ${id}.`] };
      }
      if (!TICKET_SETTABLE.includes(field)) throw new UsageError(`Unknown field "${field}". Settable: ${TICKET_SETTABLE.join(', ')}, and resolution on a closed ticket.`);
      if (value === '-') {
        if (field !== 'feature') throw new UsageError(`"${field}" cannot be cleared.`);
        delete t.feature;
      } else t[field] = value;
      return { saveBacklog: true, print: [`Set ${field} of ${id}.`] };
    }
    case 'close':
    case 'drop': {
      const [id] = args;
      if (!id || !options.resolution) throw new UsageError(`Usage: backlog ${command} <id> --resolution <text>`);
      const t = requireTicket(board, id);
      if (!isLive(t)) throw new UsageError(`${id} is already closed (${t.closed.status}).`);
      if (holders.has(id)) throw new UsageError(`${id} is on roadmap node "${holders.get(id).node.id}" — finish it there with \`roadmap finish\`, or \`roadmap remove\` the node first to return it to the basket.`);
      delete t.claim;
      t.closed = { status: command === 'close' ? 'done' : 'dropped', date: today(), resolution: options.resolution };
      const move = archiveMove(board.paths, id);
      return { saveBacklog: true, ...move, print: [`${command === 'close' ? 'Closed' : 'Dropped'} ${id}; body moved to archive/.`] };
    }
    default:
      throw new UsageError(`Unknown backlog command "${command}". Run with --help for usage.`);
  }
}

// ---------------------------------------------------------------------------
// Promote — a reference, not a move

function promoteCommand(board, args, options) {
  const roadmap = requireRoadmap(board);
  const [id, parentId, nodeId] = args;
  if (!id) throw new UsageError('Usage: promote <id> <parentNodeId> <newNodeId> [options] | promote <id> --into <nodeId>');
  const t = requireTicket(board, id);
  if (!isLive(t)) throw new UsageError(`${id} is closed.`);
  const holders = ticketHolders(roadmap);
  if (holders.has(id)) throw new UsageError(`${id} is already on roadmap node "${holders.get(id).node.id}" — to move it, \`demote ${id}\` first.`);
  const index = indexTree(roadmap);
  // On the tree, a node's "active" status is the claim; the ticket record keeps everything else.
  const wasClaimed = Boolean(t.claim);
  delete t.claim;

  if (options.into) {
    const entry = requireNode(index, options.into);
    if (entry === index.root) throw new UsageError('Attach to a node, not the root.');
    (entry.node.tickets ??= []).push(id);
    if (entry.node.status !== undefined) entry.node.updated = today();
    return { saveBacklog: wasClaimed, saveRoadmap: true, print: [`Promoted ${id} onto existing node "${options.into}".`] };
  }

  if (!nodeId) throw new UsageError('Usage: promote <id> <parentNodeId> <newNodeId> [options]');
  refuseDone(options.status, nodeId);
  if (index.entries.has(nodeId)) throw new UsageError(`A node with id "${nodeId}" already exists; use --into ${nodeId} to attach to it.`);
  const parent = requireNode(index, parentId);
  const node = { id: nodeId, title: options.title ?? t.title, status: options.status ?? (wasClaimed ? 'active' : 'planned'), tickets: [id] };
  if (options.ordinal !== undefined) node.ordinal = parseOrdinal(options.ordinal);
  if (options.depends !== undefined) node.dependsOn = splitList(options.depends);
  for (const key of ['summary', 'detail', 'spec']) if (options[key] !== undefined) node[key] = options[key];
  node.updated = today();
  insertChild(parent.node, node, options.before);
  return { saveBacklog: wasClaimed, saveRoadmap: true, print: [`Promoted ${id} to roadmap node "${nodeId}" under "${parentId}" (${node.status}).${options.title ? '' : ' Its title is the ticket\'s; give the node a shorter architectural name with --title or `roadmap set ... title`.'}`] };
}

function demoteCommand(board, args) {
  const roadmap = requireRoadmap(board);
  const [id] = args;
  if (!id) throw new UsageError('Usage: demote <id>');
  const t = requireTicket(board, id);
  if (!isLive(t)) throw new UsageError(`${id} is closed — it stays on its finished node as history.`);
  const holder = ticketHolders(roadmap).get(id);
  if (!holder) throw new UsageError(`${id} is not on the roadmap; it is already in the basket.`);
  const node = holder.node;
  node.tickets = node.tickets.filter((x) => x !== id);
  if (node.tickets.length === 0) delete node.tickets;
  if (node.status !== undefined) node.updated = today();
  return { saveRoadmap: true, print: [`Took ${id} off roadmap node "${node.id}"; it is back in the basket.`] };
}

// ---------------------------------------------------------------------------
// Roadmap views

function statusText(node) {
  const status = ALL_STATUS[node.status];
  if (!status) return node.title;
  return node.status in QUESTION_STATUS ? `${status.icon} ${node.title} (${status.label})` : `${status.icon} ${node.title}`;
}

function terminalLine(entry, index) {
  const node = entry.node;
  if (node.id === ROOT_ID) return node.title;
  const meta = [];
  if (node.tickets?.length) meta.push(node.tickets.join(' '));
  if (Number.isInteger(node.ordinal)) meta.push(`#${node.ordinal}`);
  const pending = pendingDependencies(entry, index, true);
  if (pending.length) meta.push(`waits for ${pending.map((dep) => referenceLabel(dep.node)).join(', ')}`);
  meta.push(`[${node.id}]`);
  return `${statusText(node)}  ${meta.join('  ')}`;
}

// Finished work stays on the tree — it is the record of what the system already has — but a
// view that prints every finished leaf buries what is still moving. So by default a finished
// item, or a grouping whose every work item is finished, prints as one line with a count of
// what it folds away; --done expands everything.
function countDescendants(node) {
  let n = 0;
  for (const child of node.children ?? []) n += 1 + countDescendants(child);
  return n;
}

function finishedGroup(node) {
  if (node.status !== undefined || !node.children?.length) return false;
  let work = 0;
  const walk = (n) => {
    for (const c of n.children ?? []) {
      if (c.status in WORK_STATUS) { work++; if (c.status !== 'done') return false; }
      else if (UNSETTLED_QUESTION.has(c.status)) return false;
      if (walk(c) === false) return false;
    }
    return true;
  };
  return walk(node) !== false && work > 0;
}

function showTree(index, startId, full, expandDone) {
  const start = requireNode(index, startId ?? ROOT_ID);
  const byNode = new Map(index.list.map((e) => [e.node, e]));
  const lines = [terminalLine(start, index)];
  const walk = (entry, prefix) => {
    const children = entry.node.children ?? [];
    children.forEach((child, i) => {
      const last = i === children.length - 1;
      const childEntry = byNode.get(child);
      const folded = !expandDone && child.children?.length && (child.status === 'done' || finishedGroup(child));
      const suffix = folded ? `  (${countDescendants(child)} finished inside, folded — --done expands)` : '';
      lines.push(prefix + (last ? '└─ ' : '├─ ') + terminalLine(childEntry, index) + suffix);
      const continuation = prefix + (last ? '   ' : '│  ');
      if (full) {
        const bar = child.children?.length && !folded ? '│ ' : '  ';
        if (child.summary) lines.push(`${continuation}${bar}${child.summary}`);
        if (child.spec) lines.push(`${continuation}${bar}spec ${child.spec}`);
        if (child.detail) lines.push(`${continuation}${bar}${child.detail}`);
        for (const note of child.notes ?? []) lines.push(`${continuation}${bar}· ${note}`);
      }
      if (!folded) walk(childEntry, continuation);
    });
  };
  walk(start, '');
  return lines;
}

function nextLines(index, all) {
  const { ordered: work, unorderedCount } = orderedOpenWork(index);
  const lines = [];
  const describeWork = (entry) => {
    const node = entry.node;
    const parts = [`${String(effectiveOrdinal(entry)).padStart(3)}  ${statusText(node)}`];
    if (node.tickets?.length) parts.push(node.tickets.join(' '));
    const questions = unsettledQuestionCount(node);
    if (questions) parts.push(`${questions} open question(s)`);
    const pending = pendingDependencies(entry, index);
    if (pending.length) parts.push(`waits for ${pending.map((dep) => referenceLabel(dep.node)).join(', ')}`);
    parts.push(`[${node.id}]`);
    return parts.join('  ');
  };
  if (all) {
    lines.push('Every ordered item not yet done:');
    for (const entry of work) lines.push(describeWork(entry));
  } else {
    const ready = work.filter((entry) => pendingDependencies(entry, index).length === 0);
    if (work.length === 0) lines.push('No ordered work is left open.');
    else if (ready.length === 0) lines.push('Nothing can start now: every ordered item is waiting on another.');
    else {
      const lowest = effectiveOrdinal(ready[0]);
      const batch = ready.filter((e) => effectiveOrdinal(e) === lowest);
      lines.push(`Ready to start now (ordinal ${lowest}; same number = can run in parallel):`);
      for (const entry of batch) lines.push(describeWork(entry));
      lines.push('', `Then ${ready.length - batch.length} more with their prerequisites met, ${work.length - ready.length} waiting on prerequisites. --all lists everything.`);
    }
  }
  if (unorderedCount > 0) lines.push(`Plus ${unorderedCount} item(s) not done and not yet ordered.`);
  return lines;
}

const escapeCell = (text) => text.replaceAll('|', '\\|');

function markdownItem(entry, index) {
  const node = entry.node;
  const status = ALL_STATUS[node.status];
  const summary = node.summary ? `: ${node.summary}` : '';
  if (node.status in QUESTION_STATUS) return `${status.icon} ${node.title} (${status.label})${summary}`;
  const meta = [];
  if (node.tickets?.length) meta.push(node.tickets.join(', '));
  if (node.spec) meta.push(`spec \`${node.spec}\``);
  if (Number.isInteger(node.ordinal)) meta.push(`ordinal ${node.ordinal}`);
  const pending = pendingDependencies(entry, index, true);
  if (pending.length) meta.push(`waits for ${pending.map((dep) => referenceLabel(dep.node)).join(', ')}`);
  if (node.detail) meta.push(node.detail);
  if (node.updated) meta.push(node.updated);
  const head = status ? `${status.icon} **${node.title}**` : `**${node.title}**`;
  return `${head}${summary}${meta.length ? ` · ${meta.join(' · ')}` : ''} \`${node.id}\``;
}

function renderMarkdown(data, index) {
  const byNode = new Map(index.list.map((e) => [e.node, e]));
  const out = [`# ${data.title}`, ''];
  out.push('> Generated by `board.mjs roadmap render` from `.spec/roadmap/roadmap.json`. A snapshot, not a source: edit the data, not this.', '');
  for (const paragraph of data.intro ?? []) out.push(paragraph, '');
  out.push(`Work items: ${Object.values(WORK_STATUS).map((s) => `${s.icon} ${s.label}`).join('  ')}`, '');
  out.push(`Design questions: ${Object.values(QUESTION_STATUS).map((s) => `${s.icon} ${s.label}`).join('  ')}`, '');
  if (data.now?.length) {
    out.push('## Now', '');
    for (const paragraph of data.now) out.push(paragraph, '');
  }
  const { ordered: work, unorderedCount } = orderedOpenWork(index);
  out.push('## Order', '', 'Ordered work not yet done. Smaller first; equal numbers can run in parallel. "Waits for" lists unfinished prerequisites, including those inherited from ancestors.', '');
  out.push('| Ordinal | Status | Item | Tickets | Waits for |', '|---|---|---|---|---|');
  for (const entry of work) {
    const node = entry.node;
    const pending = pendingDependencies(entry, index).map((dep) => referenceLabel(dep.node)).join(', ');
    out.push(`| ${effectiveOrdinal(entry)} | ${WORK_STATUS[node.status].icon} | ${escapeCell(node.title)} | ${(node.tickets ?? []).join(', ')} | ${pending} |`);
  }
  out.push('');
  if (unorderedCount > 0) out.push(`Plus ${unorderedCount} item(s) not done and not yet ordered — see the sections below.`, '');
  for (const section of data.children) {
    const sectionEntry = byNode.get(section);
    out.push(`## ${section.title}`, '');
    if (section.summary) out.push(section.summary, '');
    const noted = [];
    const walk = (entry, depth) => {
      if (entry.node.notes?.length) noted.push(entry);
      if (depth >= 0) out.push(`${'  '.repeat(depth)}- ${markdownItem(entry, index)}`);
      for (const child of entry.node.children ?? []) walk(byNode.get(child), depth + 1);
    };
    walk(sectionEntry, -1);
    out.push('');
    if (noted.length) {
      out.push(`### ${section.title}: history`, '');
      for (const entry of noted) {
        const refs = [...(entry.node.tickets ?? []), ...(entry.node.spec ? [`spec \`${entry.node.spec}\``] : [])];
        out.push(`**${entry.node.title}**${refs.length ? ` (${refs.join(', ')})` : ''}`, '');
        for (const note of entry.node.notes) out.push(`- ${note}`);
        out.push('');
      }
    }
  }
  return out.join('\n').replace(/\n+$/, '\n');
}

// ---------------------------------------------------------------------------
// Roadmap edits

function insertChild(parentNode, node, beforeId) {
  parentNode.children ??= [];
  if (beforeId === undefined) { parentNode.children.push(node); return; }
  const position = parentNode.children.findIndex((child) => child.id === beforeId);
  if (position < 0) throw new UsageError(`"${beforeId}" is not a child of "${parentNode.id}".`);
  parentNode.children.splice(position, 0, node);
}

function detach(entry) {
  const siblings = entry.parent.node.children;
  siblings.splice(siblings.indexOf(entry.node), 1);
  if (siblings.length === 0 && entry.parent.node.id !== ROOT_ID) delete entry.parent.node.children;
}

// Only `roadmap finish` makes a work item done: it also checks the item's parts, closes its
// tickets and archives their bodies. So no other command sets "done", whatever the node's
// status was before — not `set` (even after `set status -`), not `add`, not `promote`.
function refuseDone(status, id) {
  if (status === 'done') throw new UsageError(`Work items are finished with: roadmap finish ${id} --resolution "<where it landed>" — that also closes its tickets and archives their bodies.`);
}

function setNodeField(node, field, value) {
  const clear = value === '-';
  switch (field) {
    case 'status':
      if (clear) delete node.status;
      else if (!(value in ALL_STATUS)) throw new UsageError(`Unknown status "${value}". Allowed: ${Object.keys(ALL_STATUS).join(', ')}.`);
      else node.status = value;
      break;
    case 'ordinal':
      if (clear) delete node.ordinal; else node.ordinal = parseOrdinal(value);
      break;
    case 'title':
      if (clear) throw new UsageError('A title cannot be cleared.');
      node.title = value;
      break;
    case 'summary': case 'detail': case 'spec': case 'updated':
      if (clear) delete node[field]; else node[field] = value;
      break;
    case 'dependsOn':
      if (clear) delete node[field]; else node[field] = splitList(value);
      break;
    default:
      throw new UsageError(`Unknown field "${field}". Settable: ${NODE_SETTABLE.join(', ')}.`);
  }
  if (field !== 'updated' && node.status !== undefined) node.updated = today();
}

function roadmapCommand(board, command, args, options) {
  if (command === 'init') {
    const [title] = args;
    if (!title) throw new UsageError('Usage: roadmap init <title>');
    if (board.roadmap) throw new UsageError(`A roadmap already exists at ${board.paths.roadmapJson}.`);
    board.roadmap = { title, children: [] };
    return { saveRoadmap: true, print: [`Created ${board.paths.roadmapJson}.`] };
  }
  const roadmap = requireRoadmap(board);
  const index = indexTree(roadmap);
  switch (command) {
    case 'show':
    case undefined:
      // The whole tree opens with what is in flight, so a new session reads that first.
      return { print: [...(!args[0] && roadmap.now?.length ? ['Now:', ...roadmap.now.map((p) => `  ${p}`), ''] : []), ...showTree(index, args[0], options.full, options.done)] };
    case 'next':
      return { print: nextLines(index, options.all) };
    case 'format':
      return { saveRoadmap: true, print: ['Formatted roadmap.json.'] };
    case 'render': {
      const text = renderMarkdown(roadmap, index);
      if (!options.out) return { print: [text.replace(/\n$/, '')] };
      const out = path.resolve(options.out);
      if (isInside(board.paths.backlogDir, out) || samePath(out, board.paths.roadmapJson)) {
        throw new UsageError(`Refusing to write ${out}: --out may not point into .spec/backlog/ (ticket bodies live there) or at roadmap.json.`);
      }
      return { files: [{ file: out, text }], print: [`Wrote ${out}.`] };
    }
    case 'root': {
      const [field, ...values] = args;
      if (field === undefined) {
        const lines = [`title: ${roadmap.title}`];
        for (const key of ['intro', 'now']) {
          lines.push('', `${key}:`);
          if (!roadmap[key]?.length) lines.push('  (empty)');
          for (const paragraph of roadmap[key] ?? []) lines.push(`  ${paragraph}`);
        }
        return { print: lines };
      }
      if (!['title', 'intro', 'now'].includes(field)) throw new UsageError(`Root fields: title, intro, now.`);
      if (values.length === 0) throw new UsageError(`Usage: roadmap root ${field} <${field === 'title' ? 'text' : 'paragraph...'}>`);
      if (field === 'title') {
        if (values.length !== 1 || values[0] === '-') throw new UsageError('The title takes exactly one value and cannot be cleared.');
        roadmap.title = values[0];
      } else if (values.length === 1 && values[0] === '-') {
        delete roadmap[field];
      } else {
        roadmap[field] = values;
      }
      return { saveRoadmap: true, print: [`Set root ${field}.`] };
    }
    case 'set': {
      const [id, field, value] = args;
      if (value === undefined) throw new UsageError('Usage: roadmap set <id> <field> <value>');
      const entry = requireNode(index, id);
      if (entry === index.root) throw new UsageError('The root is edited with: roadmap root <title|intro|now> ...');
      if (field === 'tickets') throw new UsageError('Tickets arrive through promote, not set.');
      if (field === 'status') refuseDone(value, id);
      setNodeField(entry.node, field, value);
      return { saveRoadmap: true, print: [`Set ${field} of "${id}".`] };
    }
    case 'add': {
      const [parentId, id, title] = args;
      if (title === undefined) throw new UsageError('Usage: roadmap add <parentId> <id> <title> [options]');
      if (options.tickets !== undefined) throw new UsageError('Tickets arrive through promote; add the node, then `promote <ticket> --into <id>`.');
      refuseDone(options.status, id);
      if (index.entries.has(id)) throw new UsageError(`A node with id "${id}" already exists.`);
      const parent = requireNode(index, parentId);
      const node = { id, title };
      if (options.status !== undefined) node.status = options.status;
      if (options.ordinal !== undefined) node.ordinal = parseOrdinal(options.ordinal);
      if (options.depends !== undefined) node.dependsOn = splitList(options.depends);
      for (const key of ['summary', 'detail', 'spec']) if (options[key] !== undefined) node[key] = options[key];
      if (node.status !== undefined) node.updated = today();
      insertChild(parent.node, node, options.before);
      return { saveRoadmap: true, print: [`Added "${id}" under "${parentId}".`] };
    }
    case 'move': {
      const [id, parentId] = args;
      if (parentId === undefined) throw new UsageError('Usage: roadmap move <id> <newParentId> [--before siblingId]');
      const entry = requireNode(index, id);
      if (entry === index.root) throw new UsageError('The root cannot be moved.');
      const target = requireNode(index, parentId);
      if (target === entry || isAncestor(entry, target)) throw new UsageError(`Cannot move "${id}" under itself.`);
      detach(entry);
      insertChild(target.node, entry.node, options.before);
      if (entry.node.status !== undefined) entry.node.updated = today();
      return { saveRoadmap: true, print: [`Moved "${id}" under "${parentId}".`] };
    }
    case 'rename': {
      const [id, newId] = args;
      if (newId === undefined) throw new UsageError('Usage: roadmap rename <id> <newId>');
      const entry = requireNode(index, id);
      if (entry === index.root) throw new UsageError('The root has no id to rename; its title is edited with: roadmap root title <text>');
      if (!NODE_ID.test(newId) || newId === ROOT_ID) throw new UsageError(`"${newId}" is not a valid node id (lowercase, "." and "-" separated; "${ROOT_ID}" is reserved).`);
      if (index.entries.has(newId)) throw new UsageError(`A node with id "${newId}" already exists.`);
      entry.node.id = newId;
      let followed = 0;
      for (const other of index.list) {
        const deps = other.node.dependsOn;
        if (!deps?.includes(id)) continue;
        other.node.dependsOn = deps.map((d) => (d === id ? newId : d));
        followed += 1;
      }
      if (entry.node.status !== undefined) entry.node.updated = today();
      return { saveRoadmap: true, print: [`Renamed "${id}" to "${newId}".${followed ? ` ${followed} dependsOn reference(s) updated.` : ''}`] };
    }
    case 'remove': {
      const [id] = args;
      if (id === undefined) throw new UsageError('Usage: roadmap remove <id> [--force]');
      const entry = requireNode(index, id);
      if (entry === index.root) throw new UsageError('The root cannot be removed.');
      const held = [];
      const done = [];
      const collect = (node) => {
        held.push(...(node.tickets ?? []));
        if (node.status === 'done') done.push(node.id);
        for (const c of node.children ?? []) collect(c);
      };
      collect(entry.node);
      // Finished work is the record of what the system has: only unfinished branches are removed.
      if (done.length) throw new UsageError(`"${id}" ${done[0] === id ? 'is done' : `contains finished item(s) ${done.join(', ')}`} — finished history stays on the tree; remove only unfinished branches (or \`roadmap move\` it).`);
      if ((entry.node.children?.length || held.length) && !options.force) {
        throw new UsageError(`"${id}" has ${entry.node.children?.length ? 'children' : ''}${entry.node.children?.length && held.length ? ' and ' : ''}${held.length ? `ticket(s) ${held.join(', ')}` : ''}; add --force. Open tickets return to the basket.`);
      }
      const closedHeld = held.filter((t) => board.backlog.tickets.find((x) => x.id === t && !isLive(x)));
      if (closedHeld.length) throw new UsageError(`"${id}" holds closed ticket(s) ${closedHeld.join(', ')} — finished history stays on the tree; remove only unfinished branches.`);
      detach(entry);
      return { saveRoadmap: true, print: [`Removed "${id}".${held.length ? ` Ticket(s) ${held.join(', ')} are back in the basket.` : ''}`] };
    }
    case 'finish': {
      // Finishing closes the item's tickets (their records stay in backlog.json, now with how
      // they closed), moves their bodies to archive/, and folds away the settled design
      // questions — their conclusions were written into the body as they were decided. The
      // node stays: a finished component is part of the architecture the tree describes.
      const [id] = args;
      if (!id || !options.resolution) throw new UsageError('Usage: roadmap finish <id> --resolution <where it landed>');
      const entry = requireNode(index, id);
      const node = entry.node;
      if (!(node.status in WORK_STATUS)) throw new UsageError(`"${id}" is not a work item (status "${node.status ?? 'none'}"); only work items are finished.`);
      if (node.status === 'done') throw new UsageError(`"${id}" is already done.`);
      const unfinished = [];
      const scan = (n) => {
        for (const c of n.children ?? []) {
          if (UNSETTLED_QUESTION.has(c.status) || (c.status in WORK_STATUS && c.status !== 'done')) unfinished.push(`${c.id} (${c.status})`);
          scan(c);
        }
      };
      scan(node);
      if (unfinished.length) throw new RefusedError(`"${id}" still has unfinished parts: ${unfinished.join(', ')}. Settle or finish them first — an item with open questions is not done.`);

      const toClose = [...(node.tickets ?? [])];
      const prune = (n) => {
        if (!n.children) return;
        n.children = n.children.filter((c) => {
          if (c.status === 'decided' && !(c.children ?? []).some((g) => g.status in WORK_STATUS)) {
            const gather = (x) => { toClose.push(...(x.tickets ?? [])); for (const y of x.children ?? []) gather(y); };
            gather(c);
            return false;
          }
          // A settled question that stays (it holds work items) still closes its own tickets now.
          if (c.status === 'decided') toClose.push(...(c.tickets ?? []));
          prune(c);
          return true;
        });
        if (n.children.length === 0) delete n.children;
      };
      prune(node);
      if (node.detail) (node.notes ??= []).push(`before finish: ${node.detail}`);
      node.detail = options.resolution;
      node.status = 'done';
      node.updated = today();

      const files = [];
      const remove = [];
      let closed = 0;
      for (const tid of toClose) {
        const t = board.backlog.tickets.find((x) => x.id === tid);
        if (!t || !isLive(t)) continue;
        t.closed = { status: 'done', date: today(), resolution: options.resolution };
        closed++;
        const move = archiveMove(board.paths, tid);
        files.push(...move.files);
        remove.push(...move.remove);
      }
      return { saveBacklog: closed > 0, saveRoadmap: true, files, remove, print: [`Finished "${id}": ${closed} ticket(s) closed, bodies archived, settled question nodes folded away.`] };
    }
    case 'note': {
      const [id, text] = args;
      if (text === undefined) throw new UsageError('Usage: roadmap note <id> <text>');
      const entry = requireNode(index, id);
      if (entry === index.root) throw new UsageError('The root cannot hold notes.');
      (entry.node.notes ??= []).push(text);
      if (entry.node.status !== undefined) entry.node.updated = today();
      return { saveRoadmap: true, print: [`Added a note to "${id}".`] };
    }
    default:
      throw new UsageError(`Unknown roadmap command "${command}". Run with --help for usage.`);
  }
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
    if (i + 1 >= argv.length) throw new UsageError(`Option --${name} needs a value.`);
    options[name] = argv[++i];
  }
  return { positional, options };
}

// The table key for a command: "check", "promote", "backlog add", ... (a bare area is its default).
function commandKey(area, command) {
  if (area === 'backlog') return `backlog ${command ?? 'list'}`;
  if (area === 'roadmap') return `roadmap ${command ?? 'show'}`;
  return area;
}

function checkOptions(key, options) {
  const allowed = COMMAND_OPTIONS[key];
  if (!allowed) return; // an unknown command: its handler reports that
  for (const name of Object.keys(options)) {
    if (name === 'root' || name === 'help' || allowed.includes(name)) continue;
    throw new UsageError(`${key} does not take --${name}${allowed.length ? `; it takes ${allowed.map((o) => `--${o}`).join(', ')}` : ''}. Run with --help for usage.`);
  }
}

// Commands that only read take no lock; everything else holds it for the whole read-validate-write.
function readsOnly(key, args, options) {
  if (['check', 'backlog list', 'backlog show', 'roadmap show', 'roadmap next'].includes(key)) return true;
  if (key === 'roadmap render') return !options.out;
  if (key === 'roadmap root') return args.length === 0;
  return false;
}

const pathKey = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
const samePath = (a, b) => pathKey(a) === pathKey(b);
function isInside(dir, file) {
  const rel = path.relative(pathKey(dir), pathKey(file));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function main(argv) {
  const { positional, options } = parseArgs(argv);
  const [area, command, ...args] = positional;
  if (!area || area === 'help' || options.help) { console.log(USAGE); return 0; }
  const key = commandKey(area, command);
  checkOptions(key, options);

  const root = options.root ? path.resolve(options.root) : mainWorktreeRoot(process.cwd());
  const paths = boardPaths(root);
  const release = readsOnly(key, args, options) ? null : acquireLock(paths.lock);
  try {
    const code = run(paths, area, command, args, options);
    // Say so when git redirected the board away from where the command was run (a linked worktree).
    if (code === 0 && !options.root && path.resolve(process.cwd()) !== root && !process.cwd().startsWith(root + path.sep)) console.error(`(board: ${root})`);
    return code;
  } finally {
    release?.();
  }
}

function run(paths, area, command, args, options) {
  const root = paths.root;
  const board = loadBoard(paths);
  const errors = validateBoard(board);
  if (errors.length > 0) {
    console.error(`The board at ${root} has ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    return 1;
  }

  let result;
  switch (area) {
    case 'check': {
      const nodes = board.roadmap ? indexTree(board.roadmap).list.length : 0;
      const holders = ticketHolders(board.roadmap);
      const live = board.backlog.tickets.filter(isLive);
      console.log(`OK: ${live.filter((t) => !holders.has(t.id)).length} in the basket, ${live.filter((t) => holders.has(t.id)).length} open on the roadmap, ${board.backlog.tickets.length - live.length} closed; ${board.roadmap ? `${nodes} roadmap node(s)` : 'no roadmap'} — no problems. (${root})`);
      return 0;
    }
    case 'backlog': result = backlogCommand(board, command, args, options); break;
    case 'roadmap': result = roadmapCommand(board, command, args, options); break;
    case 'promote': result = promoteCommand(board, [command, ...args].filter((a) => a !== undefined), options); break;
    case 'demote': result = demoteCommand(board, [command, ...args].filter((a) => a !== undefined)); break;
    default: throw new UsageError(`Unknown area "${area}". Run with --help for usage.`);
  }

  if (result.saveBacklog || result.saveRoadmap || result.files?.length) {
    // Validate the result as it will be on disk — including the files this edit creates or
    // removes — before writing any of it.
    const view = { added: new Set((result.files ?? []).map((f) => f.file)), removed: new Set(result.remove ?? []) };
    const problems = validateBoard(board, view);
    if (problems.length > 0) {
      console.error('Not saved — the change would leave these problems:');
      for (const p of problems) console.error(`  - ${p}`);
      return 1;
    }
    apply(paths, board, result);
  }
  console.log(result.print.join('\n'));
  return 0;
}

// The order makes an interrupted write recoverable: every state a crash can leave between two
// steps is one `check` names. New files first (a new body alone is an orphan; an archive copy
// beside its live original is a duplicate), then roadmap.json, then backlog.json (between the
// two, a finished node with open tickets, or a claimed ticket on a node), and only then the old
// bodies are removed — so a body is never deleted before the record that says where it went.
function apply(paths, board, result) {
  for (const f of result.files ?? []) { fs.mkdirSync(path.dirname(f.file), { recursive: true }); fs.writeFileSync(f.file, f.text, 'utf8'); }
  if (result.saveRoadmap) saveRoadmap(paths.roadmapJson, board.roadmap);
  if (result.saveBacklog) saveBacklog(paths.backlogJson, board.backlog);
  for (const r of result.remove ?? []) fs.rmSync(r, { force: true });
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof RefusedError) { console.error(`refused: ${error.message}`); process.exitCode = 3; }
  else if (error instanceof UsageError) { console.error(`error: ${error.message}`); process.exitCode = 2; }
  else if (error instanceof LockError) { console.error(`error: ${error.message}`); process.exitCode = 1; }
  else throw error;
}
