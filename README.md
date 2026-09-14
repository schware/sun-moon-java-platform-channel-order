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

매장 선택 → 메뉴 선택 → **확인** → 주문. Two screens reached by React
state, never by URL, so there is no client-side router and no
server-side SPA-forwarding to configure; the confirm step is a sheet
over the menu screen rather than a third one.

Until 2026-09-15 a tap *was* the order — the "주문 #12 접수됨" banner was
a receipt after the fact, not a question before it. So a mistap was an
order, and there was nowhere to put 결제 when it arrives.

**The steps between tapping and placing are a declared list** —
`FLOW` in `frontend/src/App.tsx`. Adding one is putting its name in that
array and giving it a case in `StepPanel`; nothing else in the file has
to know. That is the point of the change more than the question itself:
결제 goes there next, and the 설계서 has more after it.

Submitting the order and reporting the result are deliberately **not**
steps in that list. They are not something a customer does, and mixing
them in would mean every new step had to be careful not to land after
the order was already placed. A failure keeps the sheet open so the
customer can retry without picking the menu again; success closes it and
leaves the receipt on the menu screen, where they can see it while
ordering the next thing.

The sheet holds one menu item because that is all this channel can order
today. 장바구니 replaces that one field with a list and the step machine
does not change.

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
- **결제.** The step it goes in exists and is empty — see [Flow](#flow).
- **장바구니.** One item per order. The 설계서's `Order_Detail` means
  multi-item orders, so this is the other half of the same change.
- **주문 상태 조회.** A customer sees the receipt and nothing after it.
- **A real catalog.** Stores and menus are a fixed list in code, not
  driven by BO's device/menu master data.
- **Order cancellation.** Once placed, this channel has no way to
  retract an order — matches the rest of the family for now.
