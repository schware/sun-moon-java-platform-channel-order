/**
 * 손님 창구의 주소 (customer-app.md §2).
 *
 *  - web:  '/channel-order/api' — 같은 출처, CORS 없음 (지금까지 그대로)
 *  - app:  VITE_API_BASE (절대 주소) — 앱 화면은 https://localhost 등에서 돌아 다른 출처입니다.
 *          channel-order 의 CORS 가 그 출처만 엽니다(A0).
 *  - kiosk: 이 주소를 쓰지 않습니다 — 매장 단말이라 Device Server 로 갑니다(kiosk/api.ts).
 */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/channel-order/api'
