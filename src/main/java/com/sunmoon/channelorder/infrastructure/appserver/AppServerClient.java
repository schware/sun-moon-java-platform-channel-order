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

    /** 오늘 이 매장에서 메뉴 하나가 처한 사정 — 없는지, 얼마나 기다리는지. */
    public record MenuStatus(boolean soldOut, Integer estimatedMinutes) {
    }

    /**
     * 오늘의 메뉴판을 메뉴코드로 찾아볼 수 있게 받아옵니다.
     *
     * <p>이 채널의 카탈로그는 아직 코드에 박혀 있고(=매장·메뉴 목록),
     * BO 마스터에서 오는 것은 <b>그 위에 덮는 사정</b>뿐입니다. 언젠가
     * 목록 자체가 APP-SERVER에서 오면 이 메서드가 그 자리를 이어받습니다.
     *
     * <p>못 읽으면 <b>빈 지도</b>입니다 — 예외가 아닙니다. 결품 표시는
     * 메뉴판을 꾸미는 값이고, 그것 때문에 메뉴가 통째로 안 나오면 손해가
     * 더 큽니다. 표시가 빠진 채로 주문이 들어가면 POS가 거절할 수
     * 있지만, 메뉴판이 안 나오면 아무도 아무것도 못 삽니다.
     */
    public java.util.Map<String, MenuStatus> menuStatuses(String storeId) {
        try {
            String body = client.get()
                    .uri(uri -> uri.path("/menus").queryParam("storeId", storeId).build())
                    .retrieve()
                    .body(String.class);
            if (body == null) {
                return java.util.Map.of();
            }
            com.fasterxml.jackson.databind.JsonNode board =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
            java.util.Map<String, MenuStatus> byCode = new java.util.HashMap<>();
            for (com.fasterxml.jackson.databind.JsonNode item : board.path("menus")) {
                byCode.put(item.path("menuCode").asText(), new MenuStatus(
                        item.path("soldOut").asBoolean(false),
                        item.hasNonNull("estimatedMinutes") ? item.get("estimatedMinutes").asInt() : null));
            }
            return byCode;
        } catch (Exception e) {
            return java.util.Map.of();
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
