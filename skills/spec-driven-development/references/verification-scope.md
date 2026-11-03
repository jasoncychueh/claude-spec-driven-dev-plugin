# Verification Scope (how much a run builds, and how much it tests)

The single home for how much of the solution any build covers and how much of the suite any test run covers. The main agent drives `/implement` Stage 1 step 5, Stage 3, and Quick Fix steps 6–8 by it; `spec-implementer` and `spec-tester` read it for the scope their own runs are allowed.

"The solution" and "the suite" are not scopes. Every instruction that builds or runs tests names one below: an unscoped "build" or "run the tests" gets read as the whole solution, and on a large project that is minutes per build and hours per test cycle, repeated every fix round. Parallel executor groups also share one worktree, so whole-solution builds started by several of them at once would contend for the same `obj` / `bin` outputs. The main agent owns the whole-solution build and every test run; executors need only the rules that name them.

## Build scope

- **Executors build only what they touched.** `spec-implementer` and `spec-tester` build the projects / modules that contain the files they changed. If they changed a public interface (a signature, a contract, a shared type), they also build its **referencing projects**: every project that references the changed interface's project, directly or transitively, since a changed contract can break compilation anywhere downstream. They never build the whole solution.
- **Executors do not rebuild what they did not change.** Where the toolchain allows, they build their scope without rebuilding its dependencies (e.g. `dotnet build --no-dependencies`); otherwise the normal scoped build. A dependency-skipping flag only works when the dependencies are already built: in a fresh worktree they never were, so the first build of a scope is a normal scoped build, and the flag is used from the second build on. On a file-lock / "file in use" error they retry briefly before reporting.
- **The main agent builds the whole solution, serially, at fixed points**:
  1. the end of `/implement` Stage 1 (the code builds and the tests compile / collect);
  2. once after the Stage 2 review loop converges, before the Stage 3 test run;
  3. once more after the Stage 3 fix loop converges, **only when more than one fix group ran or a fix changed a public interface** (otherwise the test re-runs' own compile suffices).

  Quick Fix Mode: once after implementation (step 6), once after the review loop converges (before step 8), and the same conditional build after step 8's fixes. A Stage 3 fix routed through `spec-author` re-enters the review loop, and the point-2 build runs again when that loop converges.
- **Whole-solution builds are serialized, and executor builds avoid rebuilding shared dependencies.** That keeps parallel executors from running the same solution build at the same time; it does not promise zero contention, only that the heavy, shared build has a single driver.
- **Every fix dispatch lists the files that executor may change.** A build failure located in a file outside that list is a blocker report, never something the executor fixes — it would be editing another group's half-finished files. Inside the list, the executor fixes its own build failures (both modes).
- **A whole-solution build failure** (any point above) is routed to the owning session(s) through the normal fix dispatch (the fan-out rule in SKILL.md "Dispatch Granularity" applies), then the same build point is retried. A fix large enough to change the design or an interface goes through the review loop as usual.
- **Every report states what it built** (which projects / modules, which command).

## Test tiers, narrowest by default

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

- **The main agent** builds the whole solution at the points above, routes its failures, runs the affected tier (Stage 3 / Quick Fix step 8), runs the fix loop at the scope above, and decides the full suite.
- **`spec-tester`** builds / compiles only its own test projects (its dispatch lists its test files, the same limit). Mode 1 runs only the test files it wrote, once, to confirm they compile / collect and fail for the stated reason. In Mode 1 the production code is being written at the same time by the implementers, so a compile error located in a production file an implementer is writing, or one caused by a symbol the implementers have not produced yet, is expected state: the tester reports it and does not treat it as a blocker report. A compile error in the tester's own test files is still its own to fix. Mode 2 confirms compile / collect only during the Stage 2 review loop, since tests run after review; a Mode 2 fix dispatched from Stage 3 runs the fix-loop scope.
- **`spec-implementer`** builds the scope above on every dispatch (and fixes build failures only in the files its dispatch lists), and runs a test only when the dispatch asks (a Stage 3 fix handing it a failing test), and then only the fix-loop scope: the failing tests plus the tests covering the files it changed. Its Stage 2 fix dispatches confirm the scoped build and run no tests.
- **Neither executor ever builds the whole solution or runs the full suite.** An executor that finds a run too slow narrows it further; one that cannot narrow it reports a blocker.

**E2E and live-host tests**: only the subset relevant to this change, last, once, after the faster runs are green.

**Every report states the scope it ran** (what it built; which tier, which command or filter, for tests). The Summary (Stage 4 / Quick Fix step 9) records whether the full suite ran and why, or why not.

## How to build and run a scope is project-specific

Steering `tech.md` may declare per-scope build and test commands in an optional "Build and test scope" section (a `dotnet build <project>` and `dotnet test --filter` form, a pytest path or `-k` form). When it doesn't, the agent derives the scope from the changed files and states what it ran. The declaration is optional — existing steering is never failed for lacking it.
