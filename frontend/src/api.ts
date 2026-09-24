/**
 * This channel's own API — same origin, no CORS. Every path is under the
 * /channel-order context-path the backend is served from.
 */

const BASE = '/channel-order/api'

export interface Store {
  id: string
  name: string
}

export interface MenuItem {
  id: string
  name: string
  price: number
  /**
   * 오늘 이 매장에 없다는 뜻입니다. 메뉴를 내린 것과 다릅니다 — 내린
   * 메뉴는 애초에 이 목록에 없습니다. 결품은 보여주되 고를 수 없게
   * 합니다: 빼버리면 손님은 원래 없는 메뉴인 줄 압니다.
   */
  soldOut: boolean
  /**
   * 기준 조리시간 x (대기열 + 1). null 은 <b>모른다</b>이며 0분이
   * 아닙니다 — 모르는 값은 안 그립니다.
   */
  estimatedMinutes: number | null
}

/**
 * 테이블 QR을 찍고 통과했을 때 돌아오는 것 — 어느 매장의 어느 자리이고,
 * 그 매장이 지금 올라타 있는 판매일자.
 */
export interface TableEntry {
  storeId: string
  storeName: string
  floor: number
  tableNo: string
  tableLabel: string
  businessDate: string
}

/**
 * 게이트가 돌려보낸 이유. `retryable` 이면 화면이 "다시 시도"를 보여주고,
 * 아니면 직원을 부르라고 합니다 — 손님이 할 수 있는 일이 다릅니다.
 */
export interface TableRefusal {
  reason: string
  message: string
  retryable: boolean
}

/**
 * 상태 코드가 곧 이유입니다 — 404 없는 코드, 409 중지/마감, 503 확인 실패.
 * 503만 기다렸다 다시 하면 되는 경우라 따로 표시합니다.
 */
export async function enterTable(qrCode: string): Promise<TableEntry | TableRefusal> {
  const res = await fetch(`${BASE}/t/${encodeURIComponent(qrCode)}`)
  const body = await res.json().catch(() => null)
  if (res.ok) return body as TableEntry
  return {
    reason: body?.reason ?? `HTTP_${res.status}`,
    message: body?.message ?? '주문 화면을 열지 못했습니다.',
    retryable: res.status >= 500
  }
}

export function isRefusal(v: TableEntry | TableRefusal): v is TableRefusal {
  return (v as TableRefusal).reason !== undefined
}

async function failure(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: string }
    if (body.error) return new Error(body.error)
  } catch {
    // not JSON
  }
  if (res.status === 502) return new Error('주문 서비스에 연결할 수 없습니다')
  return new Error(`요청이 실패했습니다 (HTTP ${res.status})`)
}

export async function fetchStores(): Promise<Store[]> {
  const res = await fetch(`${BASE}/stores`)
  if (!res.ok) throw await failure(res)
  return (await res.json()) as Store[]
}

export async function fetchMenus(storeId: string): Promise<MenuItem[]> {
  const res = await fetch(`${BASE}/stores/${encodeURIComponent(storeId)}/menus`)
  if (!res.ok) throw await failure(res)
  return (await res.json()) as MenuItem[]
}

export interface PlacedOrder {
  id: number
  storeId: string
  menuName: string
  amount: number
  status: string
  /**
   * 수령번호. `pickupNo` 는 DID에 뜨는 **부르는 번호**이고,
   * `pickupPin` 은 직원에게 불러주는 **증명하는 번호** 네 자리입니다.
   * 손님이 화면을 닫으면 다시 못 보므로, 접수 안내에 둘 다 남깁니다.
   */
  pickupNo: string | null
  pickupPin: string | null
}

