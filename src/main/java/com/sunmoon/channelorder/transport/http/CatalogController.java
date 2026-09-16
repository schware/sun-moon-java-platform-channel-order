package com.sunmoon.channelorder.transport.http;

import com.sunmoon.channelorder.domain.Catalog;
import com.sunmoon.channelorder.domain.MenuItemView;
import com.sunmoon.channelorder.domain.Store;
import com.sunmoon.channelorder.infrastructure.appserver.AppServerClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/** What the screen picks from: stores first, then that store's menu. */
@RestController
@RequestMapping("/api")
@Tag(name = "Catalog", description = "매장/메뉴 목록")
public class CatalogController {

    private final Catalog catalog;
    private final AppServerClient appServer;

    public CatalogController(Catalog catalog, AppServerClient appServer) {
        this.catalog = catalog;
        this.appServer = appServer;
    }

    @GetMapping("/stores")
    @Operation(summary = "매장 목록", description = "10개 매장.")
    public List<Store> stores() {
        return catalog.stores();
    }

    /**
     * 매장의 메뉴 목록 — 목록은 이 채널의 카탈로그에서, <b>오늘의
     * 사정</b>(결품·예상시간)은 APP-SERVER에서 옵니다.
     *
     * <p>결품인 메뉴를 목록에서 빼지 않습니다. 빼면 손님은 그 메뉴가
     * 원래 없는 줄 알고, 매장에는 "왜 안 파냐"가 아니라 "메뉴가 왜
     * 없어졌냐"는 전화가 옵니다. 보여주되 고를 수 없게 합니다.
     */
    @GetMapping("/stores/{storeId}/menus")
    @Operation(summary = "매장의 메뉴 목록",
            description = "매장을 먼저 고른 뒤에만 의미가 있는 화면 순서를 그대로 반영한다. "
                    + "soldOut은 오늘 이 매장에 없다는 뜻이고, estimatedMinutes는 모르면 null이다.")
    public ResponseEntity<?> menus(@PathVariable String storeId) {
        if (catalog.findStore(storeId).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "존재하지 않는 매장입니다: " + storeId));
        }
        Map<String, AppServerClient.MenuStatus> today = appServer.menuStatuses(storeId);
        return ResponseEntity.ok(catalog.menusFor(storeId).stream()
                .map(menu -> {
                    // 지도에 없으면 "사정 없음"으로 봅니다 — APP-SERVER가
                    // 안 보일 때 메뉴판이 통째로 죽는 것보다 낫습니다.
                    AppServerClient.MenuStatus status = today.get(menu.id());
                    return status == null
                            ? MenuItemView.of(menu, false, null)
                            : MenuItemView.of(menu, status.soldOut(), status.estimatedMinutes());
                })
                .toList());
    }
}
