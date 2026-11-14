# Testing Guide: what gets tested, and why the suite survives a refactor

Read this when writing or reviewing design.md's Testing Strategy, when writing the test tasks in tasks.md, when dispatching `spec-tester`, when a refactor or a design change turns tests red, when `/update-spec` removes or redesigns an interface, or when a Quick Fix plan names tests. How much a run builds and tests is a separate question, answered by `verification-scope.md`.

## Three kinds of test, each with its own bound

A suite whose size follows how detailed the design is grows without limit: every behavior the design describes gets a case, every reviewer finds one more, and nobody ever removes one. A suite whose size follows the system's shape stays proportionate. So every test belongs to exactly one of three kinds, and each kind has a coverage rule that also caps it.

The kind is decided by what the test runs against: our own code alone, our code together with a real external system, or a whole use case.

| Kind | What it runs against | Anchor | Coverage, and the cap | Where it is specified |
|---|---|---|---|---|
| **Unit** | Our own code alone, offline; external systems are replaced | A component's public interface | Every public method or function in design.md's Components and Interfaces is tested for its normal result and for each error behavior the design states for it. Nothing private is tested | Not listed case by case. `spec-tester` derives the cases from the interface contract; a test task names the interfaces it covers |
| **Integration** | Our code together with a real external system (a runtime, an API, a database, a file format) | (a) An assumption the design makes about that system, or (b) a public interface bound to it | (a) One test per assumption, at the adapter that wraps the system. (b) Per bound method, one test of its normal result (skipped when an assumption or E2E test already calls it and asserts its result) plus one per error the external system itself produces; an error our own code decides before calling the system is a unit test | (a) A row in design.md's Test Cases table. (b) Not listed: the Test Approach names the bound interfaces, and `spec-tester` derives the cases like unit tests |
| **E2E** | A whole use case, end to end | A requirement's user story in requirements.md | One test per use case, walking its main success flow. A second one only for an acceptance criterion that cannot be observed without the whole flow | A row in design.md's Test Cases table |

**Why unit tests stop at the public interface.** A component that offers a method to others promises its result, so that promise is what gets tested, including each error the design states. A private helper is reached through the public method that uses it: if it is wrong, a public result is wrong, and the unit test of that method catches it. Testing the helper directly only couples the suite to the current structure. If complex logic sits behind a thin public method and is hard to exercise through it, that is a design signal, not a reason to test privately: the logic wants to be its own component with a public interface, tested by the same rule.

**Why E2E stops at the use cases.** End-to-end and live runs are the slow and expensive tier, and covering every operating scenario is impossible anyway. Their job is to prove that the ways the feature is actually used work from end to end. The use cases are exactly that list, and the user has already confirmed them in requirements.md. Acceptance criteria that are rules ("an empty `user_id` returns 400", "a duplicate submission does not charge twice") are verified by the unit tests of the interface that enforces the rule, not by another E2E run.

**Why integration tests are separate, and why their cap is tighter.** A unit test replaces the external system, so it cannot catch a wrong assumption about that system, nor a bound method that misuses it. An E2E run would fail, but too coarsely to say which assumption broke. The real risk of a feature built on an external runtime is usually a handful of unmeasured facts about that runtime ("this call returns an empty list, not null, for an unsaved document"), so each such fact gets one targeted test at the adapter, listed in the design because it is a design assumption. Some public interfaces cannot be exercised without the system at all (the design forbids replacing it there, because its real behavior is the point); their tests are integration tests too. Integration tests usually need the system running, which makes them the expensive tier, so the cap is tighter than unit's: a bound method gets its normal result and the errors the system produces, while every error our own code decides (an invalid argument, a malformed request) is moved to an offline unit test. If a bound method holds substantial logic of its own, that is a design signal: the logic wants its own component, unit-tested offline, leaving a thin binding.

**Not every integration test needs a live system.** A database can run in a local container and a file format can be checked against real sample files offline; they are still integration tests, because they run against the real external behavior. The Spec Briefing reports how many integration and E2E tests need a live runtime, because that number is the suite's main cost.

**Choose the cheapest kind that proves the behavior.** A behavior that a unit test can prove is never pushed to integration or E2E. A fault class gets one representative integration or E2E test, never one per fault.

