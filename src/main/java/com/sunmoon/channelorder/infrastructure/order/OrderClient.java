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
            String storeId, String customerId, String menuName, BigDecimal amount, String kdsDeviceId)
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
        String body = objectMapper.writeValueAsString(fields);

        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/orders"))
                .header("Content-Type", "application/json; charset=UTF-8")
                .timeout(Duration.ofSeconds(5))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        return http.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
