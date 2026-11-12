-- API용 뷰: BE(Spring Boot)가 읽는 계층. 마트 테이블 구조가 바뀌어도 이 뷰만 맞추면 API는 그대로 둘 수 있다.
-- 뷰는 데이터를 저장하지 않으므로 마트가 갱신되면 바로 반영된다. 몇 번을 실행해도 안전하다.
-- 실행: docker exec -i apt-postgres psql -U apt -d aptdb -v ON_ERROR_STOP=1 < db/sql/06_api_views.sql
--
-- 가격 단위는 모두 만원이다. 모든 집계는 취소 거래와 일괄 매각(stg.is_bulk)을 제외한 시장 거래 기준이다. ym 은 'YYYY-MM' 문자열(차트 라벨용), deal_month 는 해당 월 1일(날짜).
-- is_current_month 가 참인 달은 신고가 덜 들어와 값이 흔들릴 수 있다.

CREATE SCHEMA IF NOT EXISTS api;

-- 시군구 월별 (GET /regions/{code}/prices, /regions/{code}/trend)
CREATE OR REPLACE VIEW api.v_sgg_price_monthly AS
SELECT sgg_cd,
       sgg_nm,
       deal_month,
       to_char(deal_month, 'YYYY-MM') AS ym,
       trade_cnt,
       avg_price_man,
       median_price_man,
       avg_price_per_m2_man,
       mom_change_pct,
       ma3_avg_price_man,
       is_current_month,
       refreshed_at,
       bulk_cnt          -- 집계에서 제외한 일괄 매각 건수 (뷰 컬럼은 끝에만 추가할 수 있어 마지막에 둔다)
FROM mart.sgg_price_monthly;

-- 법정동 월별 (시군구 안의 동별 비교)
CREATE OR REPLACE VIEW api.v_umd_price_monthly AS
SELECT sgg_cd,
       umd_cd,
       umd_nm,
       deal_month,
       to_char(deal_month, 'YYYY-MM') AS ym,
       trade_cnt,
       avg_price_man,
       median_price_man,
       avg_price_per_m2_man,
       mom_change_pct,
       ma3_avg_price_man,
       is_current_month,
       refreshed_at,
       bulk_cnt
FROM mart.umd_price_monthly;

-- 단지 월별 + 순위 (시군구 안의 단지 목록·순위). 거래 건수가 1~2건인 단지는 평균가가 거래 하나에 좌우되므로 trade_cnt 로 걸러서 쓴다.
CREATE OR REPLACE VIEW api.v_apt_price_monthly AS
SELECT sgg_cd,
       apt_seq,
       apt_nm_std AS apt_nm,
       umd_nm,
       deal_month,
       to_char(deal_month, 'YYYY-MM') AS ym,
       trade_cnt,
       avg_price_man,
       max_price_man,
       avg_price_per_m2_man,
       rank_by_avg_price,
       rank_by_trade_cnt,
       is_current_month,
       refreshed_at
FROM mart.apt_price_monthly;

-- 가장 최근에 "완결된" 달(진행 중인 달 제외)의 시군구 순위 (GET /regions/ranking)
CREATE OR REPLACE VIEW api.v_sgg_ranking_latest AS
WITH latest AS (
    SELECT max(deal_month) AS deal_month
    FROM mart.sgg_price_monthly
    WHERE NOT is_current_month
)
SELECT s.deal_month,
       to_char(s.deal_month, 'YYYY-MM') AS ym,
       s.sgg_cd,
       s.sgg_nm,
       s.trade_cnt,
       s.avg_price_man,
       s.median_price_man,
       s.avg_price_per_m2_man,
       s.mom_change_pct,
       rank() OVER (ORDER BY s.avg_price_man DESC) AS rank_by_avg_price,
    rank() OVER (ORDER BY s.trade_cnt DESC)     AS rank_by_trade_cnt
FROM mart.sgg_price_monthly s
         JOIN latest l ON l.deal_month = s.deal_month;