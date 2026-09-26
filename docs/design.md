# ShopFlow — Design

> Status: **Phase 1 plan.** Sections marked *(later)* are filled in by the phase that builds them.

## 1. Problem

A small store sells limited stock. When many people check out at the same moment (a flash sale),
the system must never sell more units than exist, must not create duplicate orders when a client
retries, and must stay responsive when one user hammers the checkout button.

## 2. Architecture

```mermaid
flowchart LR
    UI[React + Vite SPA] -->|JSON over HTTP, JWT| API

    subgraph API[FastAPI backend]
        MW[Middleware: request id, JSON logs, latency] --> R[Routers: /api/*]
        R --> DEP[Dependencies: auth, rate limit]
        R --> S[Service layer: business rules + transactions]
        S --> M[SQLAlchemy models]
    end

    M --> PG[(PostgreSQL 16)]
    DEP --> RD[(Redis: rate-limit counters)]
```

**Layers and who owns what**

| Layer | Owns | Must not |
|---|---|---|
| `api/` routers | HTTP: parse request, call a service, shape response | contain business rules or SQL |
| `schemas/` (Pydantic) | request/response validation, OpenAPI docs | touch the DB |
| `services/` | business rules, transaction boundaries, locking | know about HTTP status codes directly (they raise domain errors) |
| `models/` (SQLAlchemy) | tables, constraints | contain logic |
| `core/` | config, security (JWT, hashing), errors, logging, Redis | — |

Domain errors (`NotFound`, `Conflict`, `InsufficientStock`, …) are raised in services and turned into
the single error envelope `{"error": {"code", "message", "details"}}` by one exception handler.

### Key decisions

| Decision | Choice | Why |
|---|---|---|
| Sync vs async DB | **Sync** SQLAlchemy 2.x + psycopg 3, sync route functions (FastAPI runs them in a threadpool) | Easier to read and explain; row locks behave identically. Throughput limit = threadpool + pool size, which we will measure, not guess. |
| Money | `BIGINT` **paise** with `CHECK (price_paise > 0)` | No float rounding. API exposes `price_paise` (int); the UI formats ₹. |
| Stock location | Separate `inventory` table, 1:1 with `products` | Checkout locks only inventory rows; editing a product's name/description never contends with checkout locks. |
| Negative stock | App check **and** `CHECK (quantity >= 0)` | App check gives a nice 409; the constraint is the last line of defence if code is ever wrong. |
| Cart | `carts.user_id UNIQUE` → one cart per user, emptied on checkout | "One active cart" without a status column or partial index. |
| Password hashing | argon2id via `argon2-cffi` | OWASP's first recommendation; library handles salts and params. |
| JWT | PyJWT, HS256, short-lived access token, claim `sub=user_id` only | Role is read from the DB on each request, so a role change takes effect immediately. |
| Admin creation | Only via seed script; `/register` always creates `customer` | No privilege escalation through a public endpoint. |
| Logging | stdlib `logging` + a ~20-line JSON formatter | No extra dependency; easy to explain. |

## 3. Data model

```mermaid
erDiagram
    users ||--o| carts : has
    users ||--o{ orders : places
    users ||--o{ idempotency_keys : sends
    carts ||--o{ cart_items : contains
    products ||--|| inventory : "stock for"
    products ||--o{ cart_items : "in"
    products ||--o{ order_items : "sold as"
    products ||--o{ inventory_movements : "history"
    orders ||--|{ order_items : contains
    orders ||--o{ inventory_movements : "caused"

    users {
        bigint id PK
        varchar email UK "stored lower-case"
        varchar password_hash
        enum role "customer | admin"
        timestamptz created_at
    }
    products {
        bigint id PK
        varchar sku UK "e.g. TSHIRT-BLK-M"
        varchar name
        text description
        bigint price_paise "CHECK > 0"
        bool is_active
        timestamptz created_at
        timestamptz updated_at
    }
    inventory {
        bigint product_id PK,FK
        int quantity "CHECK >= 0"
        int low_stock_threshold "CHECK >= 0"
        timestamptz updated_at
    }
    inventory_movements {
        bigint id PK
        bigint product_id FK
        int delta "+restock / -order"
        enum reason "restock | order | cancel | adjustment"
        bigint order_id FK "nullable"
        bigint actor_user_id FK "nullable"
        timestamptz created_at
    }
    carts {
        bigint id PK
        bigint user_id FK,UK
        timestamptz updated_at
    }
    cart_items {
        bigint cart_id PK,FK
        bigint product_id PK,FK
        int quantity "CHECK 1..max"
    }
    orders {
        bigint id PK
        bigint user_id FK
        enum status "pending | confirmed | shipped | cancelled"
        bigint total_paise
        text shipping_address
        timestamptz created_at
        timestamptz updated_at
    }
    order_items {
        bigint id PK
        bigint order_id FK
        bigint product_id FK
        int quantity "CHECK > 0"
        bigint unit_price_paise "price at purchase"
    }
    idempotency_keys {
        bigint id PK
        bigint user_id FK
        varchar key "UNIQUE (user_id, key)"
        char request_hash "sha256 of body"
        int response_status
        jsonb response_body
        timestamptz created_at
    }
```

