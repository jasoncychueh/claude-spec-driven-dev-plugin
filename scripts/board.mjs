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
// Ordering on the tree:
//   ordinal    - the order we want; smaller first, equal means "can run in parallel".
//                A node without one takes its parent's. Ties break by depth, then tree position.
//   dependsOn  - nodes that must be finished first. A node also waits for whatever its
//                ancestors wait for.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

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

const BOOLEAN_OPTIONS = new Set(['all', 'closed', 'full', 'force', 'help', 'dry-run', 'done']);

class UsageError extends Error {}
class RefusedError extends Error {} // a deliberate refusal the caller must act on (e.g. an existing claim)

const USAGE = `Usage: node board.mjs <area> <command> [args] [--root <projectDir>]

Backlog — the ticket registry
  backlog list [--all | --closed]                The basket: live tickets on no roadmap node, oldest
                                                 first. --all: every live ticket. --closed: closed ones.
  backlog show <id>                              A ticket's record, where it sits, and its body path.
  backlog add <title> --type <t> --source <s> [--feature f] [--slug s]
                                                 Record a ticket; prints the body file to fill in.
  backlog claim <id> [--branch b] [--note n] [--force]
                                                 Mark a basket ticket as being worked on. Refuses
                                                 (exit 3) if someone else holds it, unless --force.
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
  roadmap remove <id> [--force]                  --force is required when the node has children or tickets;
                                                 its live tickets return to the basket.
  roadmap finish <id> --resolution <text>        Mark a work item done: its tickets close, bodies go to
                                                 archive/, settled question nodes fold away, the node stays.
  roadmap note <id> <text>                       Append a history note.
  roadmap render [--out <path>]                  Markdown view to stdout (or a file). Not meant to be committed.
  roadmap format                                 Rewrite roadmap.json in canonical key order.

Whole board
  check                                          Validate both stores and their cross-references.
  migrate [--dry-run] [--force] [--roadmap-from <path>]
                                                 Convert a BACKLOG.md + per-file backlog to this layout.

The board lives under the main worktree of the git repository containing the current directory.
--root <dir> points it somewhere else explicitly.`;

// ---------------------------------------------------------------------------
// Paths

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// The main worktree is where the shared board lives. `--git-common-dir` is the same .git for the
// main worktree and every linked one, and its parent is the main worktree's root.
function projectRoot(cwd) {
  try {
    const common = path.resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd));
    if (path.basename(common) === '.git') return path.dirname(common);
  } catch (_) { /* not a git repo, or git unavailable */ }
  try { return git(['rev-parse', '--show-toplevel'], cwd); } catch (_) { return cwd; }
}

function boardPaths(root) {
  const backlogDir = path.join(root, '.spec', 'backlog');
  return {
    root,
    backlogDir,
    backlogJson: path.join(backlogDir, 'backlog.json'),
    archiveDir: path.join(backlogDir, 'archive'),
    legacyIndex: path.join(backlogDir, 'BACKLOG.md'),
    roadmapJson: path.join(root, '.spec', 'roadmap', 'roadmap.json'),
  };
}

// Body files are "<id>.md" or "<id>-<slug>.md", live in .spec/backlog/ or closed in archive/.
// `view` lets validation see the files an edit is about to create or remove, so a change is
// checked as it will be on disk without writing anything first.
function findBody(paths, id, view) {
  const match = (dir) => {
    let names;
    try { names = fs.readdirSync(dir); } catch (_) { names = []; }
    if (view) {
      names = names.filter((n) => !view.removed.has(path.join(dir, n)));
      for (const f of view.added) if (path.dirname(f) === dir && !names.includes(path.basename(f))) names.push(path.basename(f));
    }
    const name = names.find((n) => n === `${id}.md` || (n.startsWith(`${id}-`) && n.endsWith('.md')));
    return name ? path.join(dir, name) : null;
  };
  const live = match(paths.backlogDir);
  if (live) return { file: live, archived: false };
  const old = match(paths.archiveDir);
  return old ? { file: old, archived: true } : null;
}

// ---------------------------------------------------------------------------
// Loading and saving

