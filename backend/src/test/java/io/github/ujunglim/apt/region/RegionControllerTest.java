package io.github.ujunglim.apt.region;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.ujunglim.apt.common.ApiExceptions;
import io.github.ujunglim.apt.common.PageResponse;
import io.github.ujunglim.apt.region.RegionDtos.MonthlyPrice;
import io.github.ujunglim.apt.region.RegionDtos.Ranking;
import io.github.ujunglim.apt.region.RegionDtos.RankingItem;
import io.github.ujunglim.apt.region.RegionDtos.RankingSort;
import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** 웹 계층만 띄운다 (DB 없음). 요청 파라미터 검증과 오류 응답 형식을 확인한다. */
@WebMvcTest(RegionController.class)
class RegionControllerTest {

    @Autowired
    MockMvc mvc;

    @MockitoBean
    RegionService regionService;

    @Test
    void prices_returnsPage() throws Exception {
        var row = new MonthlyPrice("2026-10", 42, 155717, 158500, new BigDecimal("1650.3"),
                new BigDecimal("3.01"), 146539, false);
        given(regionService.getPrices(eq("11215"), eq(YearMonth.of(2026, 1)), eq(YearMonth.of(2026, 10)), eq(0), eq(12)))
                .willReturn(new PageResponse<>(List.of(row), 0, 12, 1, 1));

        mvc.perform(get("/regions/11215/prices").param("from", "2026-01").param("to", "2026-10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].ym").value("2026-10"))
                .andExpect(jsonPath("$.content[0].avgPriceMan").value(155717))
                .andExpect(jsonPath("$.content[0].currentMonth").value(false))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void prices_invalidCode_returns400() throws Exception {
        mvc.perform(get("/regions/abc/prices"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        verifyNoInteractions(regionService);
    }

    @Test
    void prices_invalidMonth_returns400() throws Exception {
        mvc.perform(get("/regions/11215/prices").param("from", "2026-13"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
    }

    @Test
    void prices_sizeTooLarge_returns400() throws Exception {
        mvc.perform(get("/regions/11215/prices").param("size", "1000"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void prices_unknownRegion_returns404Problem() throws Exception {
        given(regionService.getPrices(eq("99999"), any(), any(), anyInt(), anyInt()))
                .willThrow(new ApiExceptions.NotFound("시군구 코드 99999의 데이터가 없습니다."));

        mvc.perform(get("/regions/99999/prices"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.detail").value("시군구 코드 99999의 데이터가 없습니다."));
    }

    @Test
    void trend_monthsOutOfRange_returns400() throws Exception {
        mvc.perform(get("/regions/11215/trend").param("months", "0"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ranking_defaultSortIsAvgPrice() throws Exception {
        var item = new RankingItem(1, "11215", "광진구", 42, 155717, 158500, null, null);
        given(regionService.getRanking(RankingSort.AVG_PRICE))
                .willReturn(new Ranking("2026-10", RankingSort.AVG_PRICE, List.of(item)));

        mvc.perform(get("/regions/ranking"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ym").value("2026-10"))
                .andExpect(jsonPath("$.sort").value("AVG_PRICE"))
                .andExpect(jsonPath("$.items[0].sggNm").value("광진구"));
    }

    @Test
    void ranking_invalidSort_returns400() throws Exception {
        mvc.perform(get("/regions/ranking").param("sort", "PRICE"))
                .andExpect(status().isBadRequest());
    }
}
