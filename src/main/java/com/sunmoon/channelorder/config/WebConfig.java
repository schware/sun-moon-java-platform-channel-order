package com.sunmoon.channelorder.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 테이블 QR 주소({@code /channel-order/t/{code}})를 화면으로 넘겨줍니다.
 *
 * <p>이 앱에는 client router가 없습니다 — 매장과 메뉴 두 화면은 React
 * state로만 오갑니다. 그런데 QR은 <b>주소</b>여야 합니다: 종이에 인쇄돼서
 * 휴대폰 카메라가 여는 것이니까요. 그래서 여기 한 줄이 필요합니다.
 *
 * <p>router를 들이지는 않았습니다. 화면은 시작할 때 주소에서 코드를 한 번
 * 읽고 그 뒤로는 예전처럼 state로 움직입니다 — 진입 지점이 하나 생긴
 * 것이지 경로가 생긴 것은 아닙니다.
 *
 * <p>BO에서 이 한 줄을 빠뜨려 {@code /menus}와 {@code /stores}가 닷새 동안
 * 새로고침에서만 404였습니다. 눌러서 들어가면 멀쩡해서 아무도 몰랐습니다.
 * 여기는 <b>새로고침이 기본 동작</b>이라(QR을 찍을 때마다 새로 여는
 * 것입니다) 빠지면 바로 드러나긴 합니다.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/t/{qrCode}").setViewName("forward:/index.html");
    }
}
