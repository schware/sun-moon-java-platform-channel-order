package com.sunmoon.channelorder.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;

/**
 * 손님 앱(Capacitor)이 이 API 를 부를 수 있게 (umbrella docs/design/customer-app.md §1.2).
 *
 * <p>앱의 화면은 {@code https://localhost}(Android) / {@code capacitor://localhost}(iOS)
 * 에서 돕니다 — 이 서버 입장에서 다른 출처라 CORS 가 없으면 브라우저 엔진이
 * 응답을 버립니다. 같은 서버에서 내려주는 웹 화면(QR)은 같은 출처라 상관없습니다.
 *
 * <p><b>{@code *} 로 열지 않습니다.</b> 그러면 아무 웹사이트나 손님 대신 주문을
 * 넣을 수 있습니다. 허용 출처는 env {@code APP_CORS_ORIGINS}(쉼표로), 적힌 것만.
 * 값에 {@code *} 가 섞여 있으면 그 값은 버립니다 — 오타 하나로 전부 열리지 않게.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final String[] origins;

    public CorsConfig(@Value("${app.cors-origins}") String origins) {
        this.origins = Arrays.stream(origins.split(","))
                .map(String::trim)
                .filter(o -> !o.isEmpty() && !o.contains("*"))
                .toArray(String[]::new);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (origins.length == 0) {
            return;
        }
        registry.addMapping("/api/**")
                .allowedOrigins(origins)
                .allowedMethods("GET", "POST")
                .allowedHeaders("Content-Type", "Authorization")
                .allowCredentials(false)
                .maxAge(600);
    }
}
