package com.sunmoon.channelorder.transport.http;

import com.sunmoon.channelorder.infrastructure.appserver.AppServerClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 이 controller 가 하는 일은 <b>넘기는 것뿐</b>입니다 (2026-09-17부터).
 *
 * <p>그래서 검사할 것도 하나입니다: APP-SERVER의 답이 <b>상태 코드까지
 * 그대로</b> 나오는가. 404/409/503 이 각각 다른 뜻이고 화면이 그걸로
 * 갈라지는데, 여기서 뭉개면 그 구분이 사라집니다.
 *
 * <p>매장·메뉴·결품 검증은 더 이상 여기 없습니다 — 원장을 가진 쪽
 * (APP-SERVER)이 합니다. 그 규칙을 검사하는 곳도 그쪽입니다.
 */
@WebMvcTest(OrderChannelController.class)
class OrderChannelControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AppServerClient appServer;

    private static final String REQUEST = """
            {"storeId":"store-01","menuId":"menu-01","requestId":"req-1"}
            """;

    @Test
    void passesTheAcceptedOrderThrough() throws Exception {
        when(appServer.placeOrder(any())).thenReturn(
                ResponseEntity.status(201).body("{\"id\":1,\"orderNo\":\"store-01-20260917-0001\"}"));

        mockMvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isCreated())
                .andExpect(content().json("{\"orderNo\":\"store-01-20260917-0001\"}"));
    }

    /** 결품이나 마감은 409 입니다. 손님이 기다리면 되는 경우라 5xx 가 아닙니다. */
    @Test
    void passesARefusalThroughWithItsOwnStatus() throws Exception {
        when(appServer.placeOrder(any())).thenReturn(
                ResponseEntity.status(409).body("{\"reason\":\"NOT_ORDERABLE\",\"message\":\"x\"}"));

        mockMvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isConflict())
                .andExpect(content().json("{\"reason\":\"NOT_ORDERABLE\"}"));
    }

    /**
     * APP-SERVER에 닿지 못한 것은 503 입니다 — 거절과 갈라야 합니다.
     * 거절은 답을 받은 것이고 이건 못 받은 것이라, 손님은 다시 눌러보면
     * 될 수도 있습니다. AppServerClient 가 그 판단을 이미 내려서
     * 503 을 만들어 줍니다.
     */
    @Test
    void passesAnUnreachableAppServerThroughAs503() throws Exception {
        when(appServer.placeOrder(any())).thenReturn(
                ResponseEntity.status(503).body("{\"reason\":\"OMS_UNREACHABLE\",\"message\":\"x\"}"));

        mockMvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isServiceUnavailable());
    }

    /** 빠진 값은 여기서 걸립니다 — @Valid 는 넘기기 전에 봅니다. */
    @Test
    void aRequestMissingTheStoreNeverReachesAppServer() throws Exception {
        mockMvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"menuId\":\"menu-01\"}"))
                .andExpect(status().isBadRequest());
    }
}
