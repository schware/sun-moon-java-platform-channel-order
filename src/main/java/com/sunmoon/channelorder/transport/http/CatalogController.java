package com.sunmoon.channelorder.transport.http;

import com.sunmoon.channelorder.domain.Catalog;
import com.sunmoon.channelorder.domain.Store;
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

    public CatalogController(Catalog catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/stores")
    @Operation(summary = "매장 목록", description = "10개 매장.")
    public List<Store> stores() {
        return catalog.stores();
    }

    @GetMapping("/stores/{storeId}/menus")
    @Operation(summary = "매장의 메뉴 목록", description = "매장을 먼저 고른 뒤에만 의미가 있는 화면 순서를 그대로 반영한다.")
    public ResponseEntity<?> menus(@PathVariable String storeId) {
        if (catalog.findStore(storeId).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "존재하지 않는 매장입니다: " + storeId));
        }
        return ResponseEntity.ok(catalog.menusFor(storeId));
    }
}