/**
 * storeId + menuId only — no free text ever leaves this app.
 *
 * `requestId` 는 **화면이 만듭니다**. 손님이 버튼을 두 번 누르거나
 * 네트워크 재시도가 겹쳐도 주문이 둘이 되지 않게 하는 값이라, 서버가
 * 만들면 재시도마다 새 값이 되어 아무것도 막지 못합니다.
 *
 * 호출하는 쪽에서 넘겨야 진짜 재시도에 같은 값이 갑니다 — 여기서
 * 만들면 이 함수를 다시 부르는 것이 곧 새 주문이 됩니다.
 */
/** 장바구니 한 줄. **가격이 없습니다** — 아래 주석 참고. */
export interface CartItem {
  menuId: string
  quantity: number
}

/**
 * 장바구니를 주문으로 보냅니다.
 *
 * **가격을 안 보냅니다.** 화면이 보낸 값을 서버가 믿으면 손님이 값을
 * 바꿔서 1원에 살 수 있습니다. 그리고 메뉴를 고르는 동안 가격이
 * 바뀌었을 수도 있는데, 맞는 값은 접수되는 순간의 메뉴판 값입니다.
 * 그래서 보내는 것은 **무엇을 몇 개**뿐입니다.
 */
export async function placeOrder(
  storeId: string,
  items: CartItem[],
  requestId: string,
  qrCode?: string
): Promise<PlacedOrder> {
  const res = await fetch(`${BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 코드를 같이 보냅니다. 매장·자리를 화면이 정하지 않는다는 뜻입니다 —
    // 서버가 코드를 다시 풀어서 도착지를 붙입니다.
    body: JSON.stringify({ storeId, items, qrCode, requestId })
  })
  if (!res.ok) throw await failure(res)
  return (await res.json()) as PlacedOrder
}

/** 이 브라우저에서 한 번만 쓰는 값. crypto.randomUUID 가 없는 곳도 있습니다. */
export function newRequestId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined
  if (c?.randomUUID) return c.randomUUID()
  return 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
}

/**
 * 영수증 QR로 여는 주문 상태 (umbrella docs/adr/0007).
 *
 * <p>손님이 볼 것만 옵니다 — PIN도, 단말 이름도, 거래번호도 없습니다.
 * 인증이 없는 경로라 값을 가진 사람이 곧 볼 자격이 있는 사람이고,
 * 그래서 주소가 새 나가면 새 나가는 만큼이 화면에 있는 그대로입니다.
 */
export interface ClaimedOrder {
  storeId: string
  businessDate: string | null
  status: string
  /** 손님이 이 화면에서 제일 먼저 찾는 값 — "몇 번 부르나". */
  pickupNo: string | null
  summary: string | null
  amount: number
  lines: Array<{ menuName: string; quantity: number; lineAmount: number }>
  type: string | null
  placedAt: string
  /** 번호를 부른 시각. 비어 있으면 아직 안 불렀습니다. */
  calledAt: string | null
}

/** 없는 주문과 못 물어본 것을 <b>가르기 위해</b> 따로 던집니다. */
export class Unreachable extends Error {}

export async function fetchClaim(token: string): Promise<ClaimedOrder | null> {
  const res = await fetch(`${BASE}/orders/claim/${encodeURIComponent(token)}`)
  if (res.status === 404) return null
  if (res.status === 502 || res.status === 503) {
    throw new Unreachable('지금은 주문 상태를 확인할 수 없습니다')
  }
  if (!res.ok) throw await failure(res)
  return (await res.json()) as ClaimedOrder
}

/** 손님에게 보여줄 말. 매장 안에서 쓰는 말과 다릅니다. */
export const CLAIM_STATUS: Record<string, string> = {
  PLACED: '주문이 접수되었습니다',
  ACCEPTED: '매장이 주문을 확인했습니다',
  REJECTED: '주문이 취소되었습니다',
  EXPIRED: '주문이 시간 초과로 취소되었습니다',
  CANCELLED: '주문이 취소되었습니다',
  COOKING: '조리 중입니다',
  PRODUCED: '준비되었습니다',
  DELIVERING: '배달 중입니다',
  COMPLETED: '전달이 완료되었습니다'
}
