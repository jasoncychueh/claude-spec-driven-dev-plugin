# Approval Gate Mechanics

How `hooks/approval-gate.js` decides whether a `spec-implementer` / `spec-tester` spawn may proceed. SKILL.md "Planning Phase and Approval Gate" holds the operating rules (when to run `approve.mjs`, and that it is the first action of the turn, only on explicit approval); read this file when the gate denies a dispatch you expected to pass, when a session mixes Quick Fix and Spec Mode work, or when changing the hook.

**What Plan Mode really protected was "no code before approval"**, and `spec-implementer` and `spec-tester` are the skill's code-writing delegates, so those two dispatches are gated structurally. The hook denies a spawn of either agent unless the session transcript shows the user approved, by either of two kinds of evidence. The gate covers those two dispatches only; other ways code could change (the main agent's own edits, a general-purpose agent) are governed by this skill's rules, not by the hook.

## The two kinds of evidence

- **An approved ExitPlanMode** (Quick Fix Mode): an ExitPlanMode call whose result is not an error. A rejected call, and one the briefing checkpoint denied, are not approvals.
- **The approval script**, called as the first action after the user's reply to a briefing (Spec Mode, and a Quick Fix where the user left plan mode with shift+tab instead of approving the dialog): the sequence is briefing text (turn end) → a human message → the call. A human message with no agent text before it (a session's first message, `/implement foo` straight into the call) is not a reply to anything. A prompt the user typed while the agent's turn was running counts as a reply; slash-command, local-command-output and interrupt entries are not replies and are skipped.

**A later plan-mode entry voids earlier evidence**: an EnterPlanMode call, or the user's own shift+tab back into plan mode. The most recent valid evidence wins, so a new plan cycle needs a new approval.

## What the gate does not bind

**The gate does not bind an approval to a particular plan or spec.** It never reads the dispatch prompt: it checks that the user replied, not what the approval was for. The accepted cost is that, within a session, an approval stays valid until the next plan-mode entry — a second feature or a second plan in the same session is not re-gated until plan mode is entered again, so brief and confirm each one as this skill's flows require. The dispatch-prompt rule "names its design basis" (SKILL.md "Dispatching") is good practice for the executor, not something the hook matches.

**What the hook verifies**: that the user replied after a briefing (or approved the ExitPlanMode dialog) and that the script call came right after that reply. It cannot read what the reply said. The main agent runs the script only on an explicit approval; a hedge, a question or an objection is not one. That rule is this skill's, not something the hook enforces.

**Why the call must come before any text**: the hook cannot tell a trailing acknowledgement ("Got it, recording…") from a briefing written in the same turn, so any agent text between the user's reply and the call makes the evidence void and the user would have to confirm again.

## What passes untouched

Resumes go through SendMessage, not the spawn tool, so they are not gated — the original spawn was. Every other agent passes untouched, and the hook is fail-open on anything it cannot judge (no or unreadable transcript, a call from inside a subagent, an unexpected error), so it cannot deadlock. **Headless `claude -p` runs are denied by design**: there is no human reply to wait for, so no run of `spec-implementer` or `spec-tester` can start there.
