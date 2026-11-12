package io.github.ujunglim.apt.region;

import io.github.ujunglim.apt.common.PageResponse;
import io.github.ujunglim.apt.region.RegionDtos.MonthlyPrice;
import io.github.ujunglim.apt.region.RegionDtos.Ranking;
import io.github.ujunglim.apt.region.RegionDtos.RankingSort;
import io.github.ujunglim.apt.region.RegionDtos.Trend;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import java.time.YearMonth;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 파라미터 제약(@Pattern, @Min 등)은 Spring 의 내장 메서드 검증으로 처리된다.
 * 위반 시 HandlerMethodValidationException → 400 Problem Details.
 * (@Validated 를 붙이면 다른 예외 타입으로 바뀌므로 일부러 붙이지 않는다.)
 */
@Tag(name = "Regions", description = "시군구 단위 아파트 매매 실거래가 (가격 단위: 만원)")
@RestController
@RequestMapping("/regions")
public class RegionController {

    private static final String SGG_CD = "\\d{5}";

    private final RegionService regionService;

    public RegionController(RegionService regionService) {
        this.regionService = regionService;
    }

    @Operation(summary = "시군구 월별 가격", description = "기간(from~to, 양 끝 포함)의 월별 집계를 오래된 달부터 페이지로 반환한다.")
    @GetMapping("/{code}/prices")
    public PageResponse<MonthlyPrice> prices(
            @Parameter(description = "시군구 코드 5자리", example = "11215")
            @PathVariable @Pattern(regexp = SGG_CD) String code,
            @Parameter(description = "시작 월 (YYYY-MM), 생략 시 처음부터", example = "2026-01")
            @RequestParam(required = false) YearMonth from,
            @Parameter(description = "끝 월 (YYYY-MM), 생략 시 끝까지", example = "2026-10")
            @RequestParam(required = false) YearMonth to,
            @Parameter(description = "페이지 번호 (0부터)")
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @Parameter(description = "페이지 크기 (1~100)")
            @RequestParam(defaultValue = "12") @Min(1) @Max(100) int size) {
        return regionService.getPrices(code, from, to, page, size);
    }

    @Operation(summary = "시군구 가격 추이", description = "최근 N개월의 평균가·3개월 이동평균·중위가를 차트용으로 반환한다.")
    @GetMapping("/{code}/trend")
    public Trend trend(
            @Parameter(description = "시군구 코드 5자리", example = "11215")
            @PathVariable @Pattern(regexp = SGG_CD) String code,
            @Parameter(description = "최근 몇 개월 (1~60)")
            @RequestParam(defaultValue = "12") @Min(1) @Max(60) int months) {
        return regionService.getTrend(code, months);
    }

    @Operation(summary = "시군구 순위", description = "진행 중인 달을 제외한 가장 최근 완결 월의 시군구 순위.")
    @GetMapping("/ranking")
    public Ranking ranking(
            @Parameter(description = "순위 기준")
            @RequestParam(defaultValue = "AVG_PRICE") RankingSort sort) {
        return regionService.getRanking(sort);
    }
}
