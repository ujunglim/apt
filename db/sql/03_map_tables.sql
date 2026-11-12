-- 매핑 테이블: 원천 값을 분석에서 쓰는 표준 값으로 바꾸는 기준표
-- 키 하나가 표준 값 하나에만 대응해야 하므로 PK를 건다 (JOIN 시 행이 늘어나지 않도록).
-- 재실행해도 안전하다 (이미 있는 행은 건드리지 않는다).
-- 실행: docker exec -i apt-postgres psql -U apt -d aptdb -v ON_ERROR_STOP=1 < db/sql/03_map_tables.sql

CREATE SCHEMA IF NOT EXISTS map;

-- 1) 시군구 코드 -> 시도/시군구 이름
CREATE TABLE IF NOT EXISTS map.sgg_code (
                                            sgg_cd   TEXT PRIMARY KEY,   -- 법정동 코드 앞 5자리
                                            sido_nm  TEXT NOT NULL,
                                            sgg_nm   TEXT NOT NULL
);

-- 실제 API 응답(sggCd, estateAgentSggNm, umdNm)으로 확인된 값만 넣는다.
-- 다른 구를 수집할 때는 행정표준코드관리시스템(code.go.kr)에서 코드를 확인한 뒤 추가한다.
--   11215 광진구 (2026-11-09 확인)
--   11170 용산구 / 11710 송파구 / 11230 동대문구 (2026-11-12, 2026년 10월 응답으로 확인)
INSERT INTO map.sgg_code (sgg_cd, sido_nm, sgg_nm)
VALUES ('11215', '서울특별시', '광진구'),
       ('11170', '서울특별시', '용산구'),
       ('11710', '서울특별시', '송파구'),
       ('11230', '서울특별시', '동대문구')
    ON CONFLICT (sgg_cd) DO NOTHING;

-- 2) 단지 코드(apt_seq) -> 표준 단지명
CREATE TABLE IF NOT EXISTS map.apt_name (
                                            apt_seq     TEXT PRIMARY KEY,
                                            apt_nm_std  TEXT NOT NULL,
                                            source      TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
    updated_at  TIMESTAMP NOT NULL DEFAULT now()
    );

-- 자동 시드: 단지 코드별로 가장 많이 쓰인 이름(동률이면 최근 거래의 이름)을 표준명으로 삼는다.
-- 새 단지 코드만 추가되고, 이미 있는 행(수동 보정 포함)은 덮어쓰지 않는다.
INSERT INTO map.apt_name (apt_seq, apt_nm_std, source)
SELECT apt_seq, apt_nm, 'auto'
FROM (
         SELECT apt_seq,
                apt_nm,
                row_number() OVER (
               PARTITION BY apt_seq
               ORDER BY count(*) DESC, max(deal_date) DESC
           ) AS rn
         FROM stg.apt_trade
         WHERE apt_seq IS NOT NULL
           AND apt_nm IS NOT NULL
         GROUP BY apt_seq, apt_nm
     ) t
WHERE rn = 1
    ON CONFLICT (apt_seq) DO NOTHING;

-- 수동 보정 예시 (표준명을 직접 정하고 싶을 때):
-- UPDATE map.apt_name
--    SET apt_nm_std = '원하는 이름', source = 'manual', updated_at = now()
--  WHERE apt_seq = '11215-4838';