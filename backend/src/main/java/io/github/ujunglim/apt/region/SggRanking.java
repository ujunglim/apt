package io.github.ujunglim.apt.region;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.hibernate.annotations.Immutable;

/**
 * api.v_sgg_ranking_latest 뷰. 가장 최근에 "완결된" 달(진행 중인 달 제외)의 시군구 순위.
 * 한 달치만 담기므로 sgg_cd 하나가 행 하나다.
 */
@Entity
@Immutable
@Table(name = "v_sgg_ranking_latest")
public class SggRanking {

    @Id
    @Column(name = "sgg_cd")
    private String sggCd;

    @Column(name = "sgg_nm")
    private String sggNm;

    @Column(name = "deal_month")
    private LocalDate dealMonth;

    @Column(name = "ym")
    private String ym;

    @Column(name = "trade_cnt")
    private Integer tradeCnt;

    @Column(name = "avg_price_man")
    private Integer avgPriceMan;

    @Column(name = "median_price_man")
    private Integer medianPriceMan;

    @Column(name = "avg_price_per_m2_man")
    private BigDecimal avgPricePerM2Man;

    @Column(name = "mom_change_pct")
    private BigDecimal momChangePct;

    @Column(name = "rank_by_avg_price")
    private Integer rankByAvgPrice;

    @Column(name = "rank_by_trade_cnt")
    private Integer rankByTradeCnt;

    protected SggRanking() {
    }

    public String getSggCd() { return sggCd; }
    public String getSggNm() { return sggNm; }
    public LocalDate getDealMonth() { return dealMonth; }
    public String getYm() { return ym; }
    public Integer getTradeCnt() { return tradeCnt; }
    public Integer getAvgPriceMan() { return avgPriceMan; }
    public Integer getMedianPriceMan() { return medianPriceMan; }
    public BigDecimal getAvgPricePerM2Man() { return avgPricePerM2Man; }
    public BigDecimal getMomChangePct() { return momChangePct; }
    public Integer getRankByAvgPrice() { return rankByAvgPrice; }
    public Integer getRankByTradeCnt() { return rankByTradeCnt; }
}
