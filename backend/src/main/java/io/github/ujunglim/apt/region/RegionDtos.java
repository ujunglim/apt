package io.github.ujunglim.apt.region;

import java.math.BigDecimal;
import java.util.List;

/** 응답 DTO 모음. 엔티티를 그대로 내보내지 않고, API 계약을 이 레코드들로 고정한다. 가격 단위는 만원. */
public final class RegionDtos {

    private RegionDtos() {
    }

    /**
     * 시군구 월별 가격 한 행. currentMonth=true 인 달은 신고가 덜 들어와 값이 흔들릴 수 있다.
     * 가격·건수는 일괄 매각을 뺀 시장 거래 기준이고, 뺀 건수는 bulkCnt 로 따로 준다.
     */
    public record MonthlyPrice(
            String ym,
            int tradeCnt,
            Integer avgPriceMan,
            Integer medianPriceMan,
            BigDecimal avgPricePerM2Man,
            BigDecimal momChangePct,
            Integer ma3AvgPriceMan,
            boolean currentMonth,
            int bulkCnt) {

        static MonthlyPrice from(SggPriceMonthly m) {
            return new MonthlyPrice(m.getYm(), m.getTradeCnt(), m.getAvgPriceMan(), m.getMedianPriceMan(),
                    m.getAvgPricePerM2Man(), m.getMomChangePct(), m.getMa3AvgPriceMan(), m.isCurrentMonth(),
                    bulkCntOf(m));
        }
    }

    /** 차트용 추이. points 는 오래된 달 → 최근 달 순서. */
    public record Trend(String sggCd, String sggNm, List<TrendPoint> points) {
    }

    public record TrendPoint(
            String ym,
            Integer avgPriceMan,
            Integer ma3AvgPriceMan,
            Integer medianPriceMan,
            BigDecimal momChangePct,
            int tradeCnt,
            boolean currentMonth,
            int bulkCnt) {

        static TrendPoint from(SggPriceMonthly m) {
            return new TrendPoint(m.getYm(), m.getAvgPriceMan(), m.getMa3AvgPriceMan(), m.getMedianPriceMan(),
                    m.getMomChangePct(), m.getTradeCnt(), m.isCurrentMonth(), bulkCntOf(m));
        }
    }

    private static int bulkCntOf(SggPriceMonthly m) {
        return m.getBulkCnt() == null ? 0 : m.getBulkCnt();
    }

    /** 최근 완결 월의 시군구 순위. ym 이 null 이면 아직 완결된 달이 없다. */
    public record Ranking(String ym, RankingSort sort, List<RankingItem> items) {
    }

    public record RankingItem(
            int rank,
            String sggCd,
            String sggNm,
            int tradeCnt,
            Integer avgPriceMan,
            Integer medianPriceMan,
            BigDecimal avgPricePerM2Man,
            BigDecimal momChangePct) {

        static RankingItem from(SggRanking r, RankingSort sort) {
            int rank = sort == RankingSort.TRADE_CNT ? r.getRankByTradeCnt() : r.getRankByAvgPrice();
            return new RankingItem(rank, r.getSggCd(), r.getSggNm(), r.getTradeCnt(), r.getAvgPriceMan(),
                    r.getMedianPriceMan(), r.getAvgPricePerM2Man(), r.getMomChangePct());
        }
    }

    /** 순위 기준. */
    public enum RankingSort {
        AVG_PRICE("rankByAvgPrice"),
        TRADE_CNT("rankByTradeCnt");

        final String rankProperty;

        RankingSort(String rankProperty) {
            this.rankProperty = rankProperty;
        }
    }
}
