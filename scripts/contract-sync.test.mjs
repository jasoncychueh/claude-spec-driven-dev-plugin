// Checks that agents/spec-implementer.md carries the contract definition word for word.
//
// SKILL.md "Docs for Agents, Code as Truth" is the one home of the seven contract items and the
// tie-break. spec-implementer acts on them item by item and does not load SKILL.md, so it carries
// a verbatim copy. A copy that drifts from its home is caught here, at test time, instead of by a
// reviewer round.
//
// Run: node scripts/contract-sync.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillPath = path.join(root, 'skills/spec-driven-development/SKILL.md');
const implementerPath = path.join(root, 'agents/spec-implementer.md');

let failures = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failures++;
    console.log(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

// The seven items: the first run of lines "1. " .. "7. " after `anchor`, indentation stripped.
function contractItems(text, anchor) {
  const start = text.indexOf(anchor);
  if (start < 0) return null;
  const lines = text.slice(start).split(/\r?\n/);
  const items = [];
  for (const line of lines) {
    const m = line.match(/^\s*([1-7])\.\s(.*)$/);
    if (m && Number(m[1]) === items.length + 1) {
      items.push(line.trim());
      if (items.length === 7) return items;
    } else if (items.length > 0 && line.trim() !== '') {
      return items; // the list ended early
    }
  }
  return items;
}

const skill = fs.readFileSync(skillPath, 'utf8');
const implementer = fs.readFileSync(implementerPath, 'utf8');

const home = contractItems(skill, "**Code is the system's truth.**");
const copy = contractItems(implementer, '**Hold to the contract exactly.**');

check('SKILL.md has seven contract items', home && home.length === 7, `found ${home ? home.length : 'no anchor'}`);
check('spec-implementer.md has seven contract items', copy && copy.length === 7, `found ${copy ? copy.length : 'no anchor'}`);

if (home && copy) {
  for (let i = 0; i < 7; i++) {
    check(`contract item ${i + 1} matches`, home[i] === copy[i], `SKILL.md:      ${home[i]}\n  implementer:   ${copy[i]}`);
  }
}

const tieBreak = implementer.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('Tie-break:'));
check('spec-implementer.md has a tie-break line', Boolean(tieBreak));
if (tieBreak) {
  check('the tie-break appears verbatim in SKILL.md', skill.includes(tieBreak), tieBreak);
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall contract-sync checks passed');
