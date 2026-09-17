package com.sunmoon.channelorder.transport.http;

import com.sunmoon.channelorder.domain.PlaceOrderRequest;
import com.sunmoon.channelorder.infrastructure.appserver.AppServerClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 손님이 주문 버튼을 누르면 도착하는 자리 — 그리고 여기가 하는 일은
 * <b>넘기는 것뿐입니다</b>.
 *
 * <p>2026-09-17에 주문 처리가 APP-SERVER로 옮겨갔습니다 (업무 정의서
 * §4.4, §4.5). 그 전에는 이 controller가 매장·메뉴·결품을 검증하고
 * OMS로 직접 넣었는데, 그러면 <b>원장을 가진 쪽과 검증하는 쪽이
 * 다릅니다</b>. 화면을 하나 더 붙이는 날 검증이 두 벌이 되고, 두 벌은
 * 반드시 갈라집니다.
 *
 * <p>이제 흐름은 이렇습니다:
 *
 * <pre>
 *   손님 화면 → channel-order → APP-SERVER → OMS → POS
 * </pre>
 *
 * <p>브라우저가 APP-SERVER를 직접 부르지 않는 이유는 그대로입니다 —
 * APP-SERVER는 LAN 전용이고, 손님 화면은 자기를 내려준 곳하고만
 * 이야기합니다. 이 controller는 그 창구이고, 화면이 APP-SERVER로
 * 옮겨가면 함께 사라집니다.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Orders", description = "주문 접수 — APP-SERVER로 넘깁니다")
public class OrderChannelController {

    private final AppServerClient appServer;

    public OrderChannelController(AppServerClient appServer) {
        this.appServer = appServer;
    }

    @PostMapping("/orders")
    @Operation(summary = "주문 생성",
            description = "APP-SERVER로 그대로 넘기고, 그 답을 상태 코드까지 그대로 돌려줍니다. "
                    + "매장·메뉴·결품 검증과 원장 기록은 전부 APP-SERVER가 합니다.")
    public ResponseEntity<?> placeOrder(@Valid @RequestBody PlaceOrderRequest request) {
        // 상태 코드를 그대로 넘깁니다. 404/409/503 이 각각 다른 뜻이고
        // 화면이 그걸로 갈라지는데, 여기서 뭉개면 그 구분이 사라집니다.
        ResponseEntity<String> upstream = appServer.placeOrder(request);
        return ResponseEntity.status(upstream.getStatusCode())
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .body(upstream.getBody());
    }
}
