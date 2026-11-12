"""api 뷰 → 대시보드 데이터 스냅샷(dashboard.json).

Vercel 에 올린 대시보드는 맥의 백엔드·DB 에 닿을 수 없으므로, 대시보드가 쓰는 데이터를 JSON 하나로 내보낸다.
형식은 backend(Spring Boot) 응답과 같은 camelCase 라서 프론트는 데이터 출처만 바꾼다.

담는 것: 공개 실거래가를 월 단위로 집계한 값(시군구별 월별 지표, 최근 완결 월 순위)뿐이다.
개별 거래·단지 상세·개인정보는 담지 않는다.

내보내는 곳 두 가지:
  - 기본: frontend/data/dashboard.json 파일 (로컬 확인·예비용)
  - --upload: Vercel Blob 의 dashboard.json 을 덮어쓴다. 배포된 사이트는 이 파일을 요청 때마다 읽으므로
    git push·재배포 없이 최신 데이터가 반영된다. Airflow DAG 의 마지막 단계에서 이 모드로 실행한다.
    집계값이 지난번 업로드와 같으면(생성 시각만 다르면) 올리지 않는다.
    토큰(BLOB_READ_WRITE_TOKEN)이 없으면 종료 코드 99 로 끝나 Airflow 에서 '건너뜀'으로 표시된다.

실행 (프로젝트 루트에서, docker-compose 의 postgres 가 떠 있어야 함):
    .venv/bin/python scripts/export_dashboard_data.py            # 파일로
    .venv/bin/python scripts/export_dashboard_data.py --upload   # Vercel Blob 으로
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "data" / "dashboard.json"

# 수집 스크립트의 HTTP 세션(회사망 CA 번들 처리)과 비밀값 마스킹을 그대로 쓴다.
# 로컬은 ROOT/ingest, 컨테이너는 /opt/airflow/ingest 라서 둘 다 ROOT 기준으로 찾아진다.
sys.path.insert(0, str(ROOT / "ingest"))
from load_apt_trade import build_session, load_dotenv, mask_secret  # noqa: E402

BLOB_API_URL = "https://vercel.com/api/blob/"
BLOB_API_VERSION = "13"  # @vercel/blob 2.9.0 이 쓰는 값
BLOB_PATHNAME = "dashboard.json"
BLOB_CACHE_MAX_AGE = 60  # 초. CDN 이 이 시간만큼 옛 파일을 줄 수 있다 (Vercel 최소값)
EXIT_SKIP = 99  # Airflow BashOperator 가 '건너뜀(skipped)'으로 처리하는 종료 코드


def num(v):
    """Decimal → float (JSON 직렬화용). None 은 그대로."""
    return float(v) if isinstance(v, Decimal) else v


def build_data():
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5433")),
        dbname=os.environ["POSTGRES_DB"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
    )
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT sgg_cd, sgg_nm, ym, trade_cnt, avg_price_man, median_price_man,
                       avg_price_per_m2_man, mom_change_pct, ma3_avg_price_man, is_current_month, bulk_cnt
                  FROM api.v_sgg_price_monthly
                 ORDER BY sgg_cd, deal_month
                """
            )
            regions = {}
            for (sgg_cd, sgg_nm, ym, trade_cnt, avg, median, per_m2, mom, ma3, current, bulk) in cur.fetchall():
                region = regions.setdefault(sgg_cd, {"sggCd": sgg_cd, "sggNm": sgg_nm, "months": []})
                region["months"].append({
                    "ym": ym,
                    "tradeCnt": trade_cnt,
                    "avgPriceMan": avg,
                    "medianPriceMan": median,
                    "avgPricePerM2Man": num(per_m2),
                    "momChangePct": num(mom),
                    "ma3AvgPriceMan": ma3,
                    "currentMonth": current,
                    "bulkCnt": bulk or 0,
                })

            cur.execute(
                """
                SELECT ym, rank_by_avg_price, sgg_cd, sgg_nm, trade_cnt, avg_price_man, median_price_man,
                       avg_price_per_m2_man, mom_change_pct
                  FROM api.v_sgg_ranking_latest
                 ORDER BY rank_by_avg_price, sgg_cd
                """
            )
            rows = cur.fetchall()
            ranking = {
                "ym": rows[0][0] if rows else None,
                "sort": "AVG_PRICE",
                "items": [
                    {
                        "rank": rank, "sggCd": sgg_cd, "sggNm": sgg_nm, "tradeCnt": trade_cnt,
                        "avgPriceMan": avg, "medianPriceMan": median,
                        "avgPricePerM2Man": num(per_m2), "momChangePct": num(mom),
                    }
                    for (_ym, rank, sgg_cd, sgg_nm, trade_cnt, avg, median, per_m2, mom) in rows
                ],
            }
    finally:
        conn.close()

    if not regions:
        # 빈 결과로 사이트 데이터를 덮어쓰지 않도록 여기서 멈춘다.
        raise RuntimeError("api.v_sgg_price_monthly 가 비어 있습니다.")

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "regions": regions,
        "ranking": ranking,
    }


