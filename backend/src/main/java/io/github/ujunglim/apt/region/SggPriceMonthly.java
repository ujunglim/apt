package io.github.ujunglim.apt.region;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.hibernate.annotations.Immutable;

/**
 * api.v_sgg_price_monthly 뷰 (시군구 x 월). 뷰이므로 읽기 전용(@Immutable)이다.
 * 가격 단위는 만원.
 */
@Entity
@Immutable
@Table(name = "v_sgg_price_monthly")
@IdClass(SggPriceMonthly.Key.class)
public class SggPriceMonthly {

    @Id
    @Column(name = "sgg_cd")
    private String sggCd;

    @Id
    @Column(name = "deal_month")
    private LocalDate dealMonth;

    @Column(name = "sgg_nm")
    private String sggNm;

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

    @Column(name = "ma3_avg_price_man")
    private Integer ma3AvgPriceMan;

    @Column(name = "is_current_month")
    private boolean currentMonth;

    @Column(name = "refreshed_at")
    private LocalDateTime refreshedAt;

    protected SggPriceMonthly() {
    }

    /** 복합키 (sgg_cd, deal_month). */
    public record Key(String sggCd, LocalDate dealMonth) implements Serializable {
        public Key() {
            this(null, null);
        }
    }

    public String getSggCd() { return sggCd; }
    public LocalDate getDealMonth() { return dealMonth; }
    public String getSggNm() { return sggNm; }
    public String getYm() { return ym; }
    public Integer getTradeCnt() { return tradeCnt; }
    public Integer getAvgPriceMan() { return avgPriceMan; }
    public Integer getMedianPriceMan() { return medianPriceMan; }
    public BigDecimal getAvgPricePerM2Man() { return avgPricePerM2Man; }
    public BigDecimal getMomChangePct() { return momChangePct; }
    public Integer getMa3AvgPriceMan() { return ma3AvgPriceMan; }
    public boolean isCurrentMonth() { return currentMonth; }
    public LocalDateTime getRefreshedAt() { return refreshedAt; }
}
