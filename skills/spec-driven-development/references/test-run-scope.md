# Test Run Scope (how much of the suite a run covers)

The single home for how much of the test suite any run covers. The main agent drives `/implement` Stage 3 and Quick Fix step 8 by it; `spec-tester` and `spec-implementer` read it for the scope their own runs are allowed.

"The suite" is not a scope. Every instruction that runs tests names one of the tiers below: an unscoped "run the tests" gets read as the whole solution, and on a large project that is hours per cycle, repeated every fix round. The main agent owns test runs; executors need only the rules that name them.

## Three tiers, narrowest by default

- **Targeted** — the tests written or changed this cycle, plus the tests covering the changed files. Every run by every role starts here.
- **Affected** — the tests for the modules / test projects affected by the changed files, derived from what references them. This is the main scope of `/implement` Stage 3 and Quick Fix step 8.
- **Full suite** — not run by default.

## When the full suite runs

Only when skipping it carries a significant risk, and then once, at the end. The main agent decides, after the targeted and affected runs are green and the fix loop has converged. Significant risk is any of:

1. **The affected set cannot be derived reliably** — the changed code is reached via reflection, DI registration, configuration, or a naming convention.
2. **The change touches a foundation many modules share** — a cross-component public interface or contract, a shared base type or utility, framework-level code.
3. **A global-level change** — a dependency upgrade, build configuration, global settings, a database schema migration.
4. **A wide refactor** whose affected set already covers most of the solution.

Not a risk: a change confined to a few files with a derivable affected set — the common case, and no full run. Judge the risk against everything changed in the cycle, fixes included: a fix that edits a shared helper can add condition 2 after the affected run was green, which is why the decision waits until the fix loop has converged.

## The fix loop re-runs the failing tests plus the tests covering what the fix changed

After a fix, re-run **the failing tests plus the tests covering the files this fix changed** — never the whole tier again, and never the full suite again even if it was run once. A fix to a shared helper re-runs that helper's tests, because that is where the fix could have broken something the failing test does not exercise. The set grows only with the files the fix touched, not with the cycle's whole change set.

## Who runs what

- **The main agent** runs the affected tier (Stage 3 / Quick Fix step 8), runs the fix loop at the scope above, and decides the full suite.
- **`spec-tester`** Mode 1 runs only the test files it wrote, once, to confirm they compile / collect and fail for the stated reason. Mode 2 confirms compile / collect only during the Stage 2 review loop, since tests run after review; a Mode 2 fix dispatched from Stage 3 runs the fix-loop scope.
- **`spec-implementer`** runs a test only when the dispatch asks (a Stage 3 fix handing it a failing test), and then only the fix-loop scope: the failing tests plus the tests covering the files it changed. Its Stage 2 fix dispatches confirm the build and run no tests.
- **Neither executor ever runs the full suite.** An executor that finds a run too slow narrows it further; one that cannot narrow it reports a blocker.

**E2E and live-host tests**: only the subset relevant to this change, last, once, after the faster runs are green.

**Every report states the scope it ran** (which tier, which command or filter). The Summary (Stage 4 / Quick Fix step 9) records whether the full suite ran and why, or why not.

## How to run a tier is project-specific

Steering `tech.md` may declare the commands per tier in an optional "Test Run Scope" section (a `dotnet test --filter` form, a pytest path or `-k` form). When it doesn't, the agent derives the tier from the changed files and states what it ran. The declaration is optional — existing steering is never failed for lacking it.
