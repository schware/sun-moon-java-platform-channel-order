package com.sunmoon.channelorder.transport.http;

import com.sunmoon.channelorder.domain.Catalog;
import com.sunmoon.channelorder.infrastructure.appserver.AppServerClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 손님 앱 출처만 열리고, 모르는 출처와 '*' 는 안 열립니다 (customer-app.md §1.2). */
@WebMvcTest(value = CatalogController.class,
        properties = "app.cors-origins=https://localhost, capacitor://localhost ,*")
@org.springframework.context.annotation.Import(Catalog.class)
class CorsTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AppServerClient appServer;

    @Test
    void theAppOriginIsAllowed() throws Exception {
        mockMvc.perform(get("/api/stores").header("Origin", "capacitor://localhost"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "capacitor://localhost"));
    }

    @Test
    void preflightForAnOrderPostIsAnswered() throws Exception {
        mockMvc.perform(options("/api/orders")
                        .header("Origin", "https://localhost")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "Content-Type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://localhost"));
    }

    @Test
    void anyOtherSiteIsRefused_evenWithAStarInTheList() throws Exception {
        mockMvc.perform(get("/api/stores").header("Origin", "https://evil.example"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void sameOriginPagesAreUnaffected() throws Exception {
        mockMvc.perform(get("/api/stores"))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}
