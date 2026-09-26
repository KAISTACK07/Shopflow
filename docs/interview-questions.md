# Likely interview questions

Every question an interviewer could reasonably ask about ShopFlow, grouped by topic, each with a short
answer outline. It grows every phase. Practise answering **without** looking at the outline.

---

## Architecture & design choices

**1. Why a service layer? Why not put the logic in the route functions?**
Routes deal with HTTP; services hold business rules and transaction boundaries. Services can be called
from tests or scripts (the seed script) without HTTP, and a route stays a few lines long.

**2. Why synchronous SQLAlchemy instead of async?**
Simpler to read and debug; row locks work the same. FastAPI runs sync routes in a threadpool, so
concurrency comes from threads plus the connection pool. The ceiling is pool size / thread count, which we
measure in the load test instead of guessing. Async would matter at much higher concurrency.

**3. Why store money as integer paise instead of float?**
Floats can't represent 0.1 exactly (`0.1 + 0.2 != 0.3`), so totals drift. Integers are exact; the UI divides
by 100 only for display. `NUMERIC` would also work; integer paise is simpler and faster.

**4. Why is stock in a separate `inventory` table instead of a column on `products`?**
Checkout locks inventory rows with `FOR UPDATE`. With a separate table, an admin editing a product's name
doesn't wait behind checkout locks, and stock logic lives in one place.

**5. Why both an application check and a DB `CHECK (quantity >= 0)`?**
The app check gives a friendly 409 naming the product. The constraint is the last line of defence: even
buggy code or a manual SQL update can't make stock negative.

**6. Why can't a user register as admin?**
The public `/register` always creates `customer`. Admins come only from the seed script, so there is no
privilege escalation through a public endpoint.

**7. Why is the role loaded from the DB on each request instead of trusting a `role` claim in the JWT?**
A JWT can't be revoked before it expires. Reading the role from the DB means demoting a user takes effect
immediately. Cost: one indexed primary-key lookup per request.

## Concurrency & transactions

**8. Explain the race condition when two buyers try to buy the last unit.**
Both read `quantity = 1`, both decide there is enough, both write `quantity = 0` and create orders:
one unit sold twice. The read-check-write sequence isn't atomic.

**9. How does `SELECT ... FOR UPDATE` fix it?**
The first transaction locks the row; the second blocks on its `SELECT ... FOR UPDATE` until the first commits,
then reads the *new* value (0) and fails with 409. The check and the update become one serialized step per row.

**10. Why lock inventory rows sorted by `product_id`?**
Buyer 1 locks A then waits for B; buyer 2 locks B then waits for A → deadlock (Postgres detects it and
aborts one). If everyone locks in the same order, nobody can hold a later lock while waiting for an earlier one,
so no cycle can form.

**11. Why lock the order row when cancelling?**
Two concurrent cancel requests could both see `pending` and both restore stock (stock created from nothing).
Locking the order row serializes them: the second sees `cancelled` and gets 409.

**12. Could `UPDATE inventory SET quantity = quantity - n WHERE quantity >= n` replace `FOR UPDATE`?**
For one product, yes: an atomic conditional update. For a multi-item cart you still need all-or-nothing across
rows and a list of *which* items failed, so explicit locks in one transaction are clearer. Good to mention as an
alternative.

## Idempotency

**13. What problem does an Idempotency-Key solve?**
A client times out and retries, or a user double-clicks. Without a key, each retry creates a new order and takes
stock again. With a key, the server recognises the retry and returns the first result.

**14. Why use the unique constraint instead of "SELECT the key, then INSERT if missing"?**
Check-then-insert races: two requests both see "missing" and both insert. With `UNIQUE (user_id, key)` and
`INSERT ... ON CONFLICT DO NOTHING`, Postgres makes the second insert wait until the first transaction
finishes, and only one can ever succeed.

**15. Same key, different body — why 409?**
The client is reusing a key for a *different* operation, which is a client bug. Replaying the old response would
silently ignore the new request, so we refuse it. We detect it by comparing a SHA-256 hash of the body.

