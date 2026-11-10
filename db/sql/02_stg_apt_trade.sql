-- staging: raw.apt_trade 를 분석에 쓸 수 있는 타입으로 정리한 뷰
-- 뷰라서 raw 가 갱신되면 자동으로 최신 상태가 반영된다.
-- 실행: docker exec -i apt-postgres psql -U apt -d aptdb < db/sql/02_stg_apt_trade.sql

CREATE SCHEMA IF NOT EXISTS stg;

CREATE OR REPLACE VIEW stg.apt_trade AS
SELECT
    lawd_cd,
    deal_ymd,

    -- 단지/위치 (빈 문자열 -> NULL)
    NULLIF(btrim(apt_seq), '')                  AS apt_seq,
    NULLIF(btrim(apt_nm), '')                   AS apt_nm,
    NULLIF(btrim(apt_dong), '')                 AS apt_dong,
    NULLIF(btrim(sgg_cd), '')                   AS sgg_cd,
    NULLIF(btrim(umd_cd), '')                   AS umd_cd,
    NULLIF(btrim(umd_nm), '')                   AS umd_nm,
    NULLIF(btrim(jibun), '')                    AS jibun,
    NULLIF(btrim(road_nm), '')                  AS road_nm,

    -- 숫자 변환
    NULLIF(btrim(build_year), '')::int          AS build_year,
    NULLIF(btrim(excl_use_ar), '')::numeric(8,2) AS excl_use_ar,   -- 전용면적(㎡)
    NULLIF(btrim(floor), '')::int               AS floor,
    replace(btrim(deal_amount), ',', '')::int   AS deal_amount_man, -- 거래금액(만원)

    -- 연/월/일 -> 날짜
    make_date(deal_year::int, deal_month::int, deal_day::int) AS deal_date,

    -- 거래 구분
    NULLIF(btrim(dealing_gbn), '')              AS dealing_gbn,
    NULLIF(btrim(buyer_gbn), '')                AS buyer_gbn,
    NULLIF(btrim(sler_gbn), '')                 AS sler_gbn,
    NULLIF(btrim(estate_agent_sgg_nm), '')      AS estate_agent_sgg_nm,

    -- 취소 여부: 해제 구분 값이 있으면 취소된 거래
    (NULLIF(btrim(cdeal_type), '') IS NOT NULL) AS is_canceled,

    -- 날짜 형식을 아직 확인하지 못한 컬럼은 문자열로 유지 (공백만 NULL 처리)
    NULLIF(btrim(cdeal_day), '')                AS cdeal_day,
    NULLIF(btrim(rgst_date), '')                AS rgst_date,

    batch_id,
    ingested_at
FROM raw.apt_trade;
