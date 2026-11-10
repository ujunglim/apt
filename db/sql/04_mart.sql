-- 마트: stg.apt_trade(+매핑)를 월 단위로 집계한 테이블 3개
--   mart.sgg_price_monthly  시군구 x 월
--   mart.umd_price_monthly  법정동 x 월
--   mart.apt_price_monthly  단지 x 월 (표준 단지명, 순위)
-- 집계 대상은 취소되지 않은 거래만이다. 실행할 때마다 전체를 다시 만든다(TRUNCATE + INSERT).
-- 실행: docker exec -i apt-postgres psql -U apt -d aptdb -v ON_ERROR_STOP=1 < db/sql/04_mart.sql

CREATE SCHEMA IF NOT EXISTS mart;

CREATE TABLE IF NOT EXISTS mart.sgg_price_monthly (
                                                      sgg_cd                TEXT    NOT NULL,
                                                      sgg_nm                TEXT,
                                                      deal_month            DATE    NOT NULL,   -- 해당 월 1일
                                                      trade_cnt             INT     NOT NULL,   -- 거래 건수
                                                      avg_price_man         INT,                -- 평균 거래금액(만원)
                                                      median_price_man      INT,                -- 중위 거래금액(만원)
                                                      avg_price_per_m2_man  NUMERIC(10,1),      -- 전용면적 ㎡당 평균 거래금액(만원)
    mom_change_pct        NUMERIC(6,2),       -- 전월 대비 평균가 변동률(%), 직전 달 데이터가 없으면 NULL
    ma3_avg_price_man     INT,                -- 월 평균가의 3개월 이동평균(만원)
    is_current_month      BOOLEAN NOT NULL,   -- 진행 중인 달(신고가 덜 들어와 건수가 적을 수 있음)
    refreshed_at          TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (sgg_cd, deal_month)
    );

CREATE TABLE IF NOT EXISTS mart.umd_price_monthly (
                                                      sgg_cd                TEXT    NOT NULL,
                                                      umd_cd                TEXT    NOT NULL,
                                                      umd_nm                TEXT,
                                                      deal_month            DATE    NOT NULL,
                                                      trade_cnt             INT     NOT NULL,
                                                      avg_price_man         INT,
                                                      median_price_man      INT,
                                                      avg_price_per_m2_man  NUMERIC(10,1),
    mom_change_pct        NUMERIC(6,2),
    ma3_avg_price_man     INT,
    is_current_month      BOOLEAN NOT NULL,
    refreshed_at          TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (sgg_cd, umd_cd, deal_month)
    );

CREATE TABLE IF NOT EXISTS mart.apt_price_monthly (
                                                      sgg_cd                TEXT    NOT NULL,
                                                      apt_key               TEXT    NOT NULL,   -- 단지 코드(없으면 'NAME:' || 단지명)
                                                      apt_seq               TEXT,
                                                      apt_nm_std            TEXT,               -- 매핑 테이블의 표준 단지명
                                                      umd_nm                TEXT,
                                                      deal_month            DATE    NOT NULL,
                                                      trade_cnt             INT     NOT NULL,
                                                      avg_price_man         INT,
                                                      max_price_man         INT,
                                                      avg_price_per_m2_man  NUMERIC(10,1),
    rank_by_avg_price     INT,                -- 같은 시군구, 같은 달 안에서 평균가 순위
    rank_by_trade_cnt     INT,                -- 같은 시군구, 같은 달 안에서 거래 건수 순위
    is_current_month      BOOLEAN NOT NULL,
    refreshed_at          TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (sgg_cd, apt_key, deal_month)
    );

BEGIN;

TRUNCATE mart.sgg_price_monthly, mart.umd_price_monthly, mart.apt_price_monthly;

-- 1) 시군구 x 월
WITH base AS (
    SELECT sgg_cd,
           date_trunc('month', deal_date)::date AS deal_month,
        deal_amount_man,
           excl_use_ar
    FROM stg.apt_trade
    WHERE NOT is_canceled
      AND deal_date IS NOT NULL
      AND sgg_cd IS NOT NULL
),
     agg AS (
         SELECT sgg_cd,
                deal_month,
                count(*)                                                              AS trade_cnt,
                round(avg(deal_amount_man))::int                                      AS avg_price_man,
             round(percentile_cont(0.5) WITHIN GROUP (ORDER BY deal_amount_man))::int AS median_price_man,
             round(avg(deal_amount_man / NULLIF(excl_use_ar, 0)), 1)               AS avg_price_per_m2_man
         FROM base
         GROUP BY sgg_cd, deal_month
     ),
     win AS (
         SELECT agg.*,
                lag(deal_month)    OVER w_ord AS prev_month,
             lag(avg_price_man) OVER w_ord AS prev_avg,
             round(avg(avg_price_man) OVER (
               PARTITION BY sgg_cd ORDER BY deal_month
               ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
           ))::int AS ma3_avg_price_man
         FROM agg
                  WINDOW w_ord AS (PARTITION BY sgg_cd ORDER BY deal_month)
    )
INSERT INTO mart.sgg_price_monthly
(sgg_cd, sgg_nm, deal_month, trade_cnt, avg_price_man, median_price_man,
 avg_price_per_m2_man, mom_change_pct, ma3_avg_price_man, is_current_month)