function readJson(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return undefined; }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try { return JSON.parse(text); } catch (error) { throw new UsageError(`${file} is not valid JSON: ${error.message}`); }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
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
        if (FINISHED.has(entry.node.status) && isLive(t)) errors.push(`roadmap node "${entry.node.id}" is done but its ticket "${id}" is still open — finish nodes with \`roadmap finish\`.`);
        if (!FINISHED.has(entry.node.status) && !isLive(t)) errors.push(`ticket "${id}" is closed but its roadmap node "${entry.node.id}" is not done.`);
      }
    }
  }
  for (const t of board.backlog.tickets) {
    const body = findBody(board.paths, t.id, view);
    if (!body) errors.push(`ticket "${t.id}": no body file ${t.id}-<slug>.md in .spec/backlog/ or archive/.`);
    else if (isLive(t) && body.archived) errors.push(`ticket "${t.id}": open, but its body is in archive/.`);
    else if (!isLive(t) && !body.archived) errors.push(`ticket "${t.id}": closed, but its body is still in .spec/backlog/ rather than archive/.`);
    if (t.claim && holders.has(t.id)) errors.push(`ticket "${t.id}": claimed, but it is on roadmap node "${holders.get(t.id)}" — on the tree, "active" is the claim.`);
  }
  return errors;
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

// Moving a body into archive/, dropping any frontmatter it still carries (the record is in JSON).
function archiveMove(paths, id) {
  const body = findBody(paths, id);
  if (!body || body.archived) return { files: [], remove: [] };
  const text = splitFrontmatter(fs.readFileSync(body.file, 'utf8')).body;
  return { files: [{ file: path.join(paths.archiveDir, path.basename(body.file)), text }], remove: [body.file] };
}

// ---------------------------------------------------------------------------
// Frontmatter (read during migration; bodies no longer carry any)

function splitFrontmatter(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fields: {}, body: text, had: false };
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    fields[kv[1]] = value;
  }
  return { fields, body: text.slice(m[0].length).replace(/^\s*\n/, ''), had: true };
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
      t.claim = { date: today(), branch: options.branch ?? 'TBD', note: options.note ?? 'under discussion' };
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
      return { files: [{ file: path.resolve(options.out), text }], print: [`Wrote ${path.resolve(options.out)}.`] };
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
      if (field === 'status' && value === 'done' && entry.node.status in WORK_STATUS) {
        throw new UsageError(`Work items are finished with: roadmap finish ${id} --resolution "<where it landed>" — that also closes its tickets and archives their bodies.`);
      }
      setNodeField(entry.node, field, value);
      return { saveRoadmap: true, print: [`Set ${field} of "${id}".`] };
    }
    case 'add': {
      const [parentId, id, title] = args;
      if (title === undefined) throw new UsageError('Usage: roadmap add <parentId> <id> <title> [options]');
      if (options.tickets !== undefined) throw new UsageError('Tickets arrive through promote; add the node, then `promote <ticket> --into <id>`.');
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
      const collect = (node) => { held.push(...(node.tickets ?? [])); for (const c of node.children ?? []) collect(c); };
      collect(entry.node);
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
      return { saveRoadmap: true, print: [`Added a note to "${id}".`] };
    }
    default:
      throw new UsageError(`Unknown roadmap command "${command}". Run with --help for usage.`);
  }
}

// ---------------------------------------------------------------------------
// Migration from the BACKLOG.md + per-file layout
//
// Old item files come in more than one shape: YAML frontmatter with the documented keys,
// frontmatter with other names (`created`, `origin`), or no frontmatter at all — a `# id: title`
// heading and bold label lines (`**Status**:` / `**狀態**:`). The old BACKLOG.md index line also
// carries type, date, a title hook and claim text, and archive/ holds closed items whose
// frontmatter is their closing record. Every ticket — open or closed — becomes a record in
// backlog.json, and two rules hold throughout:
//   - no field is dropped: anything the new record has no slot for is kept in its `legacy`
//     object, verbatim;
//   - a required field that no source supplies is not quietly defaulted: the migration refuses
//     and lists what is missing, and --force is needed to accept the fallback values.

const LABELS = { status: ['status', '狀態'], source: ['source', '來源'], type: ['type', '類型'], date: ['date', '日期', 'created'] };

function boldLabels(body) {
  const found = {};
  for (const line of body.split(/\r?\n/).slice(0, 40)) {
    const m = line.match(/^\s*\*\*([^*]+)\*\*\s*[:：]\s*(.+?)\s*$/);
    if (!m) continue;
    const label = m[1].trim().toLowerCase();
    for (const [field, names] of Object.entries(LABELS)) if (names.includes(label) && found[field] === undefined) found[field] = m[2];
  }
  return found;
}

