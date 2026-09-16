package com.sunmoon.channelorder.transport.http;

import com.sunmoon.channelorder.domain.Catalog;
import com.sunmoon.channelorder.domain.MenuItem;
import com.sunmoon.channelorder.domain.PlaceOrderRequest;
import com.sunmoon.channelorder.domain.Store;
import com.sunmoon.channelorder.infrastructure.order.OrderClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.SecureRandom;
import java.util.Map;
import java.util.Optional;

/**
 * The one action this channel offers: turn a (store, menu) button press
 * into a real order.
 *
 * <p>There is no login and no free-text field, because there is no
 * customer account behind this channel — every order it can place is a
 * sample, by the same design decision the POS terminal documents. A
 * throwaway customer id is generated per order rather than asked for.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Orders", description = "매장 + 메뉴 선택으로 주문 생성")
public class OrderChannelController {

    private static final Logger log = LoggerFactory.getLogger(OrderChannelController.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Catalog catalog;
    private final OrderClient orderClient;
    private final com.sunmoon.channelorder.infrastructure.appserver.AppServerClient appServer;

    public OrderChannelController(Catalog catalog, OrderClient orderClient,
            com.sunmoon.channelorder.infrastructure.appserver.AppServerClient appServer) {
        this.catalog = catalog;
        this.orderClient = orderClient;
        this.appServer = appServer;
    }

    @PostMapping("/orders")
    @Operation(summary = "주문 생성", description = "storeId + menuId만 받는다. 금액은 카탈로그의 메뉴 가격에서 정해진다.")
    public ResponseEntity<?> placeOrder(@Valid @RequestBody PlaceOrderRequest request) {
        Optional<Store> store = catalog.findStore(request.storeId());
        if (store.isEmpty()) {
            return badRequest("존재하지 않는 매장입니다: " + request.storeId());
        }
        Optional<MenuItem> menu = catalog.findMenu(request.menuId());
        if (menu.isEmpty()) {
            return badRequest("존재하지 않는 메뉴입니다: " + request.menuId());
        }

        String customerId = "guest-" + randomId();

        // 도착지는 서버가 붙입니다. 브라우저가 보낸 매장·자리를 믿으면,
        // 값을 바꿔서 앉지도 않은 자리로 주문을 보낼 수 있고 QR의 요점이
        // 사라집니다. 게이트를 다시 통과하는 김에 매장이 아직 영업 중인지도
        // 한 번 더 봅니다 — 메뉴를 고르는 동안 마감했을 수 있습니다.
        Integer floor = null;
        String tableNo = null;
        String storeId = request.storeId();
        if (request.qrCode() != null && !request.qrCode().isBlank()) {
            var table = appServer.resolveTable(request.qrCode());
            if (table.isEmpty()) {
                return badRequest("이 자리로는 지금 주문할 수 없습니다. 화면을 새로고침해주세요.");
            }
            storeId = table.get().storeId();
            floor = table.get().floor();
            tableNo = table.get().tableNo();
        }

        try {
            var upstream = orderClient.placeOrder(
                    storeId, customerId, menu.get().name(), menu.get().price(), menu.get().kdsDeviceId(),
                    floor, tableNo);

            // Order's answer is passed through unchanged, status included —
            // this channel has no opinion about whether the order is valid
            // beyond store/menu existing; the rest is Order's call.
            return ResponseEntity.status(upstream.statusCode())
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .body(upstream.body());
        } catch (Exception e) {
            log.warn("Order service unreachable", e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "주문 서비스에 연결할 수 없습니다"));
        }
    }

    private static ResponseEntity<Map<String, String>> badRequest(String message) {
        return ResponseEntity.badRequest().body(Map.of("error", message));
    }

    /** Short enough to read in a demo, random enough that two clicks don't collide. */
    private static String randomId() {
        return Long.toString(Math.abs(RANDOM.nextLong()), 36).substring(0, 6);
    }
}
