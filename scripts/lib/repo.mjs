// spec-driven-development — where a script's files live in a git repository.
// Shared by board.mjs and design.mjs so "where is the main worktree" has one answer.
// Zero dependencies; needs Node 18 or later.

import path from 'node:path';
import { execFileSync } from 'node:child_process';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// The main worktree is where shared, machine-local state lives. `--git-common-dir` is the same
// .git for the main worktree and every linked one, and its parent is the main worktree's root.
export function mainWorktreeRoot(cwd) {
  try {
    const common = path.resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd));
    if (path.basename(common) === '.git') return path.dirname(common);
  } catch (_) { /* not a git repo, or git unavailable */ }
  try { return git(['rev-parse', '--show-toplevel'], cwd); } catch (_) { return cwd; }
}

// The worktree the command runs in: for a linked worktree, its own root rather than the main one.
export function worktreeRoot(cwd) {
  try { return git(['rev-parse', '--show-toplevel'], cwd); } catch (_) { return cwd; }
}
