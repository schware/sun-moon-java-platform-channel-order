package com.sunmoon.channelorder.transport.http;

import com.sunmoon.channelorder.domain.Catalog;
import com.sunmoon.channelorder.infrastructure.appserver.AppServerClient;
import com.sunmoon.channelorder.infrastructure.order.OrderClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.net.http.HttpResponse;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(OrderChannelController.class)
@Import(Catalog.class)
class OrderChannelControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private OrderClient orderClient;

    /**
     * 결품 확인이 여기를 지나갑니다. 기본 mock 이 빈 지도를 돌려주므로
     * "오늘의 사정 없음"이 되고, 아래 테스트들은 결품과 무관하게
     * 원래 보던 것을 그대로 봅니다.
     */
    @MockBean
    private AppServerClient appServer;

    @Test
    void placesAnOrderForAKnownStoreAndMenu() throws Exception {
        @SuppressWarnings("unchecked")
        HttpResponse<String> upstream = mock(HttpResponse.class);
        when(upstream.statusCode()).thenReturn(201);
        when(upstream.body()).thenReturn("{\"id\":1,\"status\":\"PLACED\"}");
        when(orderClient.placeOrder(anyString(), anyString(), anyString(), any(), any(), any(), any(), any()))
                .thenReturn(upstream);

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"storeId\":\"store-01\",\"menuId\":\"menu-01\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void anUnknownStoreIsRejectedBeforeCallingOrder() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"storeId\":\"store-99\",\"menuId\":\"menu-01\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anUnknownMenuIsRejectedBeforeCallingOrder() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"storeId\":\"store-01\",\"menuId\":\"menu-99\"}"))
                .andExpect(status().isBadRequest());
    }

    /**
     * 결품인 메뉴는 409입니다 — 잘못된 요청(400)이 아닙니다. 요청은
     * 멀쩡했고, 세상의 상태가 거절한 것입니다.
     */
    @Test
    void aSoldOutMenuIsRefusedWithConflict() throws Exception {
        when(appServer.menuStatuses("store-01")).thenReturn(
                java.util.Map.of("menu-01", new AppServerClient.MenuStatus(true, null)));

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"storeId\":\"store-01\",\"menuId\":\"menu-01\"}"))
                .andExpect(status().isConflict());
    }

    /**
     * APP-SERVER가 안 보이면 주문은 통과합니다. 확인할 수 없다고 전부
     * 막으면 결품 표시 하나 때문에 장사가 멈추고, 그건 회복이 안 됩니다.
     */
    @Test
    void anUnreachableAppServerDoesNotBlockOrdering() throws Exception {
        @SuppressWarnings("unchecked")
        HttpResponse<String> upstream = mock(HttpResponse.class);
        when(upstream.statusCode()).thenReturn(201);
        when(upstream.body()).thenReturn("{\"id\":1,\"status\":\"PLACED\"}");
        when(orderClient.placeOrder(anyString(), anyString(), anyString(), any(), any(), any(), any(), any()))
                .thenReturn(upstream);
        // 못 읽으면 빈 지도 — AppServerClient 가 예외 대신 이걸 돌려줍니다.
        when(appServer.menuStatuses(anyString())).thenReturn(java.util.Map.of());

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"storeId\":\"store-01\",\"menuId\":\"menu-01\"}"))
                .andExpect(status().isCreated());
    }

    /** Order being down is a 502, not a 500 — the fault is upstream. */
    @Test
    void anUnreachableOrderServiceIsReportedAs502() throws Exception {
        when(orderClient.placeOrder(anyString(), anyString(), anyString(), any(), any(), any(), any(), any()))
                .thenThrow(new java.net.ConnectException("refused"));

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"storeId\":\"store-01\",\"menuId\":\"menu-01\"}"))
                .andExpect(status().isBadGateway());
    }
}
