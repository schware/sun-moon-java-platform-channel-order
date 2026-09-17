import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  enterTable,
  fetchMenus,
  fetchStores,
  formatAmount,
  isRefusal,
  newRequestId,
  placeOrder,
  type MenuItem,
  type PlacedOrder,
  type Store,
  type TableEntry,
  type TableRefusal
} from './api'

/**
 * 두 가지 방법으로 들어옵니다.
 *
 *  - 그냥 열면   매장 선택 → 메뉴 (원래대로)
 *  - 테이블 QR   /channel-order/t/{code} → 게이트 통과 → 바로 메뉴
 *
 * router는 들이지 않았습니다. 시작할 때 주소에서 코드를 한 번 읽고, 그
 * 뒤로는 예전처럼 state로만 움직입니다 — 진입 지점이 하나 생긴 것이지
 * 경로가 생긴 것은 아닙니다.
 */
type Screen = { name: 'stores' } | { name: 'menus'; store: Store }

/** 주소가 /channel-order/t/{code} 면 그 코드. 아니면 null. */
function qrCodeFromUrl(): string | null {
  const match = window.location.pathname.match(/\/t\/([^/?#]+)\/?$/)
  return match ? decodeURIComponent(match[1]!) : null
}

/**
 * 자리를 사람이 부르는 이름으로. 표시명이 없으면 테이블 번호가 이름인데,
 * 그대로 쓰면 "1 자리로 가져다 드립니다"가 됩니다. 숫자뿐일 때만 "번"을
 * 붙입니다 — "창가번"이 되면 안 되니까요.
 */
function tableName(entry: TableEntry): string {
  return /^\d+$/.test(entry.tableLabel) ? entry.tableLabel + '번' : entry.tableLabel
}

type Gate =
  | { state: 'none' }
  | { state: 'checking' }
  | { state: 'in'; entry: TableEntry }
  | { state: 'refused'; refusal: TableRefusal }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'stores' })
  const [gate, setGate] = useState<Gate>(() =>
    qrCodeFromUrl() === null ? { state: 'none' } : { state: 'checking' })

  const check = useCallback(() => {
    const code = qrCodeFromUrl()
    if (code === null) return
    setGate({ state: 'checking' })
    enterTable(code)
      .then((result) => setGate(isRefusal(result)
        ? { state: 'refused', refusal: result }
        : { state: 'in', entry: result }))
      .catch(() => setGate({
        state: 'refused',
        refusal: { reason: 'NETWORK', message: '연결이 끊겼습니다.', retryable: true }
      }))
  }, [])

  useEffect(() => { check() }, [check])

  if (gate.state === 'checking') {
    return <div className="shell"><div className="empty">확인하는 중…</div></div>
  }

  if (gate.state === 'refused') {
    return (
      <div className="shell">
        <header className="bar"><h1>주문 채널</h1></header>
        <div className="error" role="alert">{gate.refusal.message}</div>
        {gate.refusal.retryable && (
          <button className="btn primary" onClick={check}>다시 시도</button>
        )}
      </div>
    )
  }

  // 테이블 QR로 들어왔으면 매장을 고를 일이 없습니다 — 자리가 매장을
  // 이미 말해주고, 그것이 QR을 쓰는 이유입니다.
  if (gate.state === 'in') {
    const { entry } = gate
    return (
      <div className="shell">
        <header className="bar">
          <h1>{entry.storeName}</h1>
          <span className="table-badge">
            {entry.floor > 1 ? entry.floor + '층 ' : ''}{tableName(entry)}
          </span>
        </header>
        <MenuList store={{ id: entry.storeId, name: entry.storeName }} table={entry} />
      </div>
    )
  }

  return (
    <div className="shell">
      <header className="bar">
        <h1>주문 채널</h1>
        {screen.name === 'menus' && (
          <button className="btn link" onClick={() => setScreen({ name: 'stores' })}>
            ← 매장 다시 선택
          </button>
        )}
      </header>

      {screen.name === 'stores' ? (
        <StoreList onPick={(store) => setScreen({ name: 'menus', store })} />
      ) : (
        <MenuList store={screen.store} />
      )}
    </div>
  )
}

