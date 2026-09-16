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
}

/** storeId + menuId only — no free text ever leaves this app. */
export async function placeOrder(storeId: string, menuId: string, qrCode?: string): Promise<PlacedOrder> {
  const res = await fetch(`${BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 코드를 같이 보냅니다. 매장·자리를 화면이 정하지 않는다는 뜻입니다 —
    // 서버가 코드를 다시 풀어서 도착지를 붙입니다.
    body: JSON.stringify({ storeId, menuId, qrCode })
  })
  if (!res.ok) throw await failure(res)
  return (await res.json()) as PlacedOrder
}

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
}
