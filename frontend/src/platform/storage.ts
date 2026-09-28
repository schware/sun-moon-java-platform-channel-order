/**
 * 회원 토큰 보관 (customer-app.md §2, §3). 껍데기마다 다른 것만 여기에.
 *
 *  - web:   localStorage — 손님 자기 기기의 브라우저
 *  - app:   (A3) Preferences 보안 저장
 *  - kiosk: <b>저장하지 않음</b> — 여럿이 쓰는 기계에 남의 토큰을 남기면 안 됩니다
 *
 * 토큰은 <b>이력을 볼 자격</b>입니다. 번호(비밀 아님)와 달리 잃어버리면 그 기기에서 이력이
 * 안 보일 뿐이고, 영수증으로 다시 연결하면 됩니다.
 */
import { kind } from '.'

const TOKEN_KEY = 'memberToken'

export function memberToken(): string | null {
  if (kind() === 'kiosk') return null
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function rememberMemberToken(token: string | null): void {
  if (kind() === 'kiosk') return
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // 못 적으면 이번 화면에서만 씁니다.
  }
}
