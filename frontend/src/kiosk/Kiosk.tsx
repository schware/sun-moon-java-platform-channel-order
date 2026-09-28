import { useCallback, useEffect, useRef, useState } from 'react'
import { formatAmount } from '../api'
import { shell } from '../platform'
import {
  buildTrSale,
  claimUrl,
  currentBusinessDate,
  fetchKioskMenus,
  placeKioskOrder,
  uploadSales,
  type KioskLine,
  type KioskMenu,
  type KioskOrder
} from './api'

/**
 * KIOSK — 캐셔 없는 POS (umbrella docs/design/store-app.md §9, customer-app.md §5).
 *
 * <pre>
 *   담기 → 결제(셸) → 자기 번호로 채번(원장) → Device Server /orders/kiosk
 *     → 수락된 채로 주방으로 → 원장 확정·매출 올리기 → 영수증 출력 → 번호 크게 → 처음으로
 * </pre>
 *
 * 웹과 다른 것: 매장은 셸의 신원이 정하고(고르지 않음), 회원번호는 입력만(여럿이 쓰는
 * 기계라 남기지 않음), 영수증은 출력, 60초 손을 안 대면 처음으로.
 */

const IDLE_MS = 60_000
const DONE_MS = 15_000
const RETRY_UPLOAD_MS = 60_000

type Phase =
  | { name: 'ordering' }
  | { name: 'paying' }
  | { name: 'done'; order: KioskOrder; printed: string | null }
  | { name: 'failed'; message: string }

