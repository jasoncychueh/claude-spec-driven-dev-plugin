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
 * SessionStart cannot block the session; it only injects context. Output uses the
 * documented structured form (hookSpecificOutput.additionalContext). Side-effect-
 * free: reads nothing, writes nothing.
 */
'use strict';

const REMINDER = [
  '📋 本專案安裝了 spec-driven-development skill。',
  '',
  '如果這是**程式專案**（需要寫或改 code）：在規劃或動手之前，先載入並使用 spec-driven-development skill —— 任何 bug fix / 重構 / 新功能 / config 改動都適用。它會自動分流 Quick Fix Mode 或 Spec Mode，並跑強制的 design / implementation review loop 到 0 issues。',
  '',
  '如果不是程式專案，略過即可。',
].join('\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: REMINDER,
  },
}));
