package io.github.ujunglim.apt.region;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import io.github.ujunglim.apt.common.ApiExceptions;
import java.time.YearMonth;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 서비스 규칙 단위 테스트 (스프링·DB 없음). */
class RegionServiceTest {

    SggPriceMonthlyRepository priceRepository = mock(SggPriceMonthlyRepository.class);
    SggRankingRepository rankingRepository = mock(SggRankingRepository.class);
    RegionService service = new RegionService(priceRepository, rankingRepository);

    @Test
    void getPrices_fromAfterTo_isBadRequest() {
        assertThatThrownBy(() -> service.getPrices("11215", YearMonth.of(2026, 10), YearMonth.of(2026, 1), 0, 12))
                .isInstanceOf(ApiExceptions.BadRequest.class);
        verifyNoInteractions(priceRepository);
    }

    @Test
    void getPrices_unknownRegion_isNotFound() {
        given(priceRepository.existsBySggCd("99999")).willReturn(false);

        assertThatThrownBy(() -> service.getPrices("99999", null, null, 0, 12))
                .isInstanceOf(ApiExceptions.NotFound.class);
    }

    @Test
    void getTrend_returnsOldestFirst() {
        var oct = month("2026-10");
        var sep = month("2026-09");
        given(priceRepository.findBySggCdOrderByDealMonthDesc(eq("11215"), any())).willReturn(List.of(oct, sep));

        var trend = service.getTrend("11215", 2);

        assertThat(trend.sggNm()).isEqualTo("광진구");
        assertThat(trend.points()).extracting(RegionDtos.TrendPoint::ym).containsExactly("2026-09", "2026-10");
    }

    @Test
    void getTrend_unknownRegion_isNotFound() {
        given(priceRepository.findBySggCdOrderByDealMonthDesc(eq("99999"), any())).willReturn(List.of());

        assertThatThrownBy(() -> service.getTrend("99999", 12)).isInstanceOf(ApiExceptions.NotFound.class);
    }

    private static SggPriceMonthly month(String ym) {
        SggPriceMonthly m = mock(SggPriceMonthly.class);
        given(m.getYm()).willReturn(ym);
        given(m.getSggNm()).willReturn("광진구");
        given(m.getTradeCnt()).willReturn(10);
        return m;
    }
}