def summary(data):
    months = sum(len(r["months"]) for r in data["regions"].values())
    return f"시군구 {len(data['regions'])}개, 월별 행 {months}개, 순위 {data['ranking']['ym']}"


def same_content(a, b):
    """생성 시각을 뺀 집계값이 같은지."""
    return {k: v for k, v in a.items() if k != "generatedAt"} == {k: v for k, v in b.items() if k != "generatedAt"}


def to_json(data):
    return json.dumps(data, ensure_ascii=False, indent=1) + "\n"


def write_file(data):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(to_json(data), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {summary(data)} ({OUT.stat().st_size:,} bytes)")


def upload(data):
    token = os.getenv("BLOB_READ_WRITE_TOKEN", "").strip()
    if not token:
        print("BLOB_READ_WRITE_TOKEN 이 없어 업로드를 건너뜁니다 (.env 에 설정 필요).")
        return EXIT_SKIP

    # 토큰 형식: vercel_blob_rw_<storeId>_<secret>. 공개 파일 주소는 storeId 로 정해진다.
    store_id = token.split("_")[3] if token.count("_") >= 4 else ""
    if not store_id:
        print("BLOB_READ_WRITE_TOKEN 형식이 올바르지 않습니다 (vercel_blob_rw_ 로 시작해야 함).")
        return 1
    public_url = f"https://{store_id.lower()}.public.blob.vercel-storage.com/{BLOB_PATHNAME}"

    session = build_session(os.getenv("APT_CA_BUNDLE"))
    try:
        # 지난번 업로드와 비교. 쿼리를 붙여 CDN 캐시를 피한다. 처음이면 404.
        # 회사망처럼 *.blob.vercel-storage.com 이 막힌 곳에서는 읽지 못하므로(403 차단 페이지) 비교 없이 올린다.
        res = session.get(public_url, params={"t": int(datetime.now().timestamp())}, timeout=30)
        previous = None
        if res.ok:
            try:
                previous = res.json()
            except ValueError:
                pass
        if previous is not None and same_content(previous, data):
            print(f"집계값 변경 없음 → 업로드 건너뜀 ({summary(data)}, 기존 기준 {previous.get('generatedAt')})")
            return 0
        if previous is None and res.status_code != 404:
            print(f"이전 파일을 읽지 못해(HTTP {res.status_code}) 비교 없이 업로드합니다.")

        res = session.put(
            BLOB_API_URL,
            params={"pathname": BLOB_PATHNAME},
            data=to_json(data).encode("utf-8"),
            headers={
                "authorization": f"Bearer {token}",
                "x-api-version": BLOB_API_VERSION,
                "x-vercel-blob-store-id": store_id,
                "x-vercel-blob-access": "public",
                "x-content-type": "application/json; charset=utf-8",
                "x-add-random-suffix": "0",  # 매번 같은 주소에 덮어쓴다
                "x-allow-overwrite": "1",
                "x-cache-control-max-age": str(BLOB_CACHE_MAX_AGE),
            },
            timeout=60,
        )
        if not res.ok:
            print(mask_secret(f"업로드 실패 HTTP {res.status_code}: {res.text[:300]}", token))
            return 1
        print(f"업로드 완료: {res.json().get('url')} ({summary(data)})")
        return 0
    except Exception as exc:  # 예외 메시지에 토큰이 섞이지 않게 가린다
        print(mask_secret(f"업로드 중 오류 {type(exc).__name__}: {exc}", token))
        return 1


def main():
    parser = argparse.ArgumentParser(description="대시보드 데이터 스냅샷 내보내기")
    parser.add_argument("--upload", action="store_true", help="파일 대신 Vercel Blob 에 업로드")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    data = build_data()
    if args.upload:
        sys.exit(upload(data))
    write_file(data)


if __name__ == "__main__":
    main()
