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
        String qrCode) {
}
