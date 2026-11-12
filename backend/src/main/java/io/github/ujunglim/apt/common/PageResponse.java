package io.github.ujunglim.apt.common;

import java.util.List;
import java.util.function.Function;
import org.springframework.data.domain.Page;

/**
 * 페이지 응답. Spring Data 의 Page 를 그대로 직렬화하면 내부 구조가 노출되고 버전마다 형태가 바뀔 수 있어
 * 필요한 필드만 고정해서 내보낸다. page 는 0부터 시작한다.
 */
public record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

    public static <E, T> PageResponse<T> of(Page<E> page, Function<E, T> mapper) {
        return new PageResponse<>(
                page.getContent().stream().map(mapper).toList(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }
}
