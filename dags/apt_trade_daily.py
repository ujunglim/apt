"""아파트 매매 실거래가 일 배치.

수집(API -> raw) -> raw 점검 -> staging -> 매핑 -> 마트 -> 마트 점검 -> API 뷰

- 매일 06:00(서울)에 실행되며, 수집 스크립트가 최근 N개월(기본 3)을 월 단위로 다시 받아 덮어쓴다.
  신고가 최대 30일 늦게 들어오고 취소·등기일자가 나중에 갱신되기 때문이다.
- 과거 데이터를 채울 때는 'Trigger DAG w/ config'에서 months 를 12 등으로 올려 실행한다.
- 모든 단계가 멱등이라 같은 날 여러 번 실행해도 결과가 같다.
- 수집 대상 시군구는 환경변수 APT_LAWD_CODES(쉼표 구분, 기본 11215=광진구)로 정한다.
"""
from __future__ import annotations

import logging
import os
import sys
from contextlib import closing
from datetime import timedelta
from pathlib import Path

import pendulum
from airflow.providers.standard.operators.bash import BashOperator
from airflow.sdk import DAG, Param, task

log = logging.getLogger(__name__)

SQL_DIR = Path(os.getenv("APT_SQL_DIR", "/opt/airflow/sql"))
INGEST_SCRIPT = os.getenv("APT_INGEST_SCRIPT", "/opt/airflow/ingest/load_apt_trade.py")
LAWD_CODES = [c.strip() for c in os.getenv("APT_LAWD_CODES", "11215").split(",") if c.strip()]

# 월 거래 건수가 직전 완결 월의 이 비율보다 작으면 경고 (신고 지연일 수 있어 실패시키지는 않는다)
VOLUME_DROP_WARN_RATIO = 0.5


def _connect():
    import psycopg2

    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5433")),
        dbname=os.environ["POSTGRES_DB"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
    )


def _run_sql_file(filename: str) -> None:
    """SQL 파일 하나를 통째로 실행한다. 파일 안의 BEGIN/COMMIT 이 그대로 동작하도록 autocommit 으로 연다."""
    sql = (SQL_DIR / filename).read_text(encoding="utf-8")
    with closing(_connect()) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
    log.info("%s 실행 완료", filename)


def _check_raw() -> None:
    """수집 결과 점검: 대상 시군구마다 raw 에 데이터가 있어야 한다."""
    with closing(_connect()) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT lawd_cd, count(*) FROM raw.apt_trade WHERE lawd_cd = ANY(%s) GROUP BY 1",
            (LAWD_CODES,),
        )
        counts = dict(cur.fetchall())
    empty = [code for code in LAWD_CODES if counts.get(code, 0) == 0]
    if empty:
        raise ValueError(f"raw.apt_trade 에 데이터가 없는 시군구: {empty}")
    log.info("raw 건수: %s", counts)


