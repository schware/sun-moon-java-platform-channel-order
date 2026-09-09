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
export async function placeOrder(storeId: string, menuId: string): Promise<PlacedOrder> {
  const res = await fetch(`${BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, menuId })
  })
  if (!res.ok) throw await failure(res)
  return (await res.json()) as PlacedOrder
}

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
}
