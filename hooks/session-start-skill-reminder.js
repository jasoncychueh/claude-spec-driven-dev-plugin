#!/usr/bin/env node
/*
 * spec-driven-development — SessionStart skill reminder.
 *
 * Injects a short reminder at session start (startup / resume — the source is
 * filtered by the hooks.json matcher) so the agent reliably loads and uses the
 * spec-driven-development skill instead of under-triggering it.
 *
 * No project detection: whether this is a "code project" is stated as a condition
 * INSIDE the reminder and left to the agent's judgment. SessionStart runs on every
 * matched session start, so the cheapest correct thing is a static string — no
 * filesystem scan, no false positives/negatives from guessing the project type.
 *
 * It also states the absolute path of the planning board script. Hooks are the one
 * place ${CLAUDE_PLUGIN_ROOT} is a real environment variable: the agent's shell does
 * not have it, and a reference file read with the Read tool is not substituted, so
 * without this line an agent that has not loaded the skill has no way to find the
 * script.
 *
 * SessionStart cannot block the session; it only injects context. Output uses the
 * documented structured form (hookSpecificOutput.additionalContext). Side-effect-
 * free: reads nothing, writes nothing.
 */
'use strict';

const lines = [
  '📋 This project has the spec-driven-development skill installed.',
  '',
  'If this is a **code project** (anything that writes or changes code): before planning or starting work, load and use the spec-driven-development skill first — it applies to any bug fix / refactor / new feature / config change. It auto-routes to Quick Fix Mode or Spec Mode and runs the mandatory design / implementation review loop to 0 issues.',
  '',
  'If this is not a code project, just skip it.',
];

const root = process.env.CLAUDE_PLUGIN_ROOT;
if (root) {
  const board = `${root.replace(/\\/g, '/')}/scripts/board.mjs`;
  lines.push(
    '',
    `Backlog and roadmap are read and written only through the board script: \`node "${board}"\` — the \`board\` in the skill's references. Use this absolute path; the plugin-root variable is not set in the shell.`
  );
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: lines.join('\n'),
  },
}));
