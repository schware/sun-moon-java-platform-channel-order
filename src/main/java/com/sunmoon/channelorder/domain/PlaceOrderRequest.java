package com.sunmoon.channelorder.domain;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

/**
 * What a customer's button press actually sends: ids, nothing typed by
 * hand. There is no free-text field anywhere in this channel — and no
 * price either. <b>가격은 보내지 않습니다</b>: 보낸 값을 믿으면 손님이
 * 값을 바꿔 1원에 살 수 있습니다. APP-SERVER가 그 매장 그 날짜의
 * 메뉴판에서 다시 꺼냅니다.
 *
 * <p>2026-09-18에 장바구니가 붙었습니다. {@code items} 로 여러 줄을
 * 보내고, {@code menuId} 한 개짜리 옛 모양도 그대로 받습니다 — 화면과
 * 서버가 한날한시에 바뀌지 않기 때문입니다.
 */
public record PlaceOrderRequest(
        @NotBlank String storeId,
        /** 옛 모양 — 메뉴 하나. {@code items} 가 있으면 무시됩니다. */
        String menuId,
        /** 장바구니. {@code [{menuId, quantity}]} 그대로 APP-SERVER 로 넘어갑니다. */
        List<Item> items,
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

    /** 장바구니 한 줄. 이 채널은 넘기기만 하므로 검사도 APP-SERVER 가 합니다. */
    public record Item(String menuId, int quantity) {
    }

    /** 무엇이든 하나는 골랐는가. 둘 다 비면 400입니다. */
    public boolean hasAnything() {
        return (items != null && !items.isEmpty())
                || (menuId != null && !menuId.isBlank());
    }
}