**16. Why don't you store failed checkouts for replay?**
The key row is in the same transaction as the order, so a failure (e.g. out of stock) rolls it back. The client
can retry the same key after a restock. Trade-off: a retry can give a different answer from the first attempt,
which is fine because the first attempt changed nothing.

## Redis & rate limiting

**17. Why fail open when Redis is down?**
Rate limiting protects the system but isn't what keeps data correct; the DB locks prevent overselling. Failing
closed would turn a Redis outage into a full checkout outage. We log a warning so the outage is visible.

**18. Fixed window vs sliding window?**
Fixed window (INCR + EXPIRE per minute) is simple but allows up to 2× the limit around a window boundary.
A sliding log or sliding counter is smoother but costs more memory or maths. Fixed window is enough here.

## Observability & errors

**19. What does the request middleware do?**
Gives each request an id (reuses a safe incoming `X-Request-ID` or generates a uuid4), stores it in a
`ContextVar` so every log line includes it, logs method/path/status/latency as JSON, returns the id in the
response header, and turns unexpected exceptions into a generic 500.

**20. Why a `ContextVar` for the request id instead of a global variable?**
Many requests are handled at once on different threads and tasks. A global would be overwritten by another
request; a `ContextVar` holds a separate value per request context, and FastAPI copies it into the worker
thread that runs a sync route.

**21. Why validate the incoming `X-Request-ID` before trusting it?**
It ends up in logs and a response header. Limiting it to 64 safe characters prevents log injection
(e.g. newlines forging fake log lines) and huge values.

**22. How do you make sure stack traces never reach the client?**
The middleware catches any unhandled exception, logs the full traceback server-side with the request id,
and returns `{"error": {"code": "INTERNAL_ERROR", ...}}`. A test raises an exception containing a
"secret" string and asserts it doesn't appear in the response.

**23. Why don't validation errors echo the input back?**
Pydantic's error includes the rejected `input`. For a login request that could be the password, so the
handler keeps only `loc`, `msg`, `type`.

**24. What does `/api/health` return, and why is Redis being down not a 503?**
DB down → 503 `unavailable` (nothing works; a load balancer should stop routing to this instance).
Redis down → 200 `degraded`: only rate limiting depends on Redis and it fails open, so the instance can
still serve traffic.

**25. Why use `127.0.0.1` instead of `localhost` in the local env file, and why a 0.5 s Redis timeout?**
Measured on this machine: with Redis down, `localhost` took ~2.0 s to fail because it tries `::1` and then
`127.0.0.1`, each waiting the full timeout; `127.0.0.1` took ~1.0 s. Since we fail open, every request pays
this timeout during an outage, so it's kept short (a healthy Redis answers in well under a millisecond).

**26. What is `pool_pre_ping` for?**
Before handing out a pooled connection, SQLAlchemy checks it's still alive. After a DB restart, stale
connections are replaced instead of failing the next request.

## Database schema & migrations

**28. Why store enums as VARCHAR + CHECK instead of a native PostgreSQL ENUM?**
Changing a native enum needs `ALTER TYPE ... ADD VALUE` (and removing a value is very awkward). A CHECK
constraint can be dropped and re-created in an ordinary migration. Cost: a few bytes more per row.

**29. What is a constraint naming convention and why set one?**
A template on `MetaData` (e.g. `ck_<table>_<name>`) so every constraint gets a predictable name. Without it
Postgres generates names, and a later migration can't reliably drop or alter them. It also makes errors
readable: `ck_inventory_quantity_non_negative` tells you exactly what failed.

**30. You autogenerated the migration. Why not just trust it?**
Autogenerate is a draft. Here it emitted every enum CHECK twice, and the explicit names got double-prefixed
(`ck_users_ck_users_role`) because the naming convention was applied again. `op.f()` marks a name as final.
Always read the generated migration and check the real DB (`pg_constraint`) after running it.