**Excess is a defect too.** A test that fits no kind, duplicates another test's coverage, or sits in a costlier kind than its behavior needs is a Smell, the same as a missing one, and so is a test-support seam (a fault-injection hook, a debug-only switch) that no test runs: it is dead code. Reviewers grade both directions.

## Every test anchors to something that outlives the implementation

Tests written as an afterthought by whoever just wrote the code are thin, and they rot: they assert what the implementation *happened to do*, so a refactor turns the suite red everywhere and nobody can tell a real regression from a test that was only describing the old structure. The usual response, repairing them all, spends days buying no protection. Anchoring removes the cause.

Each test names its anchor from the table above: a public interface, an external assumption, or a use case. Never an internal function, private state, or a description of how the code works. A test that can anchor to none of them is not written.

design.md's `## Testing Strategy` holds the Test Cases table (the assumption and E2E rows) and the Test Approach (harness, fixtures, the seams the tests need, and the public interfaces bound to an external system). `spec-author` writes it and `design-reviewer` reviews it with the rest of the design, the cheapest moment to fix it.

## The writer is kept blind

`spec-tester` is dispatched in parallel with `spec-implementer`, on the same design basis, and does not read the source files that dispatch is writing. It cannot assert the implementation's shape because it cannot see it: the property strict test-first TDD buys, without serializing the cycle. It fits the file-disjointness invariant for free, since test files and source files never overlap. The unit cases it derives come from the interface contract alone, which is why that contract has to be precise (SKILL.md "Docs for Agents, Code as Truth"). The test run after the review loop (`/implement` Stage 3) reconciles the two sides. A disagreement neither side can settle from the basis is a **design ambiguity** worth surfacing, not a coin toss.

## Live fixtures are validated before tests are stacked on them

When integration or E2E tests share a fixture against a live system, a broken fixture fails every test built on it at once, and every review round spent on those tests before the first live run is wasted. So when the runtime is available during the cycle, the phase's test task builds the fixture and one smoke test first, and the main agent runs that smoke test before the remaining live tests are written on top of it. When the runtime is not available, there is nothing to run the smoke test against: the tester writes its assigned rows directly, the Spec Briefing has said so, and the live tests are kept to the table's rows, because they are written blind to the runtime as well as to the code, so each one is a guess until it runs.

## Specs written before the three kinds

A spec whose Test Cases table still has the earlier `Level` column (`behavior` / `interface` / `e2e` rows), with test tasks that carry `Cases:` but no `Interfaces:`, stays valid. It is judged by the rule it was written under: every case ID claimed by exactly one test task. The three-kind checks (the `Kind` column, `Interfaces:` coverage, the excess checks) apply once an `/update-spec` that touches the Testing Strategy migrates the table: `interface` rows become the `Interfaces:` of a test task, `behavior` rows that a unit test of an interface covers are dropped, and what remains becomes `e2e` or `integration` rows.

## Refactor triage: classify red, don't investigate it

When a refactor turns tests red, the anchor decides what to do:

| The red test's anchor | Verdict | Action |
|---|---|---|
| A use case, or a public interface this change did not redesign | A real regression: behavior the spec still demands has broken | **Fix the code.** The test does not change |
| A public interface **that this change redesigned** | The correct way for a test to die | **Rewrite it from the new design, or delete it.** Do not patch it back to green |
| An external assumption | The external system no longer behaves as the design assumed | **A design question** for `spec-author`: the assumption and the adapter change together |
| Nothing traceable | It was only describing the old structure | **Delete it.** Repairing it buys nothing |

A test invalidated by a deliberate interface change is *supposed* to break, and patching it to pass reintroduces the coupling. **`/update-spec` decides this when the design changes**, not months later. When a revision removes or redesigns an interface, the unit test task that names it is marked `[~]` (rewrite) or `[-]` (removed) in the same edit. When a use case or an external assumption goes away, its Test Cases row is struck and its test task marked the same way. "Which tests should die" becomes a recorded design decision rather than a guess made by whoever hits the red.

## Quick Fix Mode

No case table and no separate tester. The plan's change list names the tests as behaviors to verify, and `spec-implementer` writes them by the same three kinds: unit tests for the public interfaces the fix changes, integration tests for those bound to an external system (normal result plus the errors the system produces) and for any new assumption about that system, and an E2E test only when a use case's flow changes. The anchoring discipline still holds: assert the specified behavior, never the shape of the code just written.
