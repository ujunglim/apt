package io.github.ujunglim.apt.region;

import io.github.ujunglim.apt.common.ApiExceptions;
import io.github.ujunglim.apt.common.PageResponse;
import io.github.ujunglim.apt.region.RegionDtos.MonthlyPrice;
import io.github.ujunglim.apt.region.RegionDtos.Ranking;
import io.github.ujunglim.apt.region.RegionDtos.RankingItem;
import io.github.ujunglim.apt.region.RegionDtos.RankingSort;
import io.github.ujunglim.apt.region.RegionDtos.Trend;
import io.github.ujunglim.apt.region.RegionDtos.TrendPoint;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class RegionService {

    // from/to 를 생략했을 때 쓰는 열린 범위
    private static final LocalDate MIN_MONTH = LocalDate.of(1900, 1, 1);
    private static final LocalDate MAX_MONTH = LocalDate.of(9999, 12, 1);

    private final SggPriceMonthlyRepository priceRepository;
    private final SggRankingRepository rankingRepository;

    public RegionService(SggPriceMonthlyRepository priceRepository, SggRankingRepository rankingRepository) {
        this.priceRepository = priceRepository;
        this.rankingRepository = rankingRepository;
    }

    /** 시군구 월별 가격. 기간은 양 끝 포함, 오래된 달부터. */
    public PageResponse<MonthlyPrice> getPrices(String sggCd, YearMonth from, YearMonth to, int page, int size) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ApiExceptions.BadRequest("from(" + from + ")은 to(" + to + ")보다 늦을 수 없습니다.");
        }
        ensureRegionExists(sggCd);
        LocalDate fromDate = from == null ? MIN_MONTH : from.atDay(1);
        LocalDate toDate = to == null ? MAX_MONTH : to.atDay(1);
        var pageable = PageRequest.of(page, size, Sort.by("dealMonth").ascending());
        return PageResponse.of(
                priceRepository.findBySggCdAndDealMonthBetween(sggCd, fromDate, toDate, pageable),
                MonthlyPrice::from);
    }

    /** 최근 N개월 추이 (차트용). 데이터가 N개월보다 적으면 있는 만큼만. */
    public Trend getTrend(String sggCd, int months) {
        List<SggPriceMonthly> latestFirst =
                priceRepository.findBySggCdOrderByDealMonthDesc(sggCd, PageRequest.of(0, months));
        if (latestFirst.isEmpty()) {
            throw notFound(sggCd);
        }
        List<TrendPoint> points = latestFirst.reversed().stream().map(TrendPoint::from).toList();
        return new Trend(sggCd, latestFirst.getFirst().getSggNm(), points);
    }

    /** 최근 완결 월의 시군구 순위. */
    public Ranking getRanking(RankingSort sort) {
        List<SggRanking> rows = rankingRepository.findAll(
                Sort.by(sort.rankProperty).ascending().and(Sort.by("sggCd")));
        String ym = rows.isEmpty() ? null : rows.getFirst().getYm();
        return new Ranking(ym, sort, rows.stream().map(r -> RankingItem.from(r, sort)).toList());
    }

    private void ensureRegionExists(String sggCd) {
        if (!priceRepository.existsBySggCd(sggCd)) {
            throw notFound(sggCd);
        }
    }

    private static ApiExceptions.NotFound notFound(String sggCd) {
        return new ApiExceptions.NotFound("시군구 코드 " + sggCd + "의 데이터가 없습니다.");
    }
}