**31. How do you know the models and migrations haven't drifted apart?**
A test runs `alembic check`, which autogenerates a diff between the models and the migrated DB and fails if
it isn't empty. Another test downgrades to base and upgrades to head, so `downgrade()` is tested too.

**32. Why does the test DB get its schema from Alembic instead of `Base.metadata.create_all()`?**
Production is built by migrations, so tests should be too. `create_all` could hide a broken migration.

**33. How are tests isolated from each other?**
Each test runs against a real `<db>_test` database; after every test the tables are truncated with
`RESTART IDENTITY CASCADE`. We don't wrap tests in a rolled-back transaction, because the concurrency tests
need several real, committing connections, which a shared outer transaction would break.

**34. Why a composite primary key `(cart_id, product_id)` on `cart_items`?**
A product can appear only once per cart ("add again" increases the quantity), and the PK index also serves
"all items in cart X". No surrogate id is needed.

**35. Why copy `unit_price_paise` into `order_items`?**
Prices change. An order must show what the customer actually paid, so the price is snapshotted at purchase;
the order total is computed from those snapshots.

**36. How is "email is unique" made case-insensitive?**
The app lower-cases emails before saving, and `CHECK (email = lower(email))` guarantees every stored email is
lower-case, so the ordinary unique index is effectively case-insensitive. The alternatives are `citext` or a
unique index on `lower(email)`.

**37. Postgres doesn't index foreign keys automatically. Did you think about it?**
Yes, checked each FK: `order_items.order_id` and `cart_items.cart_id` lead a unique/primary key index;
`orders.user_id` has a composite index with `created_at`; the others aren't looked up by FK alone. Unindexed
FKs also slow down deletes on the parent table, but we soft-delete products and never delete orders.

**38. What does `now()` return inside a transaction?**
The transaction's start time, the same value for every statement in it. So all rows written by one checkout
share a timestamp (`clock_timestamp()` would give wall-clock time per call).

**39. What is the `inventory_movements` table for, and what invariant does it keep?**
An append-only ledger of every stock change with a reason (restock/order/cancel/adjustment), the order that
caused it, and who did it. For each product, `SUM(delta)` should equal `inventory.quantity`: an audit check
that can catch bugs.

## Testing

**27. Why test against real PostgreSQL instead of SQLite?**
SQLite has no `SELECT ... FOR UPDATE` row locks and behaves differently for concurrency and constraints.
A concurrency test on SQLite would pass without proving anything.

**40. How do the constraint tests prove the *right* rule failed?**
They assert the constraint **name** appears in the `IntegrityError`, not just that some error occurred. A
test that only expects "an error" could pass because of an unrelated NOT NULL violation.

**41. Why are Redis tests skipped instead of failing when Redis is down?**
Local development without Docker has no Redis. A permanently failing test teaches people to ignore red
builds. The skip is printed with its reason in the summary; in Docker/CI, Redis is present so the test runs.

## Phase "explain this" questions (from the reviews)

- Why lock inventory rows sorted by `product_id`? (→ Q10)
- DB CHECK vs app check (→ Q5)
- Two same-key requests at once: what does Postgres do with the second INSERT? (→ Q14)
- Trace a request through the middleware: where is the request id created, where does it appear, and what happens if the route raises? (→ Q19, Q22)
- Why is Redis-down a 200 "degraded" but DB-down a 503? (→ Q24)
- Why is `.env` read from the repo root, and why does a missing `.env` not crash the container? (Settings reads real env vars first; pydantic-settings silently skips a missing env file, so Docker passes values as environment variables.)
- Why VARCHAR + CHECK for enums? (→ Q28)
- What went wrong in the autogenerated migration, and how did you catch it? (→ Q30)
- Why must `os.environ["DATABASE_URL"]` be set at the top of `conftest.py` before importing the app? (`app.db` creates the engine at import time from settings; importing first would bind the tests to the dev database.)