export default function Kiosk() {
  const identity = shell()?.identity.get()
  const [menus, setMenus] = useState<KioskMenu[]>([])
  const [businessDate, setBusinessDate] = useState<string | null | undefined>(undefined)
  const [cart, setCart] = useState<KioskLine[]>([])
  const [phase, setPhase] = useState<Phase>({ name: 'ordering' })
  const [memberNo, setMemberNo] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const idleTimer = useRef<number | undefined>(undefined)

  const load = useCallback(async () => {
    try {
      const [date, list] = await Promise.all([currentBusinessDate(), fetchKioskMenus()])
      setBusinessDate(date)
      setMenus(list)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '메뉴를 불러오지 못했습니다')
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 30_000)
    return () => window.clearInterval(timer)
  }, [load])

  // 못 올린 매출을 다시 — POS 와 같은 규칙: 원장이 원본이고 서버는 모으는 곳입니다.
  useEffect(() => {
    const ledger = shell()?.ledger
    if (!ledger) return
    const retry = async () => {
      const pending = await ledger.pending()
      if (pending.length === 0) return
      try {
        await uploadSales(pending.map((r) => r.payload))
        await ledger.markSent(pending.map((r) => r.id))
      } catch (e) {
        await ledger.markFailed(pending.map((r) => r.id), e instanceof Error ? e.message : String(e))
      }
    }
    void retry()
    const timer = window.setInterval(() => void retry(), RETRY_UPLOAD_MS)
    return () => window.clearInterval(timer)
  }, [])

  const reset = useCallback(() => {
    setCart([])
    setMemberNo('')
    setPhase({ name: 'ordering' })
  }, [])

  // 손을 안 대면 처음으로 — 다음 손님이 앞 손님의 장바구니를 보지 않게.
  const touched = useCallback(() => {
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(reset, IDLE_MS)
  }, [reset])

  useEffect(() => {
    touched()
    window.addEventListener('pointerdown', touched)
    return () => {
      window.removeEventListener('pointerdown', touched)
      window.clearTimeout(idleTimer.current)
    }
  }, [touched])

  useEffect(() => {
    if (phase.name !== 'done') return
    const timer = window.setTimeout(reset, DONE_MS)
    return () => window.clearTimeout(timer)
  }, [phase, reset])

  function add(menu: KioskMenu) {
    setCart((current) => {
      const found = current.find((l) => l.menu.menuCode === menu.menuCode)
      return found
        ? current.map((l) => l.menu.menuCode === menu.menuCode ? { ...l, quantity: l.quantity + 1 } : l)
        : [...current, { menu, quantity: 1 }]
    })
  }

  function setQuantity(code: string, quantity: number) {
    setCart((current) => quantity <= 0
      ? current.filter((l) => l.menu.menuCode !== code)
      : current.map((l) => l.menu.menuCode === code ? { ...l, quantity } : l))
  }

  const total = cart.reduce((sum, l) => sum + l.menu.price * l.quantity, 0)

  async function pay() {
    const bridge = shell()
    if (!bridge?.ledger || !bridge.payment || !identity || !businessDate) return
    setPhase({ name: 'paying' })
    // 1. 결제. 승인 전에는 아무것도 적지 않습니다 — 번호도 태우지 않습니다.
    const approval = await bridge.payment.approve(total).catch((e: unknown) => ({
      approved: false, method: '', approvalNo: null, amount: total,
      message: e instanceof Error ? e.message : String(e)
    }))
    if (!approval.approved) {
      setPhase({ name: 'failed', message: approval.message ?? '결제가 승인되지 않았습니다' })
      return
    }
    // 2. 자기 번호로 채번 — 번호와 거래가 한 트랜잭션에서.
    const tran = await bridge.ledger.mint(identity.storeId, identity.deviceId, businessDate, 0)
    try {
      // 3. 수락된 채로 주방으로.
      const order = await placeKioskOrder(cart, tran.tranNo,
        { method: approval.method, approvalNo: approval.approvalNo, amount: approval.amount },
        memberNo.replace(/\D/g, '') || undefined)
      // 4. 원장 확정 → 매출 올리기. 못 올려도 주문은 된 것입니다 — 원장이 다시 올립니다.
      const payload = buildTrSale(order, identity.storeId, identity.deviceId, businessDate, tran.tranNo)
      await bridge.ledger.confirm(tran.id, payload)
      uploadSales([payload]).then(() => bridge.ledger!.markSent([tran.id]))
        .catch((e) => bridge.ledger!.markFailed([tran.id], e instanceof Error ? e.message : String(e)))
      // 5. 영수증 — 못 찍어도 번호는 화면에 크게 있습니다.
      const printed = bridge.printer?.receipt
        ? await bridge.printer.receipt({
            storeName: order.storeId, pickupNo: order.pickupNo, tranNo: order.tranNo,
            businessDate: order.businessDate, lines: order.lines.map((l) => ({
              menuName: l.menuName, quantity: l.quantity, lineAmount: l.lineAmount })),
            total: order.amount, payment: order.payment ?? null,
            claimUrl: order.claimToken ? claimUrl(order.claimToken) : null
          }).then((r) => r.ok ? null : r.error ?? '영수증을 출력하지 못했습니다')
            .catch(() => '영수증을 출력하지 못했습니다')
        : '이 KIOSK 에는 영수증 프린터가 없습니다'
      setPhase({ name: 'done', order, printed })
    } catch (e) {
      // 주문이 안 들어갔습니다. 번호는 돌려주지 않고 버린 것으로 남깁니다(구멍이 중복보다 낫다).
      // ▶ 가상 결제라 취소할 것이 없습니다. 진짜 VAN 이 붙으면 여기서 승인 취소를 부릅니다.
      await bridge.ledger.discard(tran.id, e instanceof Error ? e.message : String(e))
      setPhase({ name: 'failed', message: e instanceof Error ? e.message : '주문을 넣지 못했습니다' })
    }
  }

  if (!identity) {
    return <div className="shell" data-kind="kiosk"><div className="error">페어링되지 않은 KIOSK 입니다.</div></div>
  }

  if (phase.name === 'done') {
    return (
      <div className="shell" data-kind="kiosk">
        <div className="kiosk-done" role="status">
          <p className="kiosk-done-label">주문번호</p>
          <p className="kiosk-done-number">{phase.order.pickupNo ?? phase.order.id}</p>
          <p>화면에 번호가 뜨면 가져가세요.</p>
          {phase.order.pickupPin && <p className="muted">수령 확인 번호 <strong>{phase.order.pickupPin}</strong></p>}
          {phase.printed && <p className="muted">{phase.printed} — 번호를 기억해 주세요.</p>}
          <button className="btn primary" onClick={reset}>처음으로</button>
        </div>
      </div>
    )
  }

  return (
    <div className="shell" data-kind="kiosk">
      <header className="bar">
        <h1>{identity.storeId}</h1>
        <span className="muted">{identity.deviceId}</span>
      </header>

      {loadError && <div className="error" role="alert">{loadError}</div>}
      {businessDate === null && (
        <div className="error" role="alert">지금은 주문을 받지 않습니다 (영업 전 또는 마감).</div>
      )}

      <div className="grid">
        {menus.map((menu) => {
          const inCart = cart.find((l) => l.menu.menuCode === menu.menuCode)
          return (
            <button
              key={menu.menuCode}
              className={`tile menu${menu.soldOut ? ' sold-out' : ''}${inCart ? ' in-cart' : ''}`}
              disabled={menu.soldOut || !businessDate || phase.name === 'paying'}
              onClick={() => add(menu)}
            >
              <span className="menu-name">{menu.name}</span>
              <span className="menu-price">{formatAmount(menu.price)}</span>
              {menu.soldOut
                ? <span className="menu-flag">오늘 준비되지 않았습니다</span>
                : menu.estimatedMinutes !== null && <span className="menu-eta">약 {menu.estimatedMinutes}분</span>}
              {inCart && <span className="menu-count">{inCart.quantity}</span>}
            </button>
          )
        })}
      </div>

      {cart.length > 0 && (
        <div className="cart">
          <ul className="cart-lines">
            {cart.map((l) => (
              <li key={l.menu.menuCode}>
                <span className="cart-name">{l.menu.name}</span>
                <span className="cart-stepper">
                  <button className="btn step" onClick={() => setQuantity(l.menu.menuCode, l.quantity - 1)}>−</button>
                  <span className="cart-qty">{l.quantity}</span>
                  <button className="btn step" onClick={() => setQuantity(l.menu.menuCode, l.quantity + 1)}>+</button>
                </span>
                <span className="cart-amount">{formatAmount(l.menu.price * l.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="member-row">
            {/* 회원번호는 입력만 — 여럿이 쓰는 기계에 남의 번호를 남기지 않습니다. */}
            <input
              className="member-input"
              inputMode="numeric"
              placeholder="회원번호 (선택)"
              value={memberNo}
              onChange={(e) => setMemberNo(e.target.value)}
            />
          </div>
          {phase.name === 'failed' && <div className="error" role="alert">{phase.message}</div>}
          <div className="cart-foot">
            <span className="cart-total"><strong>{formatAmount(total)}</strong></span>
            <button className="btn primary" disabled={phase.name === 'paying' || !businessDate}
                    onClick={() => void pay()}>
              {phase.name === 'paying' ? '결제 중…' : '결제하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
