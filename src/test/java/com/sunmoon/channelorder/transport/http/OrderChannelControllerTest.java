package com.sunmoon.channelorder.transport.http;

import com.sunmoon.channelorder.domain.Catalog;
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

    @Test
    void placesAnOrderForAKnownStoreAndMenu() throws Exception {
        @SuppressWarnings("unchecked")
        HttpResponse<String> upstream = mock(HttpResponse.class);
        when(upstream.statusCode()).thenReturn(201);
        when(upstream.body()).thenReturn("{\"id\":1,\"status\":\"PLACED\"}");
        when(orderClient.placeOrder(anyString(), anyString(), anyString(), any())).thenReturn(upstream);

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

    /** Order being down is a 502, not a 500 — the fault is upstream. */
    @Test
    void anUnreachableOrderServiceIsReportedAs502() throws Exception {
        when(orderClient.placeOrder(anyString(), anyString(), anyString(), any()))
                .thenThrow(new java.net.ConnectException("refused"));

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"storeId\":\"store-01\",\"menuId\":\"menu-01\"}"))
                .andExpect(status().isBadGateway());
    }
}
