package com.sunmoon.channelorder.transport.http;

import com.sunmoon.channelorder.domain.Catalog;
import com.sunmoon.channelorder.infrastructure.appserver.AppServerClient;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Catalog is real (not mocked) — there is nothing to fake, it's fixed data. */
@WebMvcTest(CatalogController.class)
@org.springframework.context.annotation.Import(Catalog.class)
class CatalogControllerTest {

    @Autowired
    private MockMvc mockMvc;

    /**
     * 오늘의 사정(결품·예상시간)만 APP-SERVER에서 옵니다. 기본 mock 이
     * 빈 지도를 돌려주므로 카탈로그 그대로가 나오고, 이 테스트들은
     * 목록 자체가 맞는지만 봅니다.
     */
    @MockBean
    private AppServerClient appServer;

    @Test
    void listsTenStores() throws Exception {
        mockMvc.perform(get("/api/stores"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(10))
                .andExpect(jsonPath("$[0].id").value("store-01"))
                .andExpect(jsonPath("$[0].name").value("1매장"))
                .andExpect(jsonPath("$[9].name").value("10매장"));
    }

    @Test
    void listsTenMenuItemsForAKnownStore() throws Exception {
        mockMvc.perform(get("/api/stores/store-03/menus"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(10))
                .andExpect(jsonPath("$[0].name").value("1메뉴"))
                .andExpect(jsonPath("$[0].price").value(6000))
                .andExpect(jsonPath("$[0].soldOut").value(false));
    }

    /**
     * 결품인 메뉴는 목록에서 <b>빠지지 않습니다</b>. 빼면 손님은 그 메뉴가
     * 원래 없는 줄 알고, 매장에는 "왜 안 파냐"가 아니라 "메뉴가 왜
     * 없어졌냐"는 전화가 옵니다.
     */
    @Test
    void aSoldOutMenuStaysInTheListAndIsMarked() throws Exception {
        org.mockito.Mockito.when(appServer.menuStatuses("store-03")).thenReturn(
                java.util.Map.of("menu-02", new AppServerClient.MenuStatus(true, null)));

        mockMvc.perform(get("/api/stores/store-03/menus"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(10))
                .andExpect(jsonPath("$[1].id").value("menu-02"))
                .andExpect(jsonPath("$[1].soldOut").value(true))
                // 기다릴 일이 없는 메뉴에 예상시간을 붙이면 "곧 나온다"로 읽힙니다.
                .andExpect(jsonPath("$[1].estimatedMinutes").doesNotExist());
    }

    @Test
    void anEstimateIsCarriedThroughWhenTheMenuIsAvailable() throws Exception {
        org.mockito.Mockito.when(appServer.menuStatuses("store-03")).thenReturn(
                java.util.Map.of("menu-01", new AppServerClient.MenuStatus(false, 14)));

        mockMvc.perform(get("/api/stores/store-03/menus"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].estimatedMinutes").value(14));
    }

    @Test
    void anUnknownStoreIs404NotAnEmptyMenu() throws Exception {
        mockMvc.perform(get("/api/stores/store-99/menus"))
                .andExpect(status().isNotFound());
    }
}