def _check_mart() -> None:
    """마트 점검: 건수 대사는 실패, 매핑 누락·건수 급감·일괄 매각 발견은 경고."""
    with closing(_connect()) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT (SELECT count(*) FROM stg.apt_trade
                     WHERE NOT is_canceled AND NOT is_bulk AND deal_date IS NOT NULL AND sgg_cd IS NOT NULL),
                   (SELECT COALESCE(sum(trade_cnt), 0) FROM mart.sgg_price_monthly),
                   (SELECT COALESCE(sum(trade_cnt), 0) FROM mart.umd_price_monthly),
                   (SELECT COALESCE(sum(trade_cnt), 0) FROM mart.apt_price_monthly)
            """
        )
        stg_cnt, sgg_cnt, umd_cnt, apt_cnt = cur.fetchone()

        cur.execute(
            """
            SELECT DISTINCT s.sgg_cd
              FROM stg.apt_trade s
              LEFT JOIN map.sgg_code m ON m.sgg_cd = s.sgg_cd
             WHERE m.sgg_cd IS NULL
            """
        )
        unmapped = [r[0] for r in cur.fetchall()]

        cur.execute(
            """
            SELECT sgg_cd, trade_cnt
              FROM (SELECT sgg_cd, trade_cnt,
                           row_number() OVER (PARTITION BY sgg_cd ORDER BY deal_month DESC) AS rn
                      FROM mart.sgg_price_monthly
                     WHERE NOT is_current_month) t
             WHERE rn <= 2
             ORDER BY sgg_cd, rn
            """
        )
        recent = {}
        for sgg_cd, trade_cnt in cur.fetchall():
            recent.setdefault(sgg_cd, []).append(trade_cnt)

        # 일괄 매각(법인·공공기관의 같은 단지·같은 날 5건 이상 매수)은 마트에서 제외된다. 무엇이 빠졌는지 남긴다.
        cur.execute(
            """
            SELECT sgg_cd, apt_nm, deal_date, count(*)
              FROM stg.apt_trade
             WHERE NOT is_canceled AND is_bulk
             GROUP BY 1, 2, 3
             ORDER BY 4 DESC
            """
        )
        bulk_groups = cur.fetchall()

    if unmapped:
        log.warning("map.sgg_code 에 없는 시군구 코드: %s (매핑 테이블에 추가 필요)", unmapped)
    for sgg_cd, (latest, *rest) in recent.items():
        if rest and rest[0] > 0 and latest < rest[0] * VOLUME_DROP_WARN_RATIO:
            log.warning("%s: 최근 완결 월 거래 %s건이 직전 월 %s건의 %d%% 미만 (신고 지연 가능)",
                        sgg_cd, latest, rest[0], int(VOLUME_DROP_WARN_RATIO * 100))

    if bulk_groups:
        log.warning("일괄 매각 %d건(%d묶음)을 마트 집계에서 제외: %s",
                    sum(g[3] for g in bulk_groups), len(bulk_groups),
                    ", ".join(f"{g[0]} {g[1]} {g[2]} {g[3]}건" for g in bulk_groups[:10]))

    if not (stg_cnt == sgg_cnt == umd_cnt == apt_cnt):
        raise ValueError(
            f"건수 불일치: stg={stg_cnt}, sgg_mart={sgg_cnt}, umd_mart={umd_cnt}, apt_mart={apt_cnt}"
        )
    log.info("건수 대사 통과: %s건", stg_cnt)


def _sql_step(task_id: str, filename: str):
    @task(task_id=task_id)
    def run() -> None:
        _run_sql_file(filename)

    return run()


with DAG(
    dag_id="apt_trade_daily",
    description="아파트 매매 실거래가 수집 -> raw -> stg -> map -> mart -> api 뷰",
    schedule="0 6 * * *",
    start_date=pendulum.datetime(2026, 11, 1, tz="Asia/Seoul"),
    catchup=False,
    max_active_runs=1,
    params={
        "months": Param(3, type="integer", minimum=1, maximum=60,
                        description="최근 몇 개월을 다시 받을지 (과거 채우기는 12 등으로 올린다)"),
    },
    default_args={"retries": 2, "retry_delay": timedelta(minutes=5)},
    tags=["apt", "daily"],
) as dag:
    ingest = [
        BashOperator(
            task_id=f"ingest_{code}",
            bash_command=f"{sys.executable} {INGEST_SCRIPT} --lawd {code} --months "
            + "{{ params.months }}",
        )
        for code in LAWD_CODES
    ]

    @task
    def check_raw() -> None:
        _check_raw()

    @task
    def check_mart() -> None:
        _check_mart()

    build_stg = _sql_step("build_stg", "02_stg_apt_trade.sql")
    build_map = _sql_step("build_map", "03_map_tables.sql")
    build_mart = _sql_step("build_mart", "04_mart.sql")
    build_api = _sql_step("build_api", "06_api_views.sql")

    ingest >> check_raw() >> build_stg >> build_map >> build_mart >> check_mart() >> build_api
