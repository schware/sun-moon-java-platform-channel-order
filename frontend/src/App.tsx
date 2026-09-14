import { useCallback, useEffect, useState } from 'react'
import {
  fetchMenus,
  fetchStores,
  formatAmount,
  placeOrder,
  type MenuItem,
  type PlacedOrder,
  type Store
} from './api'

/**
 * Store first, then menu — the two screens this channel has, in the
 * order the owner asked for. No free-text field anywhere: every order
 * placed here is one of a fixed set of (store, menu) buttons.
 */
type Screen = { name: 'stores' } | { name: 'menus'; store: Store }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'stores' })

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

function MenuList({ store }: { store: Store }) {
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
        <strong>{store.name}</strong>의 메뉴입니다. 메뉴를 고르면 확인 화면이 나옵니다.
      </p>

      {error && <div className="error" role="alert">{error}</div>}
      {placed && (
        <div className="notice" role="status">
          주문 #{placed.id} 접수됨 — {placed.menuName} · {formatAmount(placed.amount)}
        </div>
      )}

      <div className="grid">
        {menus.map((menu) => (
          <button
            key={menu.id}
            className="tile menu"
            onClick={() => { setPlaced(null); setCheckingOut(menu) }}
          >
            <span className="menu-name">{menu.name}</span>
            <span className="menu-price">{formatAmount(menu.price)}</span>
          </button>
        ))}
      </div>

      {checkingOut && (
        <Checkout
          store={store}
          menu={checkingOut}
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
function Checkout({ store, menu, onClose }:
  { store: Store; menu: MenuItem; onClose: (placed: PlacedOrder | null) => void }) {
  const [phase, setPhase] = useState<Phase>({ name: 'step', index: 0 })
  const step = phase.name === 'step' ? FLOW[phase.index] : undefined

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
      onClose(await placeOrder(store.id, menu.id))
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

        {step && <StepPanel step={step} />}

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
function StepPanel({ step }: { step: StepName }) {
  switch (step) {
    case 'confirm':
      return <p className="sheet-ask">이 메뉴로 주문하시겠습니까?</p>
  }
}
