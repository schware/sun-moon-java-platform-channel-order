package com.sunmoon.channelorder.transport.http;

import com.sunmoon.channelorder.domain.Catalog;
import org.junit.jupiter.api.Test;
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
                .andExpect(jsonPath("$[0].price").value(6000));
    }

    @Test
    void anUnknownStoreIs404NotAnEmptyMenu() throws Exception {
        mockMvc.perform(get("/api/stores/store-99/menus"))
                .andExpect(status().isNotFound());
    }
}