function headingTitle(body, id) {
  const m = body.match(/^\s*#\s+(.+?)\s*$/m);
  if (!m) return undefined;
  return m[1].replace(new RegExp(`^${id}\\s*[:：]\\s*`), '').trim() || undefined;
}

function indexEntries(file) {
  const entries = new Map();
  if (!fs.existsSync(file)) return entries;
  const lineRe = /^\s*-\s*\[([ ~xX])\]\s*(bl-[0-9a-f]{6})\b\s*(?:\(([^)]*)\))?\s*(?:[—–-]+\s*)?(.*)$/;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(lineRe);
    if (!m) continue;
    const [, mark, id, paren = '', rest] = m;
    const parts = paren.split(/[,，]\s*/);
    const type = TYPE_NAME.test((parts[0] ?? '').trim()) ? parts[0].trim() : undefined;
    const date = (parts.find((p) => DATE.test(p.trim())) ?? '').trim() || undefined;
    const extras = parts.slice(1).filter((p) => !DATE.test(p.trim())).join('，').trim();
    const hook = rest.replace(/\s*→\s*\[[^\]]*\]\([^)]*\)\s*$/, '').trim();
    entries.set(id, { mark, type, date, extras, hook, line: line.trim() });
  }
  return entries;
}

// A claim written as text: "2026-07-17 (branch: feat/x) — note", or index extras such as
// "in progress since 2026-07-17, branch `feat/x`" / "2026-09-07 claim".
function claimFromText(text, fallbackDate) {
  const t = (text ?? '').trim();
  const dates = t.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const branch = (t.match(/branch[:\s]*`?([^`),，\s]+)`?/i) ?? [])[1];
  const note = t.replace(/^\d{4}-\d{2}-\d{2}\s*/, '').replace(/\(branch:[^)]*\)\s*/i, '').replace(/^[—–-]+\s*/, '').trim();
  return { date: dates[dates.length - 1] ?? fallbackDate, branch: branch || 'TBD', note: note || 'claimed in the old layout' };
}

function migrate(paths, options) {
  if (fs.existsSync(paths.backlogJson)) throw new UsageError(`${paths.backlogJson} already exists — this project is already on the board layout.`);
  const dry = options['dry-run'];
  const plan = [];
  const fallbacks = [];
  const writes = [];
  const removes = [];

  let roadmap = readJson(paths.roadmapJson) ?? null;
  if (options['roadmap-from']) {
    if (roadmap) throw new UsageError(`${paths.roadmapJson} already exists; refusing to overwrite it with --roadmap-from.`);
    const from = path.resolve(options['roadmap-from']);
    roadmap = readJson(from);
    if (!roadmap) throw new UsageError(`Cannot read ${from}.`);
    plan.push(`roadmap: copy ${from} -> ${paths.roadmapJson}`);
  }
  if (roadmap) {
    const problems = validateRoadmap(roadmap);
    if (problems.length) throw new UsageError(`The roadmap has problems; fix them first:\n  - ${problems.join('\n  - ')}`);
  }
  const holders = ticketHolders(roadmap);
  const index = indexEntries(paths.legacyIndex);
  const tickets = [];
  const seen = new Set();

  const files = [];
  for (const [dir, archived] of [[paths.backlogDir, false], [paths.archiveDir, true]]) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { /* absent */ }
    for (const name of names) if (name.endsWith('.md') && name !== 'BACKLOG.md') files.push({ file: path.join(dir, name), name, archived });
  }

  for (const { file, name, archived } of files) {
    const text = fs.readFileSync(file, 'utf8');
    const { fields: fm, body, had } = splitFrontmatter(text);
    const id = fm.id || (name.match(/^(bl-[0-9a-f]{6})/) ?? [])[1];
    if (!id || !TICKET_ID.test(id)) { plan.push(`skip ${archived ? 'archive/' : ''}${name}: no recognizable id`); continue; }
    if (seen.has(id)) throw new UsageError(`Two files carry ticket id ${id}; resolve that first.`);
    seen.add(id);
    const bold = boldLabels(body);
    const idx = index.get(id);

    // Resolve each field from the best source that has it, remembering which keys it consumed.
    const consumed = new Set(['id']);
    const pick = (candidates) => {
      for (const [value, key] of candidates) {
        if (value !== undefined && String(value).trim() !== '') { if (key) consumed.add(key); return String(value).trim(); }
      }
      return undefined;
    };
    const t = {
      id,
      title: pick([[fm.title, 'title'], [headingTitle(body, id)], [idx?.hook]]),
      type: pick([[fm.type, 'type'], [bold.type], [idx?.type]]),
      date: pick([[fm.date, 'date'], [fm.created, 'created'], [bold.date], [idx?.date]]),
      source: pick([[fm.source, 'source'], [fm.origin, 'origin'], [bold.source]]),
    };
    const feature = pick([[fm.feature, 'feature']]);
    if (feature) t.feature = feature;
    let status = pick([[fm.status, 'status'], [bold.status]]) ?? (archived ? 'done' : idx?.mark === '~' ? 'in-progress' : 'open');
    // The old index's [~] is a claim even when the file itself still says open.
    if (status === 'open' && idx?.mark === '~') status = 'in-progress';
    const pickedUp = pick([[fm.picked_up, 'picked_up']]);
    const resolution = pick([[fm.resolution, 'resolution']]);
    const closedDate = pick([[fm.closed, 'closed']]);

    const missing = ['title', 'type', 'date', 'source'].filter((f) => !t[f]);
    if (missing.length) fallbacks.push(`${id}: no ${missing.join(', ')} in its file or in BACKLOG.md`);
    t.title ??= name.replace(/\.md$/, '');
    t.type = t.type && TYPE_NAME.test(t.type) ? t.type : 'idea';
    t.date = t.date && DATE.test(t.date.slice(0, 10)) ? t.date.slice(0, 10) : today();
    t.source ??= 'unknown (migrated)';

    const legacy = {};
    for (const [k, v] of Object.entries(fm)) if (!consumed.has(k)) legacy[k] = v;
    const known = ['open', 'in-progress', 'done', 'dropped'];
    if (!known.includes(status)) {
      legacy.status = status;
      plan.push(`${id}: status "${status}" is not one the board knows — kept as legacy.status; decide whether to close it`);
      status = archived ? 'done' : idx?.mark === '~' ? 'in-progress' : 'open';
    }

    const holder = holders.get(id);
    let closing = null;
    if (status === 'done' || status === 'dropped') closing = { status, resolution: resolution ?? (archived ? 'closed before migration (no resolution recorded)' : 'marked done before migration') };
    else if (holder && FINISHED.has(holder.node.status)) {
      closing = { status: 'done', resolution: `finished on the roadmap before migration (node ${holder.node.id})` };
      plan.push(`${id}: open, but its node "${holder.node.id}" is ${holder.node.status} -> closed as done, body archived`);
    }
    if (closing) {
      t.closed = { status: closing.status, ...(closedDate && DATE.test(closedDate) ? { date: closedDate } : {}), resolution: closing.resolution };
    } else if (status === 'in-progress' && !holder) {
      t.claim = pickedUp ? claimFromText(pickedUp, t.date) : claimFromText(idx?.extras, t.date);
      plan.push(`${id}: claim carried over — ${claimText(t.claim)}`);
    } else if (status === 'in-progress' && holder) {
      plan.push(`${id}: was claimed, and is on roadmap node "${holder.node.id}" (${holder.node.status ?? 'no status'}) — the node's status is the claim now`);
    }
    if (pickedUp && (closing || holder)) legacy.picked_up = pickedUp;
    if (Object.keys(legacy).length) t.legacy = legacy;
    tickets.push(t);

    // Bodies carry no frontmatter any more; closed ones live in archive/.
    const newText = had ? body : text;
    const target = t.closed ? path.join(paths.archiveDir, name) : path.join(paths.backlogDir, name);
    if (target !== file) { writes.push({ file: target, text: newText }); removes.push(file); }
    else if (had) writes.push({ file, text: newText });

    const where = [];
    if (!had && (bold.status || bold.source)) where.push('bold-label header');
    if (fm.created || fm.origin) where.push('frontmatter aliases');
    if (Object.keys(legacy).length) where.push(`legacy: ${Object.keys(legacy).join(', ')}`);
    if (!plan.some((p) => p.startsWith(`${id}:`))) {
      plan.push(`${id}: ${t.closed ? `closed (${t.closed.status})` : holder ? `open, on roadmap node "${holder.node.id}"` : 'open, in the basket'}${where.length ? ` [${where.join('; ')}]` : ''}`);
    } else if (where.length) plan.push(`${id}: [${where.join('; ')}]`);
  }

  // Index lines whose ticket has no body file anywhere become tickets whose body is that line.
  for (const [id, idx] of index) {
    if (seen.has(id)) continue;
    const t = { id, title: idx.hook.slice(0, 200) || id, type: idx.type ?? 'idea', date: idx.date ?? today(), source: 'migrated from a BACKLOG.md line with no body file' };
    if (!idx.type || !idx.date) fallbacks.push(`${id}: index-only entry without ${[!idx.type && 'type', !idx.date && 'date'].filter(Boolean).join(', ')}`);
    if (idx.mark === '~' && !holders.has(id)) t.claim = claimFromText(idx.extras, t.date);
    tickets.push(t);
    seen.add(id);
    writes.push({ file: path.join(paths.backlogDir, `${id}.md`), text: `**Migrated from BACKLOG.md** — this ticket had an index line but no body file. The line, verbatim:\n\n> ${idx.line}\n` });
    plan.push(`${id}: index-only entry -> ticket with its BACKLOG.md line as body${t.claim ? ` (${claimText(t.claim)})` : ''}`);
  }
  for (const id of holders.keys()) if (!seen.has(id)) fallbacks.push(`${id}: referenced by roadmap node "${holders.get(id).node.id}" but no file or index line carries it`);

  if (fs.existsSync(paths.legacyIndex)) { plan.push('BACKLOG.md: retired (every listed ticket accounted for)'); removes.push(paths.legacyIndex); }

  const board = { paths, backlog: { tickets }, roadmap };
  const view = { added: new Set(writes.map((w) => w.file)), removed: new Set(removes.filter((r) => !writes.some((w) => w.file === r))) };
  const problems = fallbacks.some((f) => f.includes('referenced by roadmap')) ? [] : validateBoard(board, view);

  const open = tickets.filter(isLive);
  const lines = [
    `Migration plan for ${paths.root}:`,
    ...plan.map((p) => `  ${p}`),
    `  -> ${tickets.length} ticket(s) into ${paths.backlogJson}: ${open.filter((t) => !holders.has(t.id)).length} in the basket, ${open.filter((t) => holders.has(t.id)).length} open on the roadmap, ${tickets.length - open.length} closed`,
  ];
  if (problems.length) lines.push('', 'The migrated board would have problems:', ...problems.map((p) => `  ${p}`));
  if (fallbacks.length) lines.push('', 'Required fields no source could supply (a fallback value would be used):', ...fallbacks.map((f) => `  ${f}`));
  const blocked = problems.length > 0 || (fallbacks.length > 0 && !options.force);
  if (dry) return [...lines, '', blocked ? 'Dry run: nothing was changed. A real run would refuse as it stands.' : 'Dry run: nothing was changed.'];
  if (blocked) { console.log(lines.join('\n')); throw new RefusedError(problems.length ? 'the migrated board would not validate.' : 'missing required fields — fix the files or re-run with --force to accept the fallbacks.'); }

  for (const w of writes) { fs.mkdirSync(path.dirname(w.file), { recursive: true }); fs.writeFileSync(w.file, w.text, 'utf8'); }
  for (const r of removes) if (!writes.some((w) => w.file === r)) fs.rmSync(r, { force: true });
  saveBacklog(paths.backlogJson, board.backlog);
  if (options['roadmap-from']) saveRoadmap(paths.roadmapJson, roadmap);
  return [...lines, '', 'Done. Run `check` to confirm the board is consistent.'];
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

