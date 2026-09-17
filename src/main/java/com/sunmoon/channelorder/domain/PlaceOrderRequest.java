package com.sunmoon.channelorder.domain;

import jakarta.validation.constraints.NotBlank;

/**
 * What a customer's button press actually sends: two ids, nothing typed
 * by hand. There is no free-text field anywhere in this channel — every
 * order it can place is one of the 100 (store × menu) combinations the
 * catalog defines.
 */
public record PlaceOrderRequest(
        @NotBlank String storeId,
        @NotBlank String menuId,
        /**
         * 테이블 QR로 들어온 주문이면 그 코드. 브라우저가 매장·자리를 직접
         * 말하게 두지 않는 이유입니다 — 손님이 값을 바꿔서 앉지도 않은
         * 자리로 주문을 보낼 수 있으면, 서버가 자리를 정해준다는 QR의
         * 요점이 사라집니다. 코드를 다시 풀어서 도착지는 서버가 붙입니다.
         *
         * <p>덤으로 주문 시점에 매장 영업 여부를 한 번 더 봅니다 —
         * 메뉴를 고르는 동안 마감했을 수 있습니다.
         */
        String qrCode,
        /**
         * 멱등성 키 — 화면이 만들어 보냅니다 (업무 정의서 §4.4.6).
         *
         * <p>손님이 버튼을 두 번 누르거나 네트워크 재시도가 겹쳐도
         * 주문이 둘이 되지 않게 하는 값입니다. <b>서버가 만들면 안
         * 됩니다</b> — 재시도마다 새 값이 되어 아무것도 막지 못합니다.
         *
         * <p>없어도 주문은 됩니다. 그때는 APP-SERVER가 임의로 채워
         * 넣고, 중복 방지만 포기합니다 — 옛 화면이 보낸 요청을
         * 거절하는 것보다 낫습니다.
         */
        String requestId) {
}
