#!/usr/bin/env node
// spec-driven-development — record that the user approved the plan or the spec.
//
//   node approve.mjs <label>
//
// Writes nothing and changes nothing. The call itself, recorded in the session transcript,
// is the approval record: hooks/approval-gate.js reads the transcript and lets
// spec-implementer / spec-tester be dispatched after such a call, made as the first action
// after the user's reply to a briefing. This script's only jobs are to reject a missing or
// absurd label and to print one line the agent (and the transcript) can show.
//
// <label> is free-form text for the record: the spec feature name, the plan file's path or its
// slug. Nothing matches it against the dispatch — the gate checks that the user replied, not what
// the approval was for. Quote a label that contains spaces.
//
// Run it only as the first action of the turn that answers the user's explicit confirmation
// of the briefing (the end of /create-spec or /update-spec, the /implement condensed briefing, or
// a Quick Fix whose plan mode the user left with shift+tab) — never to get past the gate.

const MAX_LABEL = 200;

const label = process.argv.slice(2).join(' ').trim();
if (!label || label.length > MAX_LABEL || /[\r\n\0]/.test(label)) {
  console.error('Usage: node approve.mjs <label>');
  console.error(`  <label> is a short free-form record of what the user approved (feature name, plan path or slug); 1-${MAX_LABEL} characters, one line.`);
  process.exit(2);
}

console.log(`Recorded: the user approved "${label}". spec-implementer and spec-tester may now be dispatched.`);
