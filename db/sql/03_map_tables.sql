-- 코드를 사람이 읽을 수 있는 이름으로 바꿔 주는 매핑 테이블 2개를 만든다.
-- 키 하나가 표준 값 하나에만 대응해야 하므로 PK를 건다 (JOIN 시 행이 늘어나지 않도록).
-- 재실행해도 안전하다 (이미 있는 행은 건드리지 않는다).
-- 실행: docker exec -i apt-postgres psql -U apt -d aptdb -v ON_ERROR_STOP=1 < db/sql/03_map_tables.sql

CREATE SCHEMA IF NOT EXISTS map;

-- 1) 시군구 매핑 테이블: 시군구 코드 -> 시도/시군구 이름
CREATE TABLE IF NOT EXISTS map.sgg_code (
                                            sgg_cd   TEXT PRIMARY KEY,   -- 법정동 코드 앞 5자리
                                            sido_nm  TEXT NOT NULL,
                                            sgg_nm   TEXT NOT NULL
);

-- 실제 API 응답(sggCd, estateAgentSggNm, umdNm)으로 확인된 값만 넣는다.
INSERT INTO map.sgg_code (sgg_cd, sido_nm, sgg_nm)
VALUES ('11215', '서울특별시', '광진구'),
       ('11170', '서울특별시', '용산구'),
       ('11710', '서울특별시', '송파구'),
       ('11230', '서울특별시', '동대문구')
    ON CONFLICT (sgg_cd) DO NOTHING;

-- 2) 단지명 매핑 테이블: 단지 코드(apt_seq) -> 표준 단지명
CREATE TABLE IF NOT EXISTS map.apt_name (
                                            apt_seq     TEXT PRIMARY KEY, -- 단지 코드
                                            apt_nm_std  TEXT NOT NULL,    -- 단지명
                                            source      TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')), -- auto: SQL이 자동으로 정한 이름, manual: 사람이 직접 고친 이름
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
WHERE rn = 1                          -- 단지 코드마다 가장 많이 쓰인 이름 하나를 고릅니다. 횟수가 같으면 가장 최근 거래에 쓰인 이름을 고름
    ON CONFLICT (apt_seq) DO NOTHING; -- 이미 있는 단지는 건드리지 않음

-- 수동 보정 예시 (표준명을 직접 정하고 싶을 때):
-- UPDATE map.apt_name
--    SET apt_nm_std = '원하는 이름', source = 'manual', updated_at = now()
--  WHERE apt_seq = '11215-4838';