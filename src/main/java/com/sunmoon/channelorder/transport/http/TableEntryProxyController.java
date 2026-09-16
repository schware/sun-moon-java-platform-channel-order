package com.sunmoon.channelorder.transport.http;

import com.sunmoon.channelorder.infrastructure.appserver.AppServerClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 테이블 QR 게이트로 가는 통로. 판단은 전부 APP-SERVER가 합니다 — 여기는
 * 손님 화면이 자기를 내려준 곳하고만 이야기하게 해주는 역할입니다.
 */
@RestController
@RequestMapping("/api/t")
@Tag(name = "Table entry", description = "테이블 QR 진입 (APP-SERVER로 중계)")
public class TableEntryProxyController {

    private final AppServerClient appServer;

    public TableEntryProxyController(AppServerClient appServer) {
        this.appServer = appServer;
    }

    @GetMapping(value = "/{qrCode}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "QR 진입",
            description = "APP-SERVER가 코드·자리·매장·영업 여부를 확인합니다. "
                    + "상태 코드가 이유입니다 — 404 없는 코드, 409 중지/마감, 503 확인 실패.")
    public ResponseEntity<String> enter(@PathVariable String qrCode) {
        return appServer.enterTable(qrCode);
    }
}
