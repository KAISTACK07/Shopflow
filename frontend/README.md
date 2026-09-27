# ShopFlow frontend

React 19 + TypeScript + Vite, styled with Tailwind CSS v4. Talks to the FastAPI backend under `/api`.

## Run it

```bash
npm install
npm run dev        # http://127.0.0.1:5173, proxies /api to http://127.0.0.1:8000
```

The backend must be running (see the root README). Point the proxy elsewhere with
`VITE_API_PROXY_TARGET=http://host:port npm run dev`.

## Checks

```bash
npm test           # vitest: money parsing, API error mapping, checkout idempotency key
npm run lint       # oxlint
npm run build      # type-check (tsc -b) + production build into dist/
```

## Where things are

| Path | What |
|---|---|
| `src/api/` | `client.ts` (fetch wrapper, `ApiError`, token), `endpoints.ts` (one function per endpoint), `types.ts` |
| `src/state/` | Auth and cart contexts (`contexts.ts`) and their providers |
| `src/lib/` | `money.ts` (paise ↔ rupees), `checkoutKey.ts` (Idempotency-Key per checkout), `useApi.ts` |
| `src/pages/` | Products, product detail, cart & checkout, orders, admin products, login/register |
| `src/components/` | Layout, route guard, shared UI (`StockNumber`, `Pager`, `ErrorNotice`) |
