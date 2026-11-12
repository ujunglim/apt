package io.github.ujunglim.apt.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * 도메인 예외. ErrorResponseException 을 상속하면 ApiExceptionHandler(ResponseEntityExceptionHandler)가
 * RFC 9457 Problem Details 형식으로 바로 응답한다.
 */
public final class ApiExceptions {

    private ApiExceptions() {
    }

    public static class NotFound extends ErrorResponseException {
        public NotFound(String detail) {
            super(HttpStatus.NOT_FOUND, ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, detail), null);
        }
    }

    public static class BadRequest extends ErrorResponseException {
        public BadRequest(String detail) {
            super(HttpStatus.BAD_REQUEST, ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail), null);
        }
    }
}
