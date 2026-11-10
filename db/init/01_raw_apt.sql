-- 컨테이너가 처음 만들어질 때만 자동 실행

CREATE SCHEMA IF NOT EXISTS raw;

CREATE TABLE raw.apt_trade (
    -- 요청 파라미터 (어떤 호출로 받은 데이터인지)
    lawd_cd              TEXT NOT NULL,   -- 요청한 시군구 코드 (11215)
    deal_ymd             TEXT NOT NULL,   -- 요청한 계약년월 (202610)

    -- API 응답 필드 (전부 TEXT, 가공 없음)
    apt_nm               TEXT,
    apt_seq              TEXT,
    apt_dong             TEXT,
    umd_nm               TEXT,
    umd_cd               TEXT,
    sgg_cd               TEXT,
    jibun                TEXT,
    bonbun               TEXT,
    bubun                TEXT,
    land_cd              TEXT,
    road_nm              TEXT,
    road_nm_cd           TEXT,
    road_nm_seq          TEXT,
    road_nm_sgg_cd       TEXT,
    road_nm_bonbun       TEXT,
    road_nm_bubun        TEXT,
    road_nmb_cd          TEXT,
    build_year           TEXT,
    excl_use_ar          TEXT,   -- 전용면적
    floor                TEXT,
    deal_amount          TEXT,   -- '55,000' (만원)
    deal_year            TEXT,
    deal_month           TEXT,
    deal_day             TEXT,
    dealing_gbn          TEXT,   -- 중개거래/직거래
    buyer_gbn            TEXT,
    sler_gbn             TEXT,
    estate_agent_sgg_nm  TEXT,
    cdeal_type           TEXT,   -- 취소 여부
    cdeal_day            TEXT,   -- 취소일
    rgst_date            TEXT,   -- 등기일자
    land_leasehold_gbn   TEXT,

    -- 적재 메타데이터
    batch_id             TEXT NOT NULL,
    ingested_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX ix_apt_trade_req ON raw.apt_trade (lawd_cd, deal_ymd);