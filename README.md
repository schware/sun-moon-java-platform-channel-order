# sun-moon-java-platform-channel-order

The **주문 채널** (order-placing channel) service — part of the
`sun-moon-java-platform` family alongside
[Order](https://github.com/schware/sun-moon-java-platform-order),
[BO](https://github.com/schware/sun-moon-java-platform-bo),
[KDS](https://github.com/schware/sun-moon-java-platform-kds) and
[Delivery](https://github.com/schware/sun-moon-java-platform-delivery),
tied together by the
[umbrella repo](https://github.com/schware/sun-moon-java-platform) via git
submodules.

A public, no-login ordering screen: pick a store, pick a menu, the order
goes to Order. Spring Boot 3.3.4 on embedded Jetty, a React + TypeScript
UI served from the same jar, one Docker container, port **8085**,
context-path **`/channel-order`**.

## Flow

매장 선택 → 메뉴 선택 → 주문. That's the whole app — two screens reached
by React state, never by URL, so there is no client-side router and no
server-side SPA-forwarding to configure.

The catalog is fixed in code, not a database: 10 stores (`1매장`..`10매장`)
each offering the same 10 menu items (`1메뉴`..`10메뉴`, ₩6,000–₩15,000).
Nothing here is customer data worth persisting — see [Not built
yet](#not-built-yet) for what a real catalog would need.

## API

All paths are under the `/channel-order` context-path.

| Endpoint | |
|---|---|
| `GET /api/stores` | the 10 stores |
| `GET /api/stores/{storeId}/menus` | that store's 10 menu items (404 if `storeId` is unknown) |
| `POST /api/orders` | `{storeId, menuId}` → places the order, returns Order's response as-is |

Swagger UI at `/channel-order/swagger-ui/index.html`.

`POST /api/orders` validates `storeId`/`menuId` against the fixed catalog
itself (400 if either doesn't exist), generates a throwaway
`guest-xxxxxx` customer id, and forwards to the Order service. Order's
response — success or rejection — passes through unchanged; if Order
can't be reached at all, this returns 502, since the fault is upstream.

## No login, no database

This is a walk-up ordering screen, not an admin console — same reasoning
as why Order itself has no auth (orders are samples by design; see the
Order repo). There is no `spring-boot-starter-security`, no
PostgreSQL/Flyway/`schema.sql`, and no persisted state of its own: the
catalog is a fixed in-code list, and every order is immediately handed
off to Order, which is the system of record.

## Configuration

| Variable | Default | |
|---|---|---|
| `ORDER_SERVICE_URL` | `http://localhost:8083/order` | base URL of the Order service's own API |

## The screen

`frontend/` is a Vite + React + TypeScript app whose build output lands
in `src/main/resources/static`, so it ships **inside the jar and on the
same origin as the API** — no CORS to configure.

```bash
cd frontend
npm install
npm run build     # → ../src/main/resources/static
npm run dev        # proxies /channel-order/api to a backend already running on :8085
```

You do not need Node to deploy. The Dockerfile builds the frontend in a
`node:20-alpine` stage and copies only the output forward.

## Not built yet

- **Store open/closed status.** Whether a store's POS terminal is
  actually powered on is not reflected here yet — every store always
  shows as selectable. Surfacing that needs a periodic (`@Scheduled`)
  check against the Device Server's terminal registry, deliberately
  deferred rather than built alongside this first pass.
- **A real catalog.** Stores and menus are a fixed list in code, not
  driven by BO's device/menu master data.
- **Order cancellation.** Once placed, this channel has no way to
  retract an order — matches the rest of the family for now.
