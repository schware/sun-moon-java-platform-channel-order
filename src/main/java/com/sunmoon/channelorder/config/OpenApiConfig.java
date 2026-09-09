package com.sunmoon.channelorder.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI channelOrderOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("sun-moon-java-platform-channel-order API")
                        .description("주문 채널 — 매장 선택 → 메뉴 선택 → 주문 생성.")
                        .version("0.1.0"))
                .servers(List.of(new Server().url("/channel-order")));
    }
}
