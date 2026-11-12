package io.github.ujunglim.apt.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * 모든 오류를 Problem Details(JSON) 한 가지 형식으로 응답한다.
 * - 부모 클래스가 처리: 타입 변환 실패(잘못된 날짜·enum) 400, 파라미터 검증 실패 400, 없는 경로 404, ErrorResponseException
 * - 여기서 처리: 예상하지 못한 예외 500 (내부 메시지·스택은 응답에 넣지 않고 로그에만 남긴다)
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "서버 내부 오류가 발생했습니다.");
    }
}
