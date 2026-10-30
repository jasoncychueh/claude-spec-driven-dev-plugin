# Design Principles

The single home for the design rules that `spec-author` applies while writing a design, that `design-reviewer` and `implementation-reviewer` review against, and that `spec-implementer` is bound by while writing code. Other documents point here and do not restate the rules — one decision lives in one place, and this plugin's own docs follow that rule too.

> Why this doc exists: an agent left to itself takes the path of least resistance, and in design and code that path is **accretion** — a new requirement is bolted beside the old design, a bug is silenced where it surfaces, a second copy of a rule is typed where the first one lives. Each step is small and locally reasonable; the sum is a design nobody would have drawn on purpose. The principles below name the shape each violation usually takes, so the author can avoid it and the reviewer can recognise it.

## Table of Contents

1. [How to apply these](#how-to-apply-these)
2. [Group 1: Anti-accretion](#group-1-anti-accretion)
   - [Don't bolt on](#dont-bolt-on)
   - [Fix the cause](#fix-the-cause)
3. [Group 2: Laziness & Foundational Thinking](#group-2-laziness--foundational-thinking)
   - [Smallest edit](#smallest-edit)
   - [One decision, one place](#one-decision-one-place)
   - [Data shape first](#data-shape-first)
   - [Foundation first](#foundation-first)
4. [Group 3: Boundary, Idempotency & State](#group-3-boundary-idempotency--state)
   - [Validate at the boundary](#validate-at-the-boundary)
   - [Pure core, I/O at the edges](#pure-core-io-at-the-edges)
   - [Don't silence the compiler](#dont-silence-the-compiler)
   - [Idempotent under retry and rerun](#idempotent-under-retry-and-rerun)
   - [One writer](#one-writer)
5. [Default severities](#default-severities)

---

## How to apply these

**The scenario gate comes first.** Every principle fires only when a real use case reaches it. Idempotency matters where a retry or rerun path actually exists; one-writer matters where a second writer actually exists; boundary validation matters where outside data actually enters. Each Review probe below starts from "**which scenario hits this?**" — if you cannot name one, the principle is not triggered, and demanding it anyway is over-engineering for an imagined requirement. This is the same rule as `review-protocol.md` "Overriding criterion" (a path no use case drives gets fail-fast + an error log, not defensive code) and the "build a use-case model first" step in `checklists.md`; these principles do not relax it and do not override it. **Tie-breaker with over-engineering:** the Design Review "Over-engineering" check fires only where no triggered scenario justifies the structure; a structure that a triggered principle requires (an idempotency key, a single-writer channel) is not over-engineering.

**Scope of judgment.** A principle is an issue only for what the change adds or modifies, or for a pre-existing violation the change makes worse (a third copy of a duplicated rule, a new writer on already-shared state). Other pre-existing violations in the surrounding code go in the reviewer output's **Out-of-scope findings (non-blocking)** block (`review-protocol.md`, "Output format") — not issues, not counted toward convergence — for the main agent to triage.

**Every principle has the same fields:** Rule (one sentence); Why agents break it (the least-resistance shape the violation usually takes); Review probe (the concrete question the reviewer asks, and the author asks of their own draft); Bad → Good (a short example — C# is the example language, the rules are language-independent); Stage (where it is caught: `design` — the plan file or design.md — `code`, or `both`). Severities are not repeated per principle; they live only in the [Default severities](#default-severities) table. The examples share one small domain model, with `Money` defined once under [Fix the cause](#fix-the-cause).

**Who applies what.** The author applies the principles while designing and writes the handling into the design itself, as ordinary design prose (the component description says "writes with an `order_id` unique key + upsert"); there is no separate principles checklist. The design reviewer and the implementation reviewer review the design / the code against every principle whose Stage includes their stage and grade by the severity table; that table is what makes the principles binding, since Critical and High findings are fixed in the round they appear and cannot be waived. The implementer applies the `code` principles. Foundation first on a Spec Mode tasks.md is checked by `tasks-design-verifier` as an advisory item, because tasks.md is written after the design loop. A violation that is faithful to the approved design basis is not a code issue: the implementation reviewer reports it as a design-basis issue for the main agent to route.

**Principle names stay in the review — never in the work product.** The names (Don't bolt on, One decision, one place, ...) are for the review conversation only: reviewer issue lists, the review log, the main agent's challenge. Code comments, plan files and spec documents carry the actual reason, never a citation of a principle or of this document. The one exception is the Quick Fix plan file's embedded `## Review Log` section: it is review record, not plan substance, and may cite principle names; the rule applies to the plan's substance.

```csharp
// Bad: cites the principle
// per the "Idempotent under retry and rerun" principle
if (!await _db.Payments.AnyAsync(p => p.EventId == evt.Id)) { ... }
// design.md: "Per One decision, one place, pricing lives in PricingPolicy."

// Good: states the reason
// webhooks are redelivered; the event_id unique key makes a duplicate delivery a no-op
// design.md: "Pricing lives in PricingPolicy so checkout and the cart view cannot disagree."
```

---

## Group 1: Anti-accretion

**Trigger: any change to existing code or an existing design.** A change to existing code is where accretion happens, so this group is always in play for one.

### Don't bolt on

**Rule**: Judge a change as if the design had been built with this requirement from the start, and subtract before you add — first ask what the old design contains that the new requirement makes wrong, redundant, or special-cased, and remove or reshape that before adding anything beside it.

**Why agents break it**: Reading the existing code as fixed terrain and finding the nearest place to attach the new behavior: a new flag, a new branch before the old path, a new field next to the old one, a second code path that is "just for the new case". The old path stays untouched because untouched feels safe, and the design now carries two ways of doing one thing.

**Review probe**: Which scenario does the new requirement add, and if the original author had known about it, would they have drawn this structure? Where does the change differ from that from-scratch structure, and is the difference worth its cost (a refactor too large for this change, a public contract that cannot move)? An extension is acceptable when the reason holds; it is not acceptable when the from-scratch structure is simply cheaper to reach and nobody looked.

**The author's one obligation — the reason for an extension.** When a change extends existing structure and a visible redesign option was not taken, the plan's change description (Quick Fix Mode) or the component text in design.md (Spec Mode) states the reason in a sentence. Example: "Retries are added inside `PaymentClient.Send` rather than a shared HTTP pipeline: it is the only client calling the gateway today." It is not needed for an ordinary small fix where no redesign option is in view. An extension with no stated reason where a redesign was in view is reviewed as a Don't bolt on finding, graded by the accreted-fix row of the severity table.

**When the from-scratch structure is much larger than the brief** — in Quick Fix Mode, large enough that it would cross the Quick Fix bar (`mode-selection.md`) — it is not a High reviewer issue. It is an **Architecture Decision**: the user decides between extending now (with the reason stated) and the larger redesign, which may mean upgrading to Spec Mode. The author flags it in its report as needing escalation instead of footnoting it; the reviewer lists it with the options; the main agent escalates it.

**Bad → Good**:

```csharp
// Requirement: support partial refunds.
// Bad: bolted on. The old full-refund path is untouched; a flag and a second path sit beside it.
public async Task Refund(Order order, Money? partialAmount)
{
    if (partialAmount is not null)
    {
        order.RefundedAmount += partialAmount.Value;   // new path: no status, no limit check
        return;
    }
    order.Status = OrderStatus.Refunded;               // old path
    order.RefundedAmount = order.Total;
}

// Good: designed as if partial refunds had always been required.
// A refund is a row of its own, keyed by a RefundId the client supplies and the store enforces
// as UNIQUE, so a client retry of the same request inserts nothing the second time.
// A "full refund" is just the case where the amount equals what remains.
public sealed record Refund(RefundId Id, OrderId OrderId, Money Amount);

public static Refund Issue(Order order, RefundId id, Money amount)
{
    if (amount > order.Remaining) throw new RefundExceedsRemainingException(order.Id, amount);
    return new Refund(id, order.Id, amount);
}
// INSERT INTO refunds (refund_id, order_id, amount) VALUES (...) ON CONFLICT (refund_id) DO NOTHING
// Remaining is derived: Total minus the sum of the order's refund rows; 0 means fully refunded.
// The separate full-refund path and the stored RefundedAmount are deleted.
```

In a plan: instead of "add `isPartial` to `RefundRequest` and branch in `RefundService`", write "a refund is a row with an amount and a client-supplied refund id (unique at the store); the full-refund path becomes the amount-equals-remaining case and is removed".

**Stage**: both.

### Fix the cause

**Rule**: A guard that only hides the symptom is not a fix — find why the bad state arises and fix it there.

**Why agents break it**: The symptom is visible and the cause is not; a null check, a clamp, a `try/catch`, or a retry at the point of failure makes the failure disappear in one edit. The reproduction goes green, the cause stays, and the next symptom appears somewhere else.

**Review probe**: Which scenario produces the bad state, and does the change stop that scenario from producing it, or only stop the next line from noticing? If the guard were deleted, would the bad state still be created?

**Bad → Good**:

```csharp
// Bug report: order totals are sometimes negative.
// Bad: clamp the symptom where it shows.
var total = lines.Sum(l => l.UnitPrice.Amount * l.Quantity);
if (total < 0) total = 0;

// Good: the cause is the refund flow, which called AddLine with a negative price.
// Money cannot be negative, so AddLine can no longer receive one; a refund is its own operation.
// (This Money is the one every example in this file uses.)
public readonly record struct Money
{
    public static readonly Money Zero = new(0m);

    public decimal Amount { get; }
    private Money(decimal amount) => Amount = amount;

    public static Money Create(decimal amount) =>
        amount >= 0 ? new Money(amount) : throw new ArgumentOutOfRangeException(nameof(amount));
    public static bool TryCreate(decimal amount, out Money money)
    {
        money = amount >= 0 ? new Money(amount) : Zero;
        return amount >= 0;
    }

    public static Money operator +(Money a, Money b) => new(a.Amount + b.Amount);
    public static Money operator *(Money a, decimal factor) => Create(a.Amount * factor);
    public static bool operator >(Money a, Money b) => a.Amount > b.Amount;
    public static bool operator <(Money a, Money b) => a.Amount < b.Amount;
    public static bool operator >=(Money a, Money b) => a.Amount >= b.Amount;
    public static bool operator <=(Money a, Money b) => a.Amount <= b.Amount;
}

public void AddCredit(Money amount)   // the refund flow calls this instead of AddLine(-price)
{
    if (amount > Total) throw new CreditExceedsTotalException(amount, Total);
    _credits.Add(amount);
}
```

**Stage**: both.

---

## Group 2: Laziness & Foundational Thinking

### Smallest edit

**Rule**: Change only what the problem needs — no drive-by refactors, renames, reformatting, or "while I'm here" cleanups.

**Reconciled with Don't bolt on**: the edit is small, but small *in the place a from-scratch design would put it*. Don't bolt on decides where the change belongs; Smallest edit keeps the change to that place. Reshaping what already exists in order to remove a special case is part of the change, not a drive-by. A drive-by is a change the requirement does not need.

**Why agents break it**: Touching code feels like making it better, and a diff that fixes the bug and also tidies the file looks more thorough. It also makes the real change impossible to review, and puts unrelated behavior at risk.

**Review probe**: Which part of this diff does the requirement need, and which part would still be here if the requirement were dropped? Is the unneeded part safe to leave for its own change?

**Bad → Good**:

```
Problem: FormatDueDate shows the wrong day for users west of UTC.

Bad:  plan change list renames Invoice.DueDate to Invoice.PaymentDueOn, converts Invoice to a
      record, reformats the file, and fixes the time zone.
Good: plan change list is FormatDueDate converting to the user's zone before taking the date,
      plus one test for UTC-8. Anything else noticed goes to the report as an out-of-scope finding.
```

**Stage**: both.

### One decision, one place

**Rule**: A rule, a constant, a mapping, or a decision is written in exactly one place; every other place calls or reads it.

**Why agents break it**: Copying the lines that already work is cheaper than finding or creating the shared home, and two copies pass every test the day they are written. They drift later: one is changed, the other is not, and nothing fails until a customer sees two different prices.

**Review probe**: Which scenario needs this rule — and is the same rule already decided elsewhere, in this change or in existing code? If the rule changed tomorrow, how many places would have to change?

**Bad → Good**:

```csharp
// Bad: the discount rule in two places, already drifted (> vs >=).
// CheckoutService
var discount = cart.Total.Amount > 100m ? cart.Total * 0.10m : Money.Zero;
// CartView
var discount = cart.Total.Amount >= 100m ? cart.Total * 0.10m : Money.Zero;

// Good: one home.
public static class PricingPolicy
{
    private static readonly Money Threshold = Money.Create(100m);

    public static Money Discount(Cart cart)
    {
        // the one discount rule: 10% once the cart total reaches the threshold
        return cart.Total >= Threshold ? cart.Total * 0.10m : Money.Zero;
    }
}
// CheckoutService and CartView both call PricingPolicy.Discount(cart).
```

**Stage**: both.

### Data shape first

**Rule**: Get the data shape right before writing the logic, and make illegal states unrepresentable — in the types (a discriminated union or a sealed record hierarchy) and in the schema (NOT NULL, FK, unique, CHECK).

**Why agents break it**: Starting with the logic and adding fields as it needs them: a `bool` here, a nullable there. Each field is cheap to add, and together they describe more states than the domain has, so every consumer carries `if` checks for combinations that should not exist, and one of them eventually misses.

**Review probe**: Which states can the domain actually be in, and can the model express a state outside that list? Which combination of fields would be a bug if it ever appeared, and does the type or schema prevent it or only the code's good manners?

**Bad → Good** (the `Invoice` model here is the one Pure core, I/O at the edges uses):

```csharp
// Bad: IsPaid = true with PaidAt = null, and IsPaid = false with PaidAt set, both compile.
public class Invoice
{
    public Guid Id { get; set; }
    public Money Amount { get; set; }
    public DateOnly DueDate { get; set; }
    public bool IsPaid { get; set; }
    public DateTimeOffset? PaidAt { get; set; }
}

// Good: each state carries exactly the data that state has.
public abstract record InvoiceState { private protected InvoiceState() { } }   // closed set
public sealed record Unpaid : InvoiceState;
public sealed record Paid(DateTimeOffset PaidAt, PaymentRef Payment) : InvoiceState;

public sealed record Invoice(Guid Id, Money Amount, DateOnly DueDate, InvoiceState State);
```

**Stage**: both.

### Foundation first

**Rule**: Order the work foundation-first — the shared type, the schema migration, the helper that several later tasks need come before the tasks that use them.

**Why agents break it**: Ordering by the user-visible feature ("endpoint, then UI, then...") and discovering the shared piece in the middle, so the early tasks are written against a shape that changes and are reworked, or each task grows its own copy of the foundation (which then breaks One decision, one place).

**Review probe**: Which later tasks need the same thing, and does the order build that thing first? If the foundation changed after task 3, how many finished tasks would be redone?

**Bad → Good**:

```
Bad:  1 Add refund endpoint   2 Add refund screen   3 Introduce Money type (tasks 1-2 now rework their decimals)
Good: 1 Introduce Money type   2 Add refund endpoint   3 Add refund screen
```

**Stage**: design — the Quick Fix plan's change list is checked by `design-reviewer`; in Spec Mode tasks.md is written after the design loop, so it is checked there by `tasks-design-verifier` (Tasks vs Design alignment, dependency order). Because that verifier is a binary pass/fail gate for `/implement` and this principle is Medium (waivable), a failed Foundation-first item there is **advisory**: it is reported with the suggested reorder and does not by itself block `/implement`; the main agent decides whether to dispatch `spec-author` to reorder tasks.md.

---

## Group 3: Boundary, Idempotency & State

### Validate at the boundary

**Rule**: Validate outside data once, at the boundary, and parse it into typed values; inside the boundary trust those types — no scattered re-validation, no raw strings, dictionaries, or DTOs in the core.

**Why agents break it**: Each layer validates defensively because it cannot see what the layer above did, or passes the raw request object down because mapping it is extra work. The result is the same check in four places that disagree, and a core that still receives unvalidated data whenever one path skips the check.

**Review probe**: Which scenario brings outside data in (a request, a file, a message, user input), and where is it first turned into a typed value? After that point, is any check repeated, and is any raw value still reachable by core logic?

**Bad → Good**:

```csharp
// Bad: the raw DTO travels inward and each layer re-checks it.
public Task Place(OrderDto dto)   // service
{
    if (dto.Amount <= 0) throw new ArgumentException(nameof(dto.Amount));
    if (!string.Equals(dto.Status, "new", StringComparison.OrdinalIgnoreCase))
        throw new ArgumentException(nameof(dto.Status));
    return _repository.Save(dto);   // the repository checks Amount and Status again
}

// Good: parsed once at the edge; the core only sees values that cannot be wrong.
public static Result<PlaceOrder> Parse(OrderDto dto)
{
    if (!Money.TryCreate(dto.Amount, out var amount) || amount == Money.Zero) return Result.Fail("amount must be positive");
    OrderStatus? status = dto.Status?.ToLowerInvariant() switch { "new" => OrderStatus.New, _ => null };
    if (status is null) return Result.Fail("a new order must have status \"new\"");
    return Result.Ok(new PlaceOrder(amount, status.Value));
}
// Core: public Task Place(PlaceOrder command) — the amount is a positive Money and the status an OrderStatus by construction.
```

**Stage**: both.

### Pure core, I/O at the edges

**Rule**: Business logic is pure functions of their inputs; reading the clock, the database, the network, or the file system happens at the edges and is passed in.

**Why agents break it**: The function that needs a value fetches it itself — `DateTime.UtcNow`, a repository call — because it is the shortest line. Logic and I/O end up in one method, and testing it takes a pile of mocks for something that is, underneath, arithmetic.

**Review probe**: Which scenario's rule is this — and can it be tested by calling it with plain values and checking the return? If the test needs mocks or a fake clock to exercise a rule, which part of the method is the rule and which is the fetching?

**Bad → Good** (the `Invoice` model is Data shape first's):

```csharp
// Bad: the rule is welded to the clock and the database, and it writes into the stored amount,
// so a rerun adds the fee again.
public async Task ApplyLateFee(Guid invoiceId)
{
    var invoice = await _db.Invoices.FindAsync(invoiceId);
    if (DateOnly.FromDateTime(DateTime.UtcNow) > invoice.DueDate) invoice.Amount += invoice.Amount * 0.05m;
    await _db.SaveChangesAsync();
}

// Good: the rule is a pure function of (invoice, today). The fee is derived, never added into
// the stored Amount, so running it twice changes nothing.
public static Money LateFee(Invoice invoice, DateOnly today) =>
    invoice.State is Unpaid && today > invoice.DueDate ? invoice.Amount * 0.05m : Money.Zero;
// handler: load the invoice; amountDue = invoice.Amount + LateFee(invoice, clock.Today).
```

**Stage**: both.

### Don't silence the compiler

**Rule**: Never use a language escape to make a warning or error go away — e.g. C# `!` null-forgiving, unchecked casts, `dynamic`, `#pragma warning disable`, `[SuppressMessage]`; Python `# type: ignore`, `typing.cast`, `# noqa`, `Any`; TypeScript `as any`, `!`, `@ts-ignore`. The one legitimate use of any of them is recording a verified false positive: the code guarantees the state the compiler cannot see, and a comment next to the escape says what guarantees it.

**Why agents break it**: The build is red and the nearest edit that turns it green is a `!` or a cast. The compiler was reporting a state the code cannot handle; silencing it keeps the state and removes the only thing that would have caught it.

**Review probe**: Which scenario makes the value null, the cast wrong, or the warning true — and what does the code do then? Does the code handle that case, or does the suppression stand in for handling it?

**Bad → Good**:

```csharp
// Bad
var name = user!.Profile!.DisplayName;                  // null is a real scenario: deleted users
#pragma warning disable CS8602
var order = (Order)cache.Get(key);                      // the entry may be evicted or expired

// Good: handle the scenario where it happens.
var name = user?.Profile?.DisplayName ?? "Deleted user";
if (cache.Get(key) is not Order order)                  // evicted or expired: reload and re-cache
{
    order = await _repository.LoadAsync(orderId);
    cache.Set(key, order);
}
```

**Stage**: code.

### Idempotent under retry and rerun

**Rule**: An operation that a retry or a rerun can reach is idempotent under both — a duplicate delivery, and a restart halfway through, each leave the same final state as one clean run — and that is guaranteed by a key the store enforces, not by a check the code performs first.

**Why agents break it**: The happy path is written first and a duplicate is handled by asking "have I seen this?" and skipping. A check-then-act guard fails twice: two concurrent deliveries both pass the check, and a crash between the write and its side effect leaves a state the guard reads as "done".

**Review probe**: Which scenario delivers this twice or restarts it midway (a webhook redelivery, a queue at-least-once, a job re-run after a crash, a client retry after a timeout)? What is the unique key, who enforces it, and what exactly is repeated on the second pass? If none of those scenarios exists, say so and stop.

**Bad → Good**:

```csharp
// Bad: check-then-act. Two concurrent deliveries both pass the check, both insert, both send.
// A rerun after a crash between the insert and the send finds the row, skips, and the receipt is never sent.
if (!await _db.Payments.AnyAsync(p => p.EventId == evt.Id))
{
    _db.Payments.Add(new Payment(evt.Id, evt.Amount));
    await _db.SaveChangesAsync();
    await _mail.SendReceipt(evt.OrderId);
}

// Good: UNIQUE (event_id). The payment row and the outbox row commit in one transaction,
// and the insert result says whether this delivery was the first.
await using var tx = await _db.Database.BeginTransactionAsync();
var inserted = await _db.Database.ExecuteSqlInterpolatedAsync(
    $"INSERT INTO payments (event_id, order_id, amount) VALUES ({evt.Id}, {evt.OrderId}, {evt.Amount}) ON CONFLICT (event_id) DO NOTHING");
if (inserted == 1)
    await _db.Database.ExecuteSqlInterpolatedAsync(
        $"INSERT INTO outbox (event_id, kind, order_id) VALUES ({evt.Id}, 'receipt', {evt.OrderId})");
await tx.CommitAsync();
// A redelivery inserts nothing; a crash before commit rolls both rows back and the redelivery redoes both.
// The outbox dispatcher is itself at-least-once, so the receipt sender dedupes by event_id.
```

**Stage**: both.

### One writer

**Rule**: Shared mutable state with more than one writer is the thing to avoid: separate it so each actor owns its own mutable state, or, where that is impossible, there is exactly one writer and that is enforced structurally — by ownership, types, or a channel — not by convention or a lock others may forget.

**Why agents break it**: A shared dictionary is the shortest way to let two parts of the program see the same data, and a lock makes the test pass. The lock protects only the callers that remember it, and the design now needs every future writer to know the rule.

**Review probe**: Which scenario puts a second writer on this state (a background job and the UI, two request handlers, a timer)? If there is one, what stops a third writer from appearing — the type system, or a comment? If there is no second writer, a single-threaded owner needs nothing more.

**Bad → Good**:

```csharp
// Bad: the background sync and the UI both mutate one cache; "be careful" is the only protection.
public static readonly Dictionary<string, Item> Cache = new();
// SyncWorker:  Cache[item.Id] = item;
// ItemViewModel: Cache[id].Name = newName;

// Good: the sync worker is the one writer; everyone else reads an immutable snapshot
// and asks the writer to change things.
public sealed class ItemStore
{
    // volatile: the writer loop publishes a new snapshot that other threads read without a lock
    private volatile ImmutableDictionary<string, Item> _snapshot = ImmutableDictionary<string, Item>.Empty;
    private readonly Channel<ItemCommand> _commands = Channel.CreateUnbounded<ItemCommand>();

    public IReadOnlyDictionary<string, Item> Snapshot => _snapshot;     // read-only to everyone
    public ValueTask Submit(ItemCommand command) => _commands.Writer.WriteAsync(command);
    // One loop drains _commands and replaces _snapshot: the only write path.
}
```

**Stage**: both.

---

## Default severities

These are defaults. The severity definitions in `review-protocol.md` (Critical = production incident, High = tech debt within 6 months or a misuse trap) still govern: grade by the actual impact the scenario gives, and say so when you move off the default. Critical and High are fixed in the round they appear; only Medium and Low go to the deferred batch where the user may waive them (`review-protocol.md`, "Loop convergence rules").

| Severity | Default for |
|---|---|
| **Critical** | A lost update or a duplicate effect you can name a real scenario for: two writers on shared state with nothing coordinating them (One writer), or a retry / rerun that repeats a harmful effect — a second order, a second charge (Idempotent under retry and rerun). Outside data reaching core logic unvalidated where it can corrupt state (Validate at the boundary). |
| **High** | Shared state with 2+ writers that is correct today only by convention — a lock every writer must remember, a "only call this from the sync worker" comment — so the next writer can break it (One writer). A retry / rerun path whose duplicate is prevented only by a check-then-act guard rather than a key the store enforces (Idempotent under retry and rerun). One decision living in two places (One decision, one place). A symptom-hiding guard accepted as the fix (Fix the cause). An accreted fix where the from-scratch structure clearly differs and is within the change's scope (Don't bolt on; a much larger one is an Architecture Decision, see there). A data model that admits illegal states (Data shape first). A silenced compiler (Don't silence the compiler). |
| **Medium** | Business logic mixed with I/O, so tests need a pile of mocks (Pure core, I/O at the edges). Scattered internal re-validation (Validate at the boundary). Changes beyond the smallest edit — drive-by changes (Smallest edit). Tasks not ordered foundation-first (Foundation first; in `tasks-design-verifier` this is advisory — reported with the suggested reorder, not a block on `/implement`). |

A principle that no real scenario reaches is not an issue at any severity — the scenario gate applies before grading. An operation whose repeat leaves the same result (recomputing the same report, re-setting the same value) is already idempotent and is not an issue at all.
