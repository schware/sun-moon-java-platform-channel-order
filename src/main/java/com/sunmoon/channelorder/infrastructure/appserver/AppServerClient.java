package com.sunmoon.channelorder.infrastructure.appserver;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * APP-SERVER로 가는 창구. 지금은 테이블 QR 게이트 하나뿐입니다.
 *
 * <p><b>브라우저가 APP-SERVER를 직접 부르지 않는 이유.</b> APP-SERVER는
 * LAN 전용이고, 공개한다 해도 origin이 달라져 CORS가 필요해집니다. 손님
 * 화면은 지금도 자기를 내려준 곳(이 서비스)하고만 이야기하고, 그 성질을
 * 깨지 않는 편이 낫습니다 — 단말이 Order를 직접 부르지 않고 Device
 * Server를 거치는 것과 같은 모양입니다.
 *
 * <p>이 프록시는 과도기입니다. 손님 쪽 일이 APP-SERVER로 옮겨가는 중이고
 * (umbrella {@code docs/adr/0007}), 화면까지 그쪽으로 가면 이 클래스는
 * 사라집니다.
 */
@Component
public class AppServerClient {

    private final RestClient client;

    public AppServerClient(@Value("${order-channel.app-server-url}") String baseUrl) {
        this.client = RestClient.builder().baseUrl(baseUrl).build();
    }

    /** 게이트가 통과시킨 자리. 주문에 도착지를 붙일 때 쓰는 최소한만. */
    public record TableEntry(String storeId, Integer floor, String tableNo) {
    }

    /**
     * 주문을 넣기 직전에 코드를 다시 풉니다.
     *
     * <p>진입할 때 한 번 봤는데 또 보는 이유가 둘 있습니다. 하나는 손님이
     * 메뉴를 고르는 동안 매장이 마감했을 수 있다는 것, 다른 하나는 브라우저가
     * 보낸 값을 믿지 않기 위해서입니다 — 도착지는 서버가 붙입니다.
     *
     * <p>통과하지 못하면 {@code empty} 입니다. 왜 막혔는지는 여기서 다루지
     * 않습니다 — 주문이 거절된 이유는 Order가 돌려주는 것으로 충분합니다.
     */
    public java.util.Optional<TableEntry> resolveTable(String qrCode) {
        ResponseEntity<String> response = enterTable(qrCode);
        if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
            return java.util.Optional.empty();
        }
        try {
            com.fasterxml.jackson.databind.JsonNode node =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(response.getBody());
            return java.util.Optional.of(new TableEntry(
                    node.path("storeId").asText(null),
                    node.hasNonNull("floor") ? node.get("floor").asInt() : null,
                    node.path("tableNo").asText(null)));
        } catch (Exception e) {
            return java.util.Optional.empty();
        }
    }

    /**
     * 게이트의 응답을 <b>상태 코드까지 그대로</b> 넘깁니다. 404/409/503이
     * 각각 다른 뜻이고 화면이 그걸로 갈라지는데, 여기서 200으로 뭉개면
     * 그 구분이 사라집니다.
     */
    public ResponseEntity<String> enterTable(String qrCode) {
        try {
            return client.get()
                    .uri(uri -> uri.path("/t/{code}").build(qrCode))
                    // 4xx/5xx에서 예외를 던지지 않게 — 그 상태 코드 자체가
                    // 화면에 전달할 내용입니다.
                    .exchange((request, response) -> ResponseEntity
                            .status(response.getStatusCode())
                            .body(new String(response.getBody().readAllBytes(),
                                    java.nio.charset.StandardCharsets.UTF_8)));
        } catch (RestClientException | java.io.UncheckedIOException e) {
            // APP-SERVER 자체에 닿지 못한 것. 매장이 마감한 것과 다르므로
            // 503으로, 게이트가 쓰는 것과 같은 모양의 본문으로 답합니다.
            return ResponseEntity.status(503)
                    .body("{\"reason\":\"STORE_UNREACHABLE\",\"message\":\"잠시 후 다시 시도해주세요.\"}");
        }
    }
}
