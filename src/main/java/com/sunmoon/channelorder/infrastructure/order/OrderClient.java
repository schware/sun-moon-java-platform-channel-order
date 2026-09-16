package com.sunmoon.channelorder.infrastructure.order;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;

/**
 * Places a real order with the Order service.
 *
 * <p>This channel has no state of its own to keep in sync — it forwards
 * one HTTP call and passes the answer straight back, including a 4xx if
 * Order rejects the request. There is nothing to reconcile because
 * nothing is written here first.
 */
@Component
public class OrderClient {

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String baseUrl;

    public OrderClient(@Value("${order-channel.order-service-url}") String baseUrl) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    public HttpResponse<String> placeOrder(
            String storeId, String customerId, String menuName, BigDecimal amount, String kdsDeviceId,
            Integer floor, String tableNo, String qrCode)
            throws Exception {

        var fields = new HashMap<String, Object>();
        fields.put("storeId", storeId);
        fields.put("customerId", customerId);
        fields.put("menuName", menuName);
        fields.put("amount", amount);
        // Map.of rejects null values, and "no station assigned" is a real,
        // valid case here — not an oversight to reject at this boundary.
        if (kdsDeviceId != null) {
            fields.put("kdsDeviceId", kdsDeviceId);
        }
        // 도착지. 테이블 QR로 들어온 주문에만 붙습니다 — 없으면 테이블이
        // 아니라는 뜻이고, Order는 그것을 그대로 받아들입니다.
        if (tableNo != null) {
            fields.put("floor", floor);
            fields.put("tableNo", tableNo);
        }
        // QR 번호. 매출 키의 일부가 아니라 영수증에 함께 찍히는 추가
        // 값입니다 (umbrella docs/adr/0009) — 자리 번호를 바꿔도 이
        // 값은 그대로라, 나중에 "어느 스티커로 들어온 주문인가"를
        // 되짚을 수 있습니다.
        if (qrCode != null && !qrCode.isBlank()) {
            fields.put("qrCode", qrCode);
        }
        String body = objectMapper.writeValueAsString(fields);

        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/orders"))
                .header("Content-Type", "application/json; charset=UTF-8")
                .timeout(Duration.ofSeconds(5))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        return http.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