Indexes beyond PKs/uniques: `orders(user_id, created_at)` ("my orders, newest first") and
`inventory_movements(product_id, created_at)` (stock history). PostgreSQL does **not** index foreign keys
automatically, so each FK was checked: `order_items.order_id` and `cart_items.cart_id` are covered by the
first column of a unique/primary key; the rest aren't queried by FK alone. Name search uses `ILIKE '%term%'`,
which a B-tree index can't help with anyway; a `pg_trgm` index is a *future improvement*.

### Schema decisions (built in phase 3)

- **Enums as `VARCHAR(20)` + a named `CHECK`**, not native PostgreSQL `ENUM` types. Adding a value to a
  native enum needs `ALTER TYPE`; a CHECK constraint is simply dropped and re-created in a migration.
- **Constraint naming convention** on `Base.metadata` (`ck_<table>_<name>`, `uq_<table>_<cols>`, …). Names
  are deterministic, so migrations can drop them, and an `IntegrityError` names the exact rule that failed
  (the constraint tests assert on those names).
- **`created_at`/`updated_at` default to `now()` in the DB**, so rows inserted by raw SQL get them too. Note that
  `now()` is the *transaction* start time: every row written in one checkout shares one timestamp.
- **Identity columns** (`GENERATED BY DEFAULT AS IDENTITY`), the SQL-standard replacement for `SERIAL`.
- **Emails are stored lower-case**, guarded by `CHECK (email = lower(email))`, so the unique index is
  effectively case-insensitive without needing `citext`.
- The migration was drafted with `--autogenerate` and then **rewritten by hand**. Review found the draft
  emitted each enum CHECK twice. A test (`alembic check`) fails if models and migrations ever drift apart.

## 4. Checkout — the core flow (sketch; full write-up in phase 8/9)

One transaction, in this order:

1. **Idempotency:** `INSERT INTO idempotency_keys ... ON CONFLICT (user_id, key) DO NOTHING RETURNING id`.
   If a concurrent request with the same key hasn't committed yet, PostgreSQL makes this INSERT
   **wait** for it (unique-index check), so the second request never races the first. If nothing is
   returned, the key exists: same body hash → replay stored response; different hash → 409.
2. Load the cart items.
3. `SELECT ... FROM inventory WHERE product_id IN (...) ORDER BY product_id FOR UPDATE` —
   **sorted** so two carts `{A,B}` and `{B,A}` always lock A first → no deadlock cycle.
4. Check every line; collect *all* failures → 409 `INSUFFICIENT_STOCK` with the failing product ids.
5. Decrement stock, write `inventory_movements(reason=order)`.
6. Create `orders` + `order_items` (copy current price), clear cart.
7. Store the 201 response in the idempotency row, commit.

Failures roll back everything, **including the idempotency row**, so a client may retry the same key
after, e.g., a restock. Only successful responses are replayed. *(Trade-off documented in phase 9.)*

