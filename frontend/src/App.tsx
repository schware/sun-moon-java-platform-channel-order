import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CLAIM_STATUS,
  enterTable,
  fetchClaim,
  fetchMenus,
  fetchStores,
  formatAmount,
  formatMemberNo,
  isRefusal,
  issueMember,
  newRequestId,
  placeOrder,
  rememberedMember,
  rememberMember,
  Unreachable,
  verifyMember,
  type ClaimedOrder,
  type MenuItem,
  type PlacedOrder,
  type Store,
  type TableEntry,
  type TableRefusal
} from './api'
import Kiosk from './kiosk/Kiosk'
import { kind } from './platform'

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

/** 주소가 /channel-order/o/{token} 이면 그 값. 영수증 QR입니다. */
function claimTokenFromUrl(): string | null {
  const match = window.location.pathname.match(/\/o\/([^/?#]+)\/?$/)
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
  // 영수증 QR로 들어온 것은 **주문하러 온 것이 아닙니다**. 메뉴도 매장
  // 선택도 필요 없고, 볼 것은 자기 주문 하나뿐입니다.
  //
  // **hook 보다 먼저 갈라집니다.** 아래 state 를 만든 다음에 여기서
  // 돌아가면 렌더마다 부르는 hook 수가 달라지고, React 가 상태를
  // 어긋나게 짚습니다. 주소는 이 창이 열릴 때 정해져서 중간에 바뀌지
  // 않으므로, 갈라지는 자리는 맨 위가 맞습니다.
  // 매장 단말 셸에 KIOSK 로 페어링돼 있으면 키오스크 화면입니다(store-app.md §9). 셸 밖에서는
  // 늘 'web' 이라 지금까지의 동작이 그대로입니다. 영수증 QR 과 같은 이유로 hook 보다 먼저.
  if (kind() === 'kiosk') {
    return <Kiosk />
  }

  const claimToken = claimTokenFromUrl()
  if (claimToken !== null) {
    return <OrderStatus token={claimToken} />
  }

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

/**
 * 장바구니 한 줄 — 무엇을 몇 개.
 *
 * 메뉴 전체를 들고 있는 이유: 화면이 이름과 가격을 그려야 하고, 결품이
 * 되면 그 줄을 짚어 말해줘야 합니다. **서버로 갈 때는 id와 수량만
 * 갑니다** — 가격을 화면이 정하지 않습니다.
 */
interface CartLine {
  menu: MenuItem
  quantity: number
}

function MenuList({ store, table }: { store: Store; table?: TableEntry }) {
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState<CartLine[]>([])
  const [checkingOut, setCheckingOut] = useState<CartLine[] | null>(null)
  const [placed, setPlaced] = useState<PlacedOrder | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetchMenus(store.id)
      .then(setMenus)
      .catch((e) => setError(e instanceof Error ? e.message : '메뉴 목록을 불러오지 못했습니다'))
      .finally(() => setLoading(false))
  }, [store.id])

  useEffect(load, [load])

  /**
   * 담기 — 같은 메뉴를 또 담으면 수량이 늘어납니다.
   *
   * 줄을 따로 만들지 않는 이유: 지금은 줄마다 다르게 할 것이 없습니다.
   * 옵션(맵게/안 맵게)이 생기는 날에는 줄을 갈라야 하고, 그때 서버는
   * 이미 준비돼 있습니다 — 같은 메뉴 두 줄을 합치지 않습니다.
   */
  function add(menu: MenuItem) {
    setPlaced(null)
    setCart((current) => {
      const found = current.find((line) => line.menu.id === menu.id)
      if (found) {
        return current.map((line) =>
          line.menu.id === menu.id ? { ...line, quantity: line.quantity + 1 } : line)
      }
      return [...current, { menu, quantity: 1 }]
    })
  }

  function setQuantity(menuId: string, quantity: number) {
    setCart((current) => quantity <= 0
      ? current.filter((line) => line.menu.id !== menuId)
      : current.map((line) => line.menu.id === menuId ? { ...line, quantity } : line))
  }

  const total = cart.reduce((sum, line) => sum + line.menu.price * line.quantity, 0)
  const count = cart.reduce((sum, line) => sum + line.quantity, 0)

  // 여러 개를 한꺼번에 시키면 제일 오래 걸리는 것을 기다립니다.
  // 더하면 안 됩니다 — 주방은 동시에 만듭니다.
  const eta = cart.reduce<number | null>((longest, line) => {
    const minutes = line.menu.estimatedMinutes
    if (minutes === null) return longest
    return longest === null || minutes > longest ? minutes : longest
  }, null)

  if (loading) return <div className="empty">불러오는 중…</div>

  return (
    <>
      <p className="muted lead">
        {table
          ? <>주문하시면 <strong>{tableName(table)}</strong> 자리로 가져다 드립니다.</>
          : <><strong>{store.name}</strong>의 메뉴입니다. 담고 싶은 만큼 고르세요.</>}
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
        {menus.map((menu) => {
          const inCart = cart.find((line) => line.menu.id === menu.id)
          return (
            <button
              key={menu.id}
              className={`tile menu${menu.soldOut ? ' sold-out' : ''}${inCart ? ' in-cart' : ''}`}
              // 결품은 목록에 남되 눌리지 않습니다. 빼버리면 손님은 그
              // 메뉴가 원래 없는 줄 알고, 매장에는 "왜 안 파냐"가 아니라
              // "메뉴가 왜 없어졌냐"는 전화가 옵니다.
              disabled={menu.soldOut}
              onClick={() => add(menu)}
            >
              <span className="menu-name">{menu.name}</span>
              <span className="menu-price">{formatAmount(menu.price)}</span>
              {menu.soldOut
                ? <span className="menu-flag">오늘 준비되지 않았습니다</span>
                : menu.estimatedMinutes !== null
                  && <span className="menu-eta">약 {menu.estimatedMinutes}분</span>}
              {/* 몇 개 담았는지 타일 위에 바로 보입니다. 장바구니를 열어야
                  알 수 있으면 손님은 같은 것을 또 담습니다. */}
              {inCart && <span className="menu-count">{inCart.quantity}</span>}
            </button>
          )
        })}
      </div>

      {/*
        담은 것을 화면 아래에 붙여 둡니다.

        따로 장바구니 화면으로 넘어가지 않는 이유: 손님은 메뉴를 보면서
        더 담습니다. 화면이 바뀌면 돌아오는 동작이 하나 더 생기고,
        그 자리에서 "그만 시킬까" 하게 됩니다.
      */}
      {cart.length > 0 && (
        <div className="cart">
          <ul className="cart-lines">
            {cart.map((line) => (
              <li key={line.menu.id}>
                <span className="cart-name">{line.menu.name}</span>
                <span className="cart-stepper">
                  <button
                    className="btn step"
                    aria-label={`${line.menu.name} 하나 빼기`}
                    onClick={() => setQuantity(line.menu.id, line.quantity - 1)}
                  >−</button>
                  <span className="cart-qty">{line.quantity}</span>
                  <button
                    className="btn step"
                    aria-label={`${line.menu.name} 하나 더`}
                    onClick={() => setQuantity(line.menu.id, line.quantity + 1)}
                  >+</button>
                </span>
                <span className="cart-amount">
                  {formatAmount(line.menu.price * line.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="cart-foot">
            <span className="cart-total">
              {count}개 · <strong>{formatAmount(total)}</strong>
              {eta !== null && <span className="muted"> · 약 {eta}분</span>}
            </span>
            <button className="btn primary" onClick={() => { setPlaced(null); setCheckingOut(cart) }}>
              주문하기
            </button>
          </div>
        </div>
      )}

      {checkingOut && (
        <Checkout
          store={store}
          lines={checkingOut}
          qrCode={table ? qrCodeFromUrl() ?? undefined : undefined}
          onClose={(order) => {
            if (order) {
              setPlaced(order)
              // 주문이 들어갔으면 장바구니를 비웁니다. 남겨 두면 다음
              // 손님이(테이블 QR은 같은 화면입니다) 남의 것을 시킵니다.
              setCart([])
            }
            setCheckingOut(null)
          }}
        />
      )}
    </>
  )
}

/**
 * The steps between "tapped 주문하기" and "order placed", in the order the
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
 * The checkout sheet — now a list of lines (2026-09-18).
 *
 * <p>The step machine did not change, which is what the earlier comment
 * on {@link FLOW} predicted: 장바구니 replaced one menu with a list and
 * nothing else moved.
 */
function Checkout({ store, lines, qrCode, onClose }:
  { store: Store; lines: CartLine[]; qrCode?: string; onClose: (placed: PlacedOrder | null) => void }) {
  const [phase, setPhase] = useState<Phase>({ name: 'step', index: 0 })
  const step = phase.name === 'step' ? FLOW[phase.index] : undefined

  // 이 Checkout 이 열려 있는 동안 하나입니다. "다시 시도"가 같은 값을
  // 보내야 서버가 두 번째를 같은 주문으로 알아보고, 주문이 둘이 되지
  // 않습니다 (업무 정의서 §4.4.6).
  const requestId = useMemo(newRequestId, [])

  // 이 휴대폰이 기억하는 회원번호. 없으면 익명으로 주문합니다 — 번호는
  // 자격이 아니라 편의라, 여기서 막지 않습니다.
  const [memberNo, setMemberNo] = useState<string | null>(() => rememberedMember())

  const total = lines.reduce((sum, line) => sum + line.menu.price * line.quantity, 0)

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
      //
      // 가격은 안 보냅니다. 서버가 메뉴판에서 다시 꺼냅니다.
      onClose(await placeOrder(
        store.id,
        lines.map((line) => ({ menuId: line.menu.id, quantity: line.quantity })),
        requestId,
        qrCode,
        memberNo ?? undefined))
    } catch (e) {
      // A rejection here is Order's own state machine, the "no terminal
      // at this store" rule, or 결품 speaking — not this channel's
      // business to interpret further than showing what it said. Stays
      // open so the customer can retry without building the cart again.
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

        {lines.map((line) => (
          <div className="sheet-item" key={line.menu.id}>
            <span className="menu-name">
              {line.menu.name}
              {/* 수량은 1일 때 안 씁니다 — "짜장면 x1"은 읽는 사람에게
                  아무것도 더 말해주지 않습니다. */}
              {line.quantity > 1 && <span className="muted"> × {line.quantity}</span>}
            </span>
            <span className="menu-price">{formatAmount(line.menu.price * line.quantity)}</span>
          </div>
        ))}

        {lines.length > 1 && (
          <div className="sheet-item total">
            <span className="menu-name">합계</span>
            <span className="menu-price">{formatAmount(total)}</span>
          </div>
        )}

        {phase.name === 'failed' && <div className="error" role="alert">{phase.message}</div>}

        {step && <StepPanel step={step} lines={lines} />}
        {/* 회원번호 (§4.1). FLOW 의 단계로 만들지 않은 이유: 이것은
            거쳐야 하는 단계가 아니라 곁들여 두는 칸입니다. 단계로
            두면 번호가 없는 손님도 한 번씩 눌러 넘겨야 합니다. */}
        {step && <MemberField memberNo={memberNo} onChange={setMemberNo} />}

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
function StepPanel({ step, lines }: { step: StepName; lines: CartLine[] }) {
  // 여러 개면 제일 오래 걸리는 것을 기다립니다 — 주방은 동시에 만듭니다.
  const eta = lines.reduce<number | null>((longest, line) => {
    const minutes = line.menu.estimatedMinutes
    if (minutes === null) return longest
    return longest === null || minutes > longest ? minutes : longest
  }, null)

  switch (step) {
    case 'confirm':
      return (
        <>
          <p className="sheet-ask">
            {lines.length === 1 ? '이 메뉴로 주문하시겠습니까?' : '이대로 주문하시겠습니까?'}
          </p>
          {eta !== null && (
            <p className="sheet-note">
              지금 주문하시면 <strong>약 {eta}분</strong> 걸립니다.
              앞의 주문에 따라 달라질 수 있습니다.
            </p>
          )}
        </>
      )
  }
}

/**
 * 회원번호 칸 (업무 정의서 §4.1).
 *
 * <p><b>가입이 아닙니다.</b> 아무것도 묻지 않고 번호 하나를 받습니다 —
 * 이름도 전화번호도 없고, 있는 것은 열한 자리 숫자뿐입니다.
 *
 * <p>주문을 막지 않는 것이 이 칸의 규칙입니다. 번호가 없어도, 잘못
 * 쳤어도 주문은 그대로 들어갑니다. 도우려고 넣은 값이 장사를 막으면
 * 안 됩니다.
 */
function MemberField({ memberNo, onChange }:
  { memberNo: string | null; onChange: (memberNo: string | null) => void }) {
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function receive() {
    setBusy(true)
    setNote(null)
    try {
      const issued = await issueMember()
      rememberMember(issued.memberNo)
      onChange(issued.memberNo)
    } catch {
      // 번호를 못 받아도 주문은 됩니다.
      setNote('지금은 번호를 받을 수 없습니다. 이대로 주문하셔도 됩니다.')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    const cleaned = draft.replace(/\D/g, '')
    setBusy(true)
    setNote(null)
    try {
      const found = await verifyMember(cleaned)
      if (found === null) {
        setNote('그런 번호가 없습니다. 다시 확인해 주세요.')
        return
      }
      rememberMember(found.memberNo)
      onChange(found.memberNo)
      setTyping(false)
      setDraft('')
    } catch {
      setNote('지금은 확인할 수 없습니다. 이대로 주문하셔도 됩니다.')
    } finally {
      setBusy(false)
    }
  }

  if (memberNo) {
    return (
      <p className="sheet-note member-row">
        회원번호 <strong>{formatMemberNo(memberNo)}</strong>
        <button className="btn link" onClick={() => { rememberMember(null); onChange(null) }}>
          빼기
        </button>
      </p>
    )
  }

  return (
    <div className="sheet-note member-row">
      {typing ? (
        <>
          <input
            className="member-input"
            inputMode="numeric"
            autoFocus
            placeholder="회원번호 11자리"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn link" disabled={busy} onClick={() => void apply()}>확인</button>
          <button className="btn link" onClick={() => { setTyping(false); setNote(null) }}>취소</button>
        </>
      ) : (
        <>
          <span className="muted">회원번호 없이도 주문됩니다.</span>
          <button className="btn link" disabled={busy} onClick={() => void receive()}>번호 받기</button>
          <button className="btn link" onClick={() => setTyping(true)}>번호 입력</button>
        </>
      )}
      {note && <span className="muted member-note">{note}</span>}
    </div>
  )
}

/**
 * 영수증 QR로 여는 화면 — 손님이 자기 주문 하나를 봅니다
 * (umbrella docs/adr/0007, 업무 정의서 §4.8 주문 상태 조회).
 *
 * <p>설계서에 있었지만 만들지 못했던 화면입니다. 손님을 가리킬 방법이
 * 없었기 때문입니다 — 로그인도 회원번호도 없으니 "누구의 주문"을 말할
 * 수가 없었습니다. **종이 영수증이 그 자리를 채웁니다**: 가진 사람이
 * 곧 그 주문의 사람입니다.
 *
 * <p>폴링합니다. 손님은 이 화면을 켜 두고 기다리고, 가장 중요한 변화는
 * "준비됐습니다"인데 그건 매장이 정하는 것이라 이쪽에서 알 길이
 * 폴링밖에 없습니다. 소켓을 쓰지 않는 이유: 손님은 수만 명이고 잠깐
 * 왔다 갑니다 — 연결을 쥐는 것은 단말의 방식이지 손님의 방식이
 * 아닙니다.
 */
function OrderStatus({ token }: { token: string }) {
  const [order, setOrder] = useState<ClaimedOrder | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'unreachable'>('loading')

  const load = useCallback(async () => {
    try {
      const found = await fetchClaim(token)
      if (found === null) {
        setState('missing')
        return
      }
      setOrder(found)
      setState('ok')
    } catch (e) {
      // 못 물어본 것과 없는 것은 다릅니다. 여기서 뭉개면 연결이 끊긴
      // 손님에게 "그런 주문 없습니다"라고 말하게 됩니다.
      setState(e instanceof Unreachable ? 'unreachable' : 'missing')
    }
  }, [token])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 10000)
    return () => window.clearInterval(timer)
  }, [load])

  if (state === 'loading') {
    return <div className="shell"><div className="empty">주문을 확인하는 중…</div></div>
  }

  if (state === 'unreachable') {
    return (
      <div className="shell">
        <header className="bar"><h1>주문 확인</h1></header>
        <div className="error" role="alert">지금은 주문 상태를 확인할 수 없습니다.</div>
        <button className="btn primary" onClick={() => void load()}>다시 시도</button>
      </div>
    )
  }

  if (state === 'missing' || order === null) {
    return (
      <div className="shell">
        <header className="bar"><h1>주문 확인</h1></header>
        <div className="empty">
          주문을 찾을 수 없습니다.<br />
          영수증의 QR을 다시 찍어 주세요.
        </div>
      </div>
    )
  }

  const ready = order.status === 'PRODUCED'
  const over = order.status === 'REJECTED' || order.status === 'EXPIRED'
    || order.status === 'CANCELLED' || order.status === 'COMPLETED'

  return (
    <div className="shell">
      <header className="bar"><h1>주문 확인</h1></header>

      {/* 수령번호가 제일 큽니다. 손님이 이 화면을 여는 이유의 대부분이
          "내 번호가 몇 번이더라"입니다. */}
      {order.pickupNo && (
        <div className={ready ? 'claim-number ready' : 'claim-number'}>
          <span className="claim-label">수령번호</span>
          <strong>{order.pickupNo}</strong>
        </div>
      )}

      <div className={ready ? 'claim-state ready' : over ? 'claim-state over' : 'claim-state'}
           role="status">
        {CLAIM_STATUS[order.status] ?? order.status}
        {ready && order.calledAt && <div className="muted">번호가 불렸습니다 — 카운터로 오세요.</div>}
      </div>

      <ul className="claim-lines">
        {order.lines.length > 0 ? order.lines.map((line, i) => (
          <li key={i}>
            <span>{line.menuName}</span>
            <span className="muted">{line.quantity}개</span>
            <span>{formatAmount(line.lineAmount)}</span>
          </li>
        )) : (
          // 2026-09-18 이전 주문에는 줄이 없습니다. 그때는 주문 하나가
          // 메뉴 하나였고, 그 이름이 요약에 그대로 있습니다.
          <li><span>{order.summary}</span><span>{formatAmount(order.amount)}</span></li>
        )}
      </ul>

      <div className="claim-total">
        <span>합계</span><strong>{formatAmount(order.amount)}</strong>
      </div>

      {!over && <p className="muted">이 화면은 10초마다 저절로 새로고침됩니다.</p>}
    </div>
  )
}
