package com.sunmoon.channelorder.transport.http;

import com.sunmoon.channelorder.domain.PlaceOrderRequest;
import com.sunmoon.channelorder.infrastructure.appserver.AppServerClient;
import com.sunmoon.channelorder.infrastructure.order.OrderClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
    /** 주문 상태 조회만 이쪽으로 갑니다 — 읽는 질문은 OMS가 답합니다. */
    private final OrderClient orders;

    public OrderChannelController(AppServerClient appServer, OrderClient orders) {
        this.appServer = appServer;
        this.orders = orders;
    }

    @PostMapping("/orders")
    @Operation(summary = "주문 생성",
            description = "APP-SERVER로 그대로 넘기고, 그 답을 상태 코드까지 그대로 돌려줍니다. "
                    + "매장·메뉴·결품 검증과 원장 기록은 전부 APP-SERVER가 합니다.")
    public ResponseEntity<?> placeOrder(@Valid @RequestBody PlaceOrderRequest request) {
        if (!request.hasAnything()) {
            // 아무것도 안 고른 주문. 여기서 막는 이유는 APP-SERVER 까지
            // 왕복할 이유가 없어서이지, 검사를 여기서 한다는 뜻은
            // 아닙니다 — 메뉴가 실제로 있는지는 저쪽이 봅니다.
            return ResponseEntity.badRequest()
                    .body(java.util.Map.of("error", "메뉴를 하나 이상 골라주세요"));
        }
        // 상태 코드를 그대로 넘깁니다. 404/409/503 이 각각 다른 뜻이고
        // 화면이 그걸로 갈라지는데, 여기서 뭉개면 그 구분이 사라집니다.
        ResponseEntity<String> upstream = appServer.placeOrder(request);
        return ResponseEntity.status(upstream.getStatusCode())
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .body(upstream.getBody());
    }

    /**
     * 영수증 QR을 찍으면 오는 자리 (umbrella docs/adr/0007, 업무 정의서 §4.8).
     *
     * <p>설계서의 <b>주문 상태 조회</b>가 이제야 길을 얻었습니다. 그동안
     * 못 만든 이유는 손님을 가리킬 방법이 없어서였습니다 — 로그인이
     * 없고 회원번호도 없으니, 주문을 가리킬 수 있는 것이 아무것도
     * 없었습니다. 영수증이 그 자리를 채웁니다: <b>종이가 곧 교환권</b>
     * 입니다.
     *
     * <p>OMS가 404 를 주면 그대로 404 입니다. "값이 틀렸다"와 "그런
     * 주문이 없다"를 나누지 않는 것은 저쪽의 결정이고, 여기서 다시
     * 갈라 놓으면 그 결정이 무의미해집니다.
     */
    /**
     * 회원번호를 하나 받습니다 (업무 정의서 §4.1).
     *
     * <p>설계서의 "사용자정보 등록(숫자)"입니다. <b>가입이 아닙니다</b> —
     * 아무것도 묻지 않고 번호만 내줍니다. 전화번호를 안 받는 것은
     * 개인정보이기 때문이고, 가입을 안 만드는 것은 필요한 것에 비해
     * 크기 때문입니다.
     */
    @PostMapping("/members")
    @Operation(summary = "회원번호 발급",
            description = "아무것도 묻지 않고 번호 하나를 냅니다. "
                    + "손님은 적어 두었다가 다음에 칩니다.")
    public ResponseEntity<?> issueMember() {
        var upstream = appServer.issueMember();
        return ResponseEntity.status(upstream.getStatusCode())
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .body(upstream.getBody());
    }

    @GetMapping("/members/{memberNo}")
    @Operation(summary = "회원번호 확인", description = "우리가 준 번호인지 봅니다.")
    public ResponseEntity<?> verifyMember(@PathVariable String memberNo) {
        var upstream = appServer.verifyMember(memberNo);
        return ResponseEntity.status(upstream.getStatusCode())
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .body(upstream.getBody());
    }

    @GetMapping("/orders/claim/{token}")
    @Operation(summary = "영수증 QR로 주문 상태 조회",
            description = "인증이 없는 경로입니다. 값을 가진 사람이 곧 볼 자격이 있는 "
                    + "사람이고, 그래서 돌려주는 것은 손님이 볼 것만입니다 — "
                    + "수령번호 · 상태 · 품목 · 금액.")
    public ResponseEntity<?> claim(@PathVariable String token) {
        try {
            var upstream = orders.claim(token);
            return ResponseEntity.status(upstream.statusCode())
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .body(upstream.body());
        } catch (Exception unreachable) {
            // 못 물어본 것과 없는 것은 다릅니다. 502 로 말해야 화면이
            // "주문이 없습니다" 대신 "지금 확인할 수 없습니다" 라고
            // 쓸 수 있습니다.
            return ResponseEntity.status(org.springframework.http.HttpStatus.BAD_GATEWAY)
                    .body(java.util.Map.of("error", "주문 서비스에 연결할 수 없습니다"));
        }
    }
}