function main(argv) {
  const { positional, options } = parseArgs(argv);
  const [area, command, ...args] = positional;
  if (!area || area === 'help' || options.help) { console.log(USAGE); return 0; }

  const root = options.root ? path.resolve(options.root) : projectRoot(process.cwd());
  const paths = boardPaths(root);
  const note = () => {
    // Say so when git redirected the board away from where the command was run (a linked worktree).
    if (!options.root && path.resolve(process.cwd()) !== root && !process.cwd().startsWith(root + path.sep)) console.error(`(board: ${root})`);
  };

  if (area === 'migrate') { console.log(migrate(paths, options).join('\n')); note(); return 0; }

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
    for (const f of result.files ?? []) { fs.mkdirSync(path.dirname(f.file), { recursive: true }); fs.writeFileSync(f.file, f.text, 'utf8'); }
    for (const r of result.remove ?? []) fs.rmSync(r, { force: true });
    if (result.saveRoadmap) saveRoadmap(paths.roadmapJson, board.roadmap);
    if (result.saveBacklog) saveBacklog(paths.backlogJson, board.backlog);
  }
  console.log(result.print.join('\n'));
  note();
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof RefusedError) { console.error(`refused: ${error.message}`); process.exitCode = 3; }
  else if (error instanceof UsageError) { console.error(`error: ${error.message}`); process.exitCode = 2; }
  else throw error;
}
