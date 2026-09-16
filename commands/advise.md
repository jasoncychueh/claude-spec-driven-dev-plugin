---
description: "Form a position first, then take it to the advisor, then answer the user"
argument-hint: "[question or idea to discuss; empty = the latest topic in this conversation]"
---

# /advise — think, then consult, then answer

The user is asking for a considered answer: one that was argued out with the advisor before it reached them. The order below is the whole point — **a position formed before the consult, a consult that challenges it, an answer that states where the two diverged**. Do not reorder the steps, and do not skip the first one.

## The topic

<!-- Exactly one substitution point, deliberately. The argument is substituted
     before this text is read, so (a) a conditional written as two prose
     branches leaves the false branch standing as an instruction, and (b) any
     mention of the placeholder token — even inside an explanation — is itself
     substituted. Both shipped as bugs in 1.23.0 / 1.23.1. -->

Topic: $ARGUMENTS

If that line is blank, the topic is the most recent thing under discussion — the user's last message, or the reply / decision just given.

## Step 1 — form a position (before any advisor call)

Write the draft **out loud, in the conversation**, not in thinking. The advisor would see it either way — the whole history, reasoning included, is forwarded — but the user would not, and Step 4 reports where the draft and the advisor diverged: a draft the user never saw gives that report nothing to point at. The draft covers, at minimum:

1. **The conclusion or recommendation** — one sentence.
2. **Why this and not something else** — the reasoning, not a restatement of the conclusion.
3. **What was considered and rejected**, and why.
4. **What is uncertain** — the places where a stronger reviewer's judgment is actually wanted.

**No draft, no consult.** A consult without a position is the failure this command exists to prevent: forwarding the user's question to the advisor and relaying whatever comes back is not thinking, it is routing, and it wastes the strongest model on work the main agent should have done first.

## Step 2 — take the position to the advisor

Call the advisor. Because the draft is already in the transcript, the call carries it. The ask is specific: **challenge the conclusion and the reasoning, name the risks or better options that were missed, and rule on the uncertain points**.

Not allowed:

- **Handing over the bare question** ("what should we do about X?") with no position attached — see Step 1.
- **Treating the reply as the answer.** The advisor's output is input to Step 3, never a substitute for it.

## Step 3 — reconcile

Set the advisor's reply against the draft: where it agrees, where it disagrees, and what the final position is. **Disagreeing with the advisor is allowed and must be argued** — say why, on evidence (the file says X, the measurement showed Y). Deferring because it is the stronger model is not an argument; a reviewer that is never contradicted is not being used as a reviewer.

## Step 4 — answer the user

The reply contains:

- **The final position** — conclusion plus reasoning.
- **Where the draft and the advisor diverged** — a short list; if there was no divergence, say so in one line.
- **What still needs the user's call**, if anything remains that the discussion could not settle.

Do not paste the exchange with the advisor. The user asked for a conclusion that survived a challenge, not a transcript of the challenge.

## When the advisor is unavailable

Say so plainly — "the advisor tool is not available right now" — and give the Step 1 draft as the answer, labeled as unreviewed. **Never pretend the consult happened, and never dispatch a subagent to stand in for the advisor**: a cheaper-tier executor is not a stronger reviewer, and calling its output an advisor verdict would misrepresent how much scrutiny the answer received (see the skill's "Advisor Gate Mechanism" — the advisor is a main-agent-only, server-side tool, and its absence collapses cleanly to the main agent's own judgment).
