"""api 뷰 → frontend/data/dashboard.json (정적 배포용 데이터 스냅샷).

Vercel 에 올린 대시보드는 맥의 백엔드·DB 에 닿을 수 없으므로, 대시보드가 쓰는 데이터를 JSON 하나로 내보내
저장소에 함께 올린다. 형식은 backend(Spring Boot) 응답과 같은 camelCase 라서 프론트는 데이터 출처만 바꾼다.

담는 것: 공개 실거래가를 월 단위로 집계한 값(시군구별 월별 지표, 최근 완결 월 순위)뿐이다.
개별 거래·단지 상세·개인정보는 담지 않는다.

실행 (프로젝트 루트에서, docker-compose 의 postgres 가 떠 있어야 함):
    .venv/bin/python scripts/export_dashboard_data.py
"""
import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "data" / "dashboard.json"


def num(v):
    """Decimal → float (JSON 직렬화용). None 은 그대로."""
    return float(v) if isinstance(v, Decimal) else v


def main():
    load_dotenv(ROOT / ".env")
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

    data = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "regions": regions,
        "ranking": ranking,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    months = sum(len(r["months"]) for r in regions.values())
    print(f"{OUT.relative_to(ROOT)}: 시군구 {len(regions)}개, 월별 행 {months}개, 순위 {ranking['ym']} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
