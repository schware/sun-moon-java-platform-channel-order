package com.sunmoon.channelorder.domain;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * Ten stores, and the same ten menu items at every one of them.
 *
 * <p>Fixed in code rather than in a database — this channel exists to
 * show orders flowing to the right store and menu, not to manage a real
 * catalog. There is no screen to add an eleventh store or a different
 * menu per branch; that would be BO's job if this channel ever needed
 * one (it doesn't, by design — see the README).
 */
@Component
public class Catalog {

    private final List<Store> stores = List.of(
            store(1), store(2), store(3), store(4), store(5),
            store(6), store(7), store(8), store(9), store(10));

    private final List<MenuItem> menus = List.of(
            menu(1), menu(2), menu(3), menu(4), menu(5),
            menu(6), menu(7), menu(8), menu(9), menu(10));

    public List<Store> stores() {
        return stores;
    }

    public Optional<Store> findStore(String storeId) {
        return stores.stream().filter(s -> s.id().equals(storeId)).findFirst();
    }

    /** Same menu at every store today — a store-specific menu is future scope, not this pass. */
    public List<MenuItem> menusFor(String storeId) {
        return menus;
    }

    public Optional<MenuItem> findMenu(String menuId) {
        return menus.stream().filter(m -> m.id().equals(menuId)).findFirst();
    }

    private static Store store(int n) {
        // Zero-padded so store-01..store-10 sort the way they list —
        // store-10 would otherwise land between store-1 and store-2.
        return new Store("store-%02d".formatted(n), n + "매장");
    }

    private static MenuItem menu(int n) {
        // A simple, deterministic price ladder — there is no real menu to
        // price against, and every order in this system is a sample.
        BigDecimal price = BigDecimal.valueOf(6000 + (n - 1) * 1000L);
        return new MenuItem("menu-%02d".formatted(n), n + "메뉴", price);
    }
}
