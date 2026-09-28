/**
 * 이 화면이 어디서 돌고 있나 (umbrella docs/design/customer-app.md §6).
 *
 *  - kiosk: 매장 단말 셸(SunMoon Store)이 KIOSK 로 페어링돼 있음 — {@code window.sunmoon}
 *  - app:   Capacitor (A1 단계에서)
 *  - web:   그 밖 — 지금까지의 동작 그대로
 *
 * <b>화면 컴포넌트는 플랫폼을 직접 보지 않습니다.</b> 다른 것은 여기와 kiosk/ 로 모읍니다.
 */

export type Kind = 'web' | 'app' | 'kiosk'

export interface ShellIdentity {
  storeId: string
  deviceId: string
  deviceType: string
  kdsRole: string | null
  token: string
  serverUrl: string
}

export interface TranRow {
  id: string
  tranNo: string
  businessDate: string
  payload: unknown
  mintedAt: string
}

/** 셸이 KIOSK 에 여는 것 (store-app.md §1 표). */
export interface ShellBridge {
  identity: { get: () => ShellIdentity | null }
  ledger?: {
    mint: (storeId: string, deviceId: string, businessDate: string, orderId: number) => Promise<TranRow>
    confirm: (id: string, payload: unknown) => Promise<void>
    discard: (id: string, reason: string) => Promise<void>
    pending: () => Promise<TranRow[]>
    markSent: (ids: string[]) => Promise<void>
    markFailed: (ids: string[], reason: string) => Promise<void>
  }
  printer?: { receipt?: (content: unknown) => Promise<{ ok: boolean; error?: string }> }
  payment?: {
    approve: (amount: number) => Promise<{ approved: boolean; method: string; approvalNo: string | null; amount: number; message?: string }>
  }
}

export function shell(): ShellBridge | undefined {
  return (window as unknown as { sunmoon?: ShellBridge }).sunmoon
}

export function kind(): Kind {
  return shell()?.identity.get()?.deviceType === 'KIOSK' ? 'kiosk' : 'web'
}
