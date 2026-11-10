-- 품질 점검: 결과 행이 나오면 확인이 필요한 항목이다 (3번만 항상 한 줄이 나온다).
-- 실행: docker exec -i apt-postgres psql -U apt -d aptdb < db/sql/05_checks.sql

\echo '1) 매핑에 없는 시군구 코드 (행이 나오면 map.sgg_code에 추가)'
SELECT DISTINCT s.sgg_cd
FROM stg.apt_trade s
LEFT JOIN map.sgg_code m ON m.sgg_cd = s.sgg_cd
WHERE m.sgg_cd IS NULL;

\echo '2) 같은 단지 코드에 이름이 여러 개 (표기 차이 확인, 필요하면 map.apt_name 수동 보정)'
SELECT apt_seq,
       count(DISTINCT apt_nm)           AS name_cnt,
       array_agg(DISTINCT apt_nm)       AS names
FROM stg.apt_trade
WHERE apt_seq IS NOT NULL
GROUP BY apt_seq
HAVING count(DISTINCT apt_nm) > 1;

\echo '3) 건수 대사: 취소 제외 거래 수와 마트 합계가 같아야 한다'
SELECT (SELECT count(*) FROM stg.apt_trade
         WHERE NOT is_canceled AND deal_date IS NOT NULL AND sgg_cd IS NOT NULL) AS stg_cnt,
       (SELECT COALESCE(sum(trade_cnt), 0) FROM mart.sgg_price_monthly)           AS sgg_mart_cnt,
       (SELECT COALESCE(sum(trade_cnt), 0) FROM mart.umd_price_monthly)           AS umd_mart_cnt,
       (SELECT COALESCE(sum(trade_cnt), 0) FROM mart.apt_price_monthly)           AS apt_mart_cnt;

\echo '4) 완전히 같은 거래가 여러 건 (정상일 수도 있으니 눈으로 확인)'
SELECT *
FROM (
    SELECT apt_seq, deal_date, floor, excl_use_ar, deal_amount_man,
           count(*) OVER (PARTITION BY apt_seq, deal_date, floor, excl_use_ar, deal_amount_man) AS cnt
    FROM stg.apt_trade
    WHERE NOT is_canceled
) t
WHERE cnt > 1
ORDER BY apt_seq, deal_date;