SELECT w.sgg_cd,
       m.sgg_nm,
       w.deal_month,
       w.trade_cnt,
       w.avg_price_man,
       w.median_price_man,
       w.avg_price_per_m2_man,
       CASE WHEN w.prev_month = (w.deal_month - interval '1 month')::date
                 AND w.prev_avg > 0
            THEN round((w.avg_price_man - w.prev_avg) * 100.0 / w.prev_avg, 2)
END,
       w.ma3_avg_price_man,
       (w.deal_month = date_trunc('month', current_date)::date)
FROM win w
LEFT JOIN map.sgg_code m ON m.sgg_cd = w.sgg_cd;

-- 2) 법정동 x 월
WITH base AS (
    SELECT sgg_cd,
           umd_cd,
           umd_nm,
           date_trunc('month', deal_date)::date AS deal_month,
        deal_amount_man,
           excl_use_ar
    FROM stg.apt_trade
    WHERE NOT is_canceled
      AND deal_date IS NOT NULL
      AND sgg_cd IS NOT NULL
      AND umd_cd IS NOT NULL
),
     agg AS (
         SELECT sgg_cd,
                umd_cd,
                min(umd_nm)                                                           AS umd_nm,
                deal_month,
                count(*)                                                              AS trade_cnt,
                round(avg(deal_amount_man))::int                                      AS avg_price_man,
             round(percentile_cont(0.5) WITHIN GROUP (ORDER BY deal_amount_man))::int AS median_price_man,
             round(avg(deal_amount_man / NULLIF(excl_use_ar, 0)), 1)               AS avg_price_per_m2_man
         FROM base
         GROUP BY sgg_cd, umd_cd, deal_month
     ),
     win AS (
         SELECT agg.*,
                lag(deal_month)    OVER w_ord AS prev_month,
             lag(avg_price_man) OVER w_ord AS prev_avg,
             round(avg(avg_price_man) OVER (
               PARTITION BY sgg_cd, umd_cd ORDER BY deal_month
               ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
           ))::int AS ma3_avg_price_man
         FROM agg
                  WINDOW w_ord AS (PARTITION BY sgg_cd, umd_cd ORDER BY deal_month)
    )
INSERT INTO mart.umd_price_monthly
(sgg_cd, umd_cd, umd_nm, deal_month, trade_cnt, avg_price_man, median_price_man,
 avg_price_per_m2_man, mom_change_pct, ma3_avg_price_man, is_current_month)
SELECT sgg_cd,
       umd_cd,
       umd_nm,
       deal_month,
       trade_cnt,
       avg_price_man,
       median_price_man,
       avg_price_per_m2_man,
       CASE WHEN prev_month = (deal_month - interval '1 month')::date
                 AND prev_avg > 0
            THEN round((avg_price_man - prev_avg) * 100.0 / prev_avg, 2)
END,
       ma3_avg_price_man,
       (deal_month = date_trunc('month', current_date)::date)
FROM win;

-- 3) 단지 x 월 (표준 단지명으로 묶고, 월별 순위를 붙인다)
WITH base AS (
    SELECT s.sgg_cd,
           COALESCE(s.apt_seq, 'NAME:' || s.apt_nm)  AS apt_key,
           s.apt_seq,
           COALESCE(m.apt_nm_std, s.apt_nm)          AS apt_nm_std,
           s.umd_nm,
           date_trunc('month', s.deal_date)::date    AS deal_month,
        s.deal_amount_man,
           s.excl_use_ar
    FROM stg.apt_trade s
             LEFT JOIN map.apt_name m ON m.apt_seq = s.apt_seq
    WHERE NOT s.is_canceled
      AND s.deal_date IS NOT NULL
      AND s.sgg_cd IS NOT NULL
      AND (s.apt_seq IS NOT NULL OR s.apt_nm IS NOT NULL)
),
     agg AS (
         SELECT sgg_cd,
                apt_key,
                min(apt_seq)                                            AS apt_seq,
                min(apt_nm_std)                                         AS apt_nm_std,
                min(umd_nm)                                             AS umd_nm,
                deal_month,
                count(*)                                                AS trade_cnt,
                round(avg(deal_amount_man))::int                        AS avg_price_man,
             max(deal_amount_man)                                    AS max_price_man,
                round(avg(deal_amount_man / NULLIF(excl_use_ar, 0)), 1) AS avg_price_per_m2_man
         FROM base
         GROUP BY sgg_cd, apt_key, deal_month
     )
INSERT INTO mart.apt_price_monthly
    (sgg_cd, apt_key, apt_seq, apt_nm_std, umd_nm, deal_month, trade_cnt, avg_price_man,
     max_price_man, avg_price_per_m2_man, rank_by_avg_price, rank_by_trade_cnt, is_current_month)
SELECT sgg_cd,
       apt_key,
       apt_seq,
       apt_nm_std,
       umd_nm,
       deal_month,
       trade_cnt,
       avg_price_man,
       max_price_man,
       avg_price_per_m2_man,
       rank() OVER (PARTITION BY sgg_cd, deal_month ORDER BY avg_price_man DESC),
    rank() OVER (PARTITION BY sgg_cd, deal_month ORDER BY trade_cnt DESC),
    (deal_month = date_trunc('month', current_date)::date)
FROM agg;

COMMIT;