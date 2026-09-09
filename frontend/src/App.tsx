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
  const [placingId, setPlacingId] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<PlacedOrder | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetchMenus(store.id)
      .then(setMenus)
      .catch((e) => setError(e instanceof Error ? e.message : '메뉴 목록을 불러오지 못했습니다'))
      .finally(() => setLoading(false))
  }, [store.id])

  useEffect(load, [load])

  async function order(menu: MenuItem) {
    setPlacingId(menu.id)
    setError(null)
    setConfirmed(null)
    try {
      const placed = await placeOrder(store.id, menu.id)
      setConfirmed(placed)
    } catch (e) {
      // A rejection here is Order's own state machine or the "no terminal
      // at this store" rule speaking — not this channel's business to
      // interpret further than showing what it said.
      setError(e instanceof Error ? e.message : '주문을 넣지 못했습니다')
    } finally {
      setPlacingId(null)
    }
  }

  if (loading) return <div className="empty">불러오는 중…</div>

  return (
    <>
      <p className="muted lead">
        <strong>{store.name}</strong>의 메뉴입니다. 눌러서 바로 주문합니다.
      </p>

      {error && <div className="error" role="alert">{error}</div>}
      {confirmed && (
        <div className="notice" role="status">
          주문 #{confirmed.id} 접수됨 — {confirmed.menuName} · {formatAmount(confirmed.amount)}
        </div>
      )}

      <div className="grid">
        {menus.map((menu) => (
          <button
            key={menu.id}
            className="tile menu"
            disabled={placingId === menu.id}
            onClick={() => void order(menu)}
          >
            <span className="menu-name">{menu.name}</span>
            <span className="menu-price">{formatAmount(menu.price)}</span>
          </button>
        ))}
      </div>
    </>
  )
}