function StoreList({ onPick }: { onPick: (store: Store) => void }) {
  const [stores, setStores] = useState<Store[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStores()
      .then(setStores)
      .catch((e) => setError(e instanceof Error ? e.message : '매장 목록을 불러오지 못했습니다'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="empty">불러오는 중…</div>
  if (error) return <div className="error" role="alert">{error}</div>

  return (
    <>
      <p className="muted lead">매장을 선택하세요.</p>
      <div className="grid">
        {stores.map((store) => (
          <button key={store.id} className="tile" onClick={() => onPick(store)}>
            {store.name}
          </button>
        ))}
      </div>
    </>
  )
}

function MenuList({ store, table }: { store: Store; table?: TableEntry }) {
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingOut, setCheckingOut] = useState<MenuItem | null>(null)
  const [placed, setPlaced] = useState<PlacedOrder | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetchMenus(store.id)
      .then(setMenus)
      .catch((e) => setError(e instanceof Error ? e.message : '메뉴 목록을 불러오지 못했습니다'))
      .finally(() => setLoading(false))
  }, [store.id])

  useEffect(load, [load])

  if (loading) return <div className="empty">불러오는 중…</div>

  return (
    <>
      <p className="muted lead">
        {table
          ? <>주문하시면 <strong>{tableName(table)}</strong> 자리로 가져다 드립니다.</>
          : <><strong>{store.name}</strong>의 메뉴입니다. 메뉴를 고르면 확인 화면이 나옵니다.</>}
      </p>

      {error && <div className="error" role="alert">{error}</div>}
      {placed && (
        <div className="notice" role="status">
          <div>주문 #{placed.id} 접수됨 — {placed.menuName} · {formatAmount(placed.amount)}</div>
          {/* 부르는 번호와 증명하는 번호를 같이 남깁니다. 화면을 닫으면
              다시 못 보는 값이라, 접수 안내가 이 값을 붙들어 두는
              유일한 자리입니다. */}
          {placed.pickupNo && (
            <div className="pickup">
              <span className="pickup-no">{placed.pickupNo}</span>
              <span className="pickup-say">
                화면에 <strong>{placed.pickupNo}</strong>이(가) 뜨면 가져가실 수 있습니다.
                {placed.pickupPin && <> 직원에게 <strong>{placed.pickupPin}</strong>을(를) 말씀해주세요.</>}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="grid">
        {menus.map((menu) => (
          <button
            key={menu.id}
            className={`tile menu${menu.soldOut ? ' sold-out' : ''}`}
            // 결품은 목록에 남되 눌리지 않습니다. 빼버리면 손님은 그
            // 메뉴가 원래 없는 줄 알고, 매장에는 "왜 안 파냐"가 아니라
            // "메뉴가 왜 없어졌냐"는 전화가 옵니다.
            disabled={menu.soldOut}
            onClick={() => { setPlaced(null); setCheckingOut(menu) }}
          >
            <span className="menu-name">{menu.name}</span>
            <span className="menu-price">{formatAmount(menu.price)}</span>
            {menu.soldOut
              ? <span className="menu-flag">오늘 준비되지 않았습니다</span>
              : menu.estimatedMinutes !== null
                && <span className="menu-eta">약 {menu.estimatedMinutes}분</span>}
          </button>
        ))}
      </div>

      {checkingOut && (
        <Checkout
          store={store}
          menu={checkingOut}
          qrCode={table ? qrCodeFromUrl() ?? undefined : undefined}
          onClose={(order) => {
            if (order) setPlaced(order)
            setCheckingOut(null)
          }}
        />
      )}
    </>
  )
}

/**
 * The steps between "tapped a menu" and "order placed", in the order the
 * customer walks them.
 *
 * <p>A list rather than logic baked into {@link Checkout}, because this
 * is the seam the flow grows at. 결제 is the next one, and the 설계서 has
 * more after it. Adding a step is: put its name here, give it a case in
 * {@code StepPanel}. Nothing else in this file has to know.
 *
 * <p>Submitting the order and showing the result are deliberately *not*
 * in this list — they are not something a customer does, and mixing them
 * in would mean every new step had to be careful not to land after the
 * order was already placed.
 */
const FLOW = ['confirm'] as const
type StepName = (typeof FLOW)[number]

type Phase =
  | { name: 'step'; index: number }
  | { name: 'placing' }
  | { name: 'failed'; message: string }

/**
 * The checkout sheet. One menu item for now — 장바구니 replaces
 * {@code menu} with a list, and nothing about the step machine changes.
 */
function Checkout({ store, menu, qrCode, onClose }:
  { store: Store; menu: MenuItem; qrCode?: string; onClose: (placed: PlacedOrder | null) => void }) {
  const [phase, setPhase] = useState<Phase>({ name: 'step', index: 0 })
  const step = phase.name === 'step' ? FLOW[phase.index] : undefined

  // 이 Checkout 이 열려 있는 동안 하나입니다. "다시 시도"가 같은 값을
  // 보내야 서버가 두 번째를 같은 주문으로 알아보고, 주문이 둘이 되지
  // 않습니다 (업무 정의서 §4.4.6).
  const requestId = useMemo(newRequestId, [])

  async function advance() {
    if (phase.name !== 'step') return
    // Indexed rather than length-checked, so `noUncheckedIndexedAccess`
    // keeps proving there really is a step there.
    const next = phase.index + 1
    if (FLOW[next] !== undefined) {
      setPhase({ name: 'step', index: next })
      return
    }

    setPhase({ name: 'placing' })
    try {
      // Closes on success rather than showing a receipt of its own: the
      // confirmation belongs on the menu screen, where the customer can
      // see it while ordering the next thing.
      // requestId 는 이 Checkout 이 열릴 때 한 번 만듭니다. 재시도가
      // 같은 값을 보내야 서버가 두 번째를 같은 주문으로 알아봅니다 —
      // 여기서 만들면 "다시 시도"가 곧 새 주문이 됩니다.
      onClose(await placeOrder(store.id, menu.id, requestId, qrCode))
    } catch (e) {
      // A rejection here is Order's own state machine or the "no terminal
      // at this store" rule speaking — not this channel's business to
      // interpret further than showing what it said. Stays open so the
      // customer can retry without picking the menu again.
      setPhase({ name: 'failed', message: e instanceof Error ? e.message : '주문을 넣지 못했습니다' })
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="주문 확인">
      <div className="sheet">
        <div className="sheet-head">
          <span className="muted">{store.name}</span>
          {FLOW.length > 1 && phase.name === 'step' && (
            <span className="muted">{phase.index + 1} / {FLOW.length}</span>
          )}
        </div>

        <div className="sheet-item">
          <span className="menu-name">{menu.name}</span>
          <span className="menu-price">{formatAmount(menu.price)}</span>
        </div>

        {phase.name === 'failed' && <div className="error" role="alert">{phase.message}</div>}

        {step && <StepPanel step={step} menu={menu} />}

        <div className="sheet-actions">
          <button className="btn ghost" onClick={() => onClose(null)}
                  disabled={phase.name === 'placing'}>
            취소
          </button>
          <button className="btn primary" onClick={() => void advance()}
                  disabled={phase.name === 'placing'}>
            {phase.name === 'placing' ? '주문 중…'
              : phase.name === 'failed' ? '다시 시도'
              : '주문하기'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** One step's own content. A new step in {@link FLOW} gets a case here. */
function StepPanel({ step, menu }: { step: StepName; menu: MenuItem }) {
  switch (step) {
    case 'confirm':
      return (
        <>
          <p className="sheet-ask">이 메뉴로 주문하시겠습니까?</p>
          {menu.estimatedMinutes !== null && (
            <p className="sheet-note">
              지금 주문하시면 <strong>약 {menu.estimatedMinutes}분</strong> 걸립니다.
              앞의 주문에 따라 달라질 수 있습니다.
            </p>
          )}
        </>
      )
  }
}
