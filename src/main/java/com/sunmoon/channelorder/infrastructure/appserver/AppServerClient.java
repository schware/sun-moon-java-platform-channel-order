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