**Cancel:** lock the order row `FOR UPDATE` (so a double-cancel can't restore stock twice) → check
transition → lock inventory rows sorted by product id → add stock back + `cancel` movements.

**Status transitions** (anything else → 409):
`pending → confirmed → shipped`, and `pending|confirmed → cancelled`. `shipped`/`cancelled` are terminal.

## 5. Rate limiting (sketch)

Fixed window per user: `INCR rl:checkout:{user_id}:{window_start}` + `EXPIRE` in one pipeline.
Over the limit → 429 with `Retry-After` = seconds to window end. `RedisError` → allow the request and
log a warning (**fail open**: a Redis outage shouldn't stop all sales; the DB still prevents overselling).

## 5b. Observability (built in phase 2)

- Every log line is one JSON object with `timestamp, level, logger, message, request_id` plus any
  `extra=` fields. The request middleware logs `method, path, status, latency_ms` per request.
- `X-Request-ID`: reused if the caller sends a safe value (`[A-Za-z0-9._-]{1,64}`), otherwise a uuid4;
  echoed in the response header.
- Unhandled exceptions: traceback logged server-side, client gets a generic 500 in the error envelope.
- `GET /api/health`: DB down → **503** `unavailable`; Redis down → **200** `degraded` (rate limiting fails
  open, so the API still works); both up → 200 `ok`.
- Timeouts are short so a dead dependency fails fast: DB connect 3 s, Redis 0.5 s. With Redis down,
  `/api/health` took ~0.5 s (local measurement on the dev machine, Windows, 3 requests).

## 5c. Authentication (built in phase 4)

| Endpoint | Behaviour |
|---|---|
| `POST /api/auth/register` | `{email, password}` → 201 user. Always role `customer`; unknown fields (e.g. `role`) → 422. Duplicate email (any case) → 409 `EMAIL_ALREADY_REGISTERED`. |
| `POST /api/auth/login` | `{email, password}` → `{access_token, token_type: "bearer", expires_in}`. Wrong password and unknown email return the *same* 401 `INVALID_CREDENTIALS`. |
| `GET /api/auth/me` | The current user (small addition to the spec: the frontend needs the role after login). |

- **Passwords:** argon2id (`argon2-cffi` defaults), length 8–128, no composition rules (NIST SP 800-63B).
  Hashes made with older parameters are upgraded on the next successful login.
- **User enumeration:** an unknown email is still checked against a dummy hash, so both failure cases take
  ~0.10 s (local measurement, 5 requests each after warm-up; a fresh server's first request is ~0.25 s
  whatever the email, because it opens the first DB connection).
- **Duplicate emails:** no "does it exist?" pre-check; the insert hits `uq_users_email` and we translate the
  `IntegrityError` (by constraint name) into 409. This is race-free, unlike check-then-insert.
- **JWT:** HS256, claims `sub` (user id), `iat`, `exp`; the algorithm is pinned on decode (so `alg: none`
  and other-algorithm tokens are rejected); `sub/exp/iat` are required. The user is loaded from the DB on every
  request, so deleted users are locked out and role changes apply immediately.
- **Guards:** `CurrentUser` dependency → 401 (with `WWW-Authenticate: Bearer`); `AdminUser` → 403 for customers.
- **Secret handling:** `JWT_SECRET` is a `SecretStr`, at least 32 chars, and the `.env.example` placeholder
  is rejected at startup. Settings use `hide_input_in_errors=True`: a test showed Pydantic's validation error
  otherwise prints the rejected secret into the logs.
- **Known limitations:** no refresh tokens, no logout/revocation list (tokens are short-lived instead), no
  login rate limiting or lockout yet (only checkout is rate limited in this project), and the token is stored
  client-side (see the frontend phase for the XSS trade-off).

## 5d. Products (built in phase 5)

| Endpoint | Who | Notes |
|---|---|---|
| `GET /api/products?q=&limit=&offset=` | anyone | Active only. `q` searches name **or** SKU (case-insensitive). `include_inactive=true` is admin-only (403 otherwise). Returns `{items, total, limit, offset}`, newest first. |
| `GET /api/products/{id}` | anyone | Inactive → 404 for customers/anonymous, visible to admins. |
| `POST /api/products` | admin | Creates product + inventory row (+ a `restock` movement if `initial_stock > 0`) in one transaction. Duplicate SKU → 409 `SKU_ALREADY_EXISTS`. |
| `PATCH /api/products/{id}` | admin | Partial update of `name`, `description`, `price_paise`, `is_active`. SKU is immutable; stock changes only via the inventory endpoint (phase 6), so they always leave a movement row. Explicit `null` → 422. |
| `DELETE /api/products/{id}` | admin | Soft delete (`is_active=false`), 204, idempotent. Reactivate with `PATCH {"is_active": true}`. |

- **Validation:** SKU is trimmed + upper-cased, then must match `^[A-Z0-9]+(-[A-Z0-9]+)*$` (3–64 chars);
  price is an integer number of paise, `0 < price ≤ ₹10,00,000` (`499.5` → 422, never rounded); name 1–200 chars
  after trimming; unknown fields → 422.
- **Search safety:** `%`, `_` and `\` in `q` are escaped, so `q=%` finds products whose name contains "%"
  instead of matching everything.
- **No N+1:** listing loads stock with `joinedload` (one JOIN). A test counts SQL statements: exactly 2 per list
  request (COUNT + SELECT). With the `joinedload` removed, the same test saw 17 statements for 15 products.
- **Pagination:** offset/limit (max 100) ordered by `id DESC` (unique, so pages are stable). Keyset pagination
  would scale better for deep pages; offset is fine at this catalogue size.
- **Optional auth on public endpoints:** no token → anonymous; an invalid/expired token → 401 (not silently
  treated as anonymous, which would hide an expired session from the client).
- **Exposes `stock_quantity`** to everyone, so the UI can show "only 3 left" and cap the quantity picker.
  A real shop might show only "in stock / low stock"; noted as a product decision.

## 5e. Inventory & movements (built in phase 6)

| Endpoint (all admin) | Behaviour |
|---|---|
| `GET /api/inventory?low_stock=` | Stock per product (incl. inactive), `is_low_stock = quantity <= low_stock_threshold`. |
| `PATCH /api/inventory/{product_id}` | `{delta, reason: restock\|adjustment, note}` and/or `{low_stock_threshold}`. Going below 0 → 409 `INSUFFICIENT_STOCK` with `{product_id, requested, available}`. |
| `GET /api/inventory/{product_id}/movements` | Ledger, newest first (small addition to the spec). |

- **Relative, not absolute:** admins send `delta: -2`, never `quantity: 8`. An absolute "set to 8" would overwrite
  units sold between the admin loading the page and saving, a lost update the lock can't prevent.
- **`order`/`cancel` reasons are system-only:** the API accepts only `restock` (must be positive) and
  `adjustment`; the order flow writes the others.
- **One path for every stock change:** `lock_inventory()` + `apply_stock_change()` (the checkout and cancel
  flows reuse them). `apply_stock_change` refuses to go below zero and always adds the movement row, so
  `SUM(delta) == quantity` holds for every product.
- **Locking:** `SELECT ... FOR UPDATE ORDER BY product_id`, with `populate_existing=True`. PostgreSQL applies
  `ORDER BY` first and locks rows in that order; the docs' caveat (rows may come back out of order if the sort
  column changes while waiting) doesn't apply because `product_id` never changes.

### What the concurrency test showed (local measurements)

16 threads, each with its own connection, remove 1 unit from a stock of 10 at the same moment (5 runs per variant):

| Variant | Result |
|---|---|
| `FOR UPDATE` + `populate_existing` (shipped code) | 5/5 pass: exactly 10 removals, 6 × 409, final stock 0, ledger sum 0 |
| no `FOR UPDATE` | 5/5 fail: **all 16** removals "succeeded" (lost updates; the DB CHECK can't catch this because no single write goes negative) |
| `FOR UPDATE` but no `populate_existing` | 5/5 fail: **all 16** "succeeded". The row *was* locked, but `get_product()` had already loaded it via `joinedload`, and SQLAlchemy's identity map kept the stale in-memory quantity instead of the value read after the lock. |

## 6. Testing strategy (sketch)

- pytest against a real PostgreSQL test database (`<db>_test`, created automatically on the same server),
  schema created by running the Alembic migrations (so migrations are tested too); tables truncated
  (`TRUNCATE ... RESTART IDENTITY CASCADE`) after every test.
- Migration tests: full downgrade → upgrade round trip, plus `alembic check` for model/migration drift.
- Constraint tests break each rule and assert PostgreSQL rejects it **by constraint name**.
- Tests that need Redis are skipped with a visible reason when Redis isn't reachable (local dev without
  Docker); wherever Redis runs, they run.
- Real Redis on a separate logical DB index, flushed between tests.
- Concurrency tests start a real uvicorn server in a background thread and fire requests from a
  thread pool — so the locking is exercised through the full HTTP stack, not a mocked session.

## 7. Load test *(later — phase 14)*

## 8. Proposed deviations from the spec (need approval)

1. **Add `PATCH /api/orders/{id}/status` (admin only)** to move `pending → confirmed → shipped`.
   The spec's endpoint list only has `cancel`, so without this the non-cancel transitions can't happen.
2. **Checkout body = `{"shipping_address": "..."}`.** The order comes from the cart, so without a body
   "same key, different body → 409" would be untestable. A shipping address is a natural field.
3. **Only successful checkouts are stored for replay** (see §4).
