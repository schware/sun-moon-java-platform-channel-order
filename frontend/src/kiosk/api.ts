/**
 * KIOSK 가 부르는 곳 — channel-order 가 아니라 <b>Device Server</b> (store-app.md §9).
 *
 * KIOSK 는 매장 단말입니다. 메뉴판·영업일자·주문·매출을 POS 와 같은 곳에서 다룹니다.
 * 매장·장비는 화면이 고르지 않고 셸에 설정된 값을 씁니다.
 */
import { shell, type ShellIdentity } from '../platform'

function me(): ShellIdentity {
  const id = shell()?.identity.get()
  if (!id) throw new Error('매장·장비가 설정되지 않은 KIOSK 입니다')
  return id
}

async function ds(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${me().serverUrl}${path}`, init)
}

async function failure(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: string }
    if (body.error) return new Error(body.error)
  } catch {
    // not JSON
  }
  return new Error(`요청이 실패했습니다 (HTTP ${res.status})`)
}

export interface KioskMenu {
  menuCode: string
  name: string
  price: number
  soldOut: boolean
  estimatedMinutes: number | null
  kdsDeviceId: string | null
}

export async function fetchKioskMenus(): Promise<KioskMenu[]> {
  const res = await ds(`/menus?storeId=${encodeURIComponent(me().storeId)}`)
  if (!res.ok) throw await failure(res)
  const board = (await res.json()) as { menus: Array<Record<string, unknown>> }
  return board.menus
    // 값이 없는 메뉴는 팔 수 없습니다 — 0원으로 파는 것보다 안 보이는 편이 낫습니다.
    .filter((m) => typeof m.price === 'number' && m.orderable !== false)
    .map((m) => ({
      menuCode: String(m.menuCode),
      name: String(m.name),
      price: Number(m.price),
      soldOut: m.soldOut === true,
      estimatedMinutes: typeof m.estimatedMinutes === 'number' ? m.estimatedMinutes : null,
      kdsDeviceId: typeof m.kdsDeviceId === 'string' ? m.kdsDeviceId : null
    }))
}

/** 지금 이 매장의 판매일자. 닫혀 있으면 null — KIOSK 는 주문을 받지 않습니다. */
export async function currentBusinessDate(): Promise<string | null> {
  const res = await ds(`/business-days/status?storeId=${encodeURIComponent(me().storeId)}`)
  if (!res.ok) throw await failure(res)
  const status = (await res.json()) as { open: boolean; businessDate?: string }
  return status.open && status.businessDate ? status.businessDate : null
}

export interface KioskOrder {
  id: number
  storeId: string
  pickupNo: string | null
  pickupPin: string | null
  tranNo: string | null
  businessDate: string | null
  claimToken: string | null
  amount: number
  menuName: string
  lines: Array<{ seq: number; menuCode: string | null; menuName: string; quantity: number; unitPrice: number; lineAmount: number }>
  payment?: { method: string; approvalNo: string | null; amount: number } | null
}

export interface KioskLine {
  menu: KioskMenu
  quantity: number
}

export async function placeKioskOrder(lines: KioskLine[], tranNo: string,
                                      payment: { method: string; approvalNo: string | null; amount: number },
                                      memberNo?: string): Promise<KioskOrder> {
  const res = await ds('/orders/kiosk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: me().storeId,
      deviceId: me().deviceId,
      tranNo,
      payment,
      memberNo,
      lines: lines.map((l) => ({
        menuCode: l.menu.menuCode, menuName: l.menu.name, quantity: l.quantity,
        unitPrice: l.menu.price, kdsDeviceId: l.menu.kdsDeviceId
      }))
    })
  })
  if (!res.ok) throw await failure(res)
  return (await res.json()) as KioskOrder
}

/**
 * 거래 전문 (업무 정의서 §3.1~3.2) — POS 의 trSale.ts 와 같은 모양입니다. KIOSK 는 캐셔 없는
 * POS 라 같은 전문을 올립니다. 결제는 KIOSK 가 받았으므로 그대로 적습니다.
 */
export function buildTrSale(order: KioskOrder, storeId: string, posNo: string, businessDate: string,
                            tranNo: string, soldAt: string = new Date().toISOString()) {
  return {
    header: {
      storeId, posNo, businessDate, tranNo, tranType: 'SALE',
      totalAmount: order.amount, discountAmount: 0, taxAmount: 0, soldAt
    },
    details: order.lines.map((l, i) => ({
      detailSeq: l.seq || i + 1, menuCode: l.menuCode, menuName: l.menuName,
      quantity: l.quantity, unitPrice: l.unitPrice, detailAmount: l.lineAmount
    })),
    payments: order.payment
      ? [{ paymentSeq: 1, paymentType: order.payment.method, paymentAmount: order.payment.amount,
           approvalNo: order.payment.approvalNo }]
      : [],
    etc: { orderId: order.id, orderType: 'KIOSK', pickupNo: order.pickupNo, acceptedBy: posNo }
  }
}

export async function uploadSales(payloads: unknown[]): Promise<void> {
  const res = await ds('/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloads)
  })
  if (!res.ok) throw await failure(res)
}

/** 영수증 QR 주소 — 손님 휴대폰이 LTE 로 열 수 있어야 합니다(공인 주소). */
export function claimUrl(token: string): string {
  const base = import.meta.env.VITE_CLAIM_BASE ?? 'http://61.73.134.2:8085/channel-order/o'
  return `${base}/${encodeURIComponent(token)}`
}
