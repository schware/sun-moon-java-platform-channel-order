package com.sunmoon.channelorder.domain;

import java.math.BigDecimal;

/**
 * 손님 화면이 실제로 받는 메뉴 한 줄 — 카탈로그의 메뉴에 <b>오늘의
 * 사정</b>을 덮은 것.
 *
 * <p>{@link MenuItem} 과 따로 두는 이유: 저쪽은 이 채널이 아는 고정
 * 카탈로그이고, 이쪽은 매장과 날짜가 붙어야 비로소 정해지는 값입니다.
 * 한 record 에 섞으면 "결품인 메뉴"라는 게 카탈로그에 있는 것처럼
 * 보이는데, 결품은 메뉴의 성질이 아니라 오늘 이 매장의 사정입니다.
 *
 * <p>{@code estimatedMinutes} 가 null 이면 <b>모른다</b>입니다 —
 * 0분이 아닙니다. 화면은 모르는 값을 안 그립니다.
 */
public record MenuItemView(
        String id,
        String name,
        BigDecimal price,
        boolean soldOut,
        Integer estimatedMinutes) {

    public static MenuItemView of(MenuItem menu, boolean soldOut, Integer estimatedMinutes) {
        return new MenuItemView(menu.id(), menu.name(), menu.price(), soldOut,
                soldOut ? null : estimatedMinutes);
    }
}
