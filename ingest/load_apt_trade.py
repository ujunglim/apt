"""국토교통부 아파트 매매 실거래가(상세) API -> raw.apt_trade 적재.

월 단위로 [API 호출 -> 트랜잭션(DELETE 후 INSERT)]을 반복하므로
같은 월을 몇 번 다시 돌려도 결과가 같다(멱등).

실행 예:
    python ingest/load_apt_trade.py                  # 광진구, 최근 3개월
    python ingest/load_apt_trade.py --months 6       # 최근 6개월
    python ingest/load_apt_trade.py --ym 202610      # 특정 월만
"""
import argparse
import os
import ssl
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.parse import quote, quote_plus, unquote

try:  # 맥(회사 네트워크): 키체인의 사내 인증서를 사용. 컨테이너에는 없으므로 건너뛴다.
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass

import psycopg2
import requests
from psycopg2.extras import execute_values
from requests.adapters import HTTPAdapter

try:
    from dotenv import load_dotenv
except ImportError:  # 컨테이너에서는 환경변수가 이미 주입되어 있다.
    def load_dotenv(*_args, **_kwargs):
        return False

# 환경변수 APT_API_URL 로 주소를 바꿀 수 있다 (가짜 서버로 테스트할 때).
API_URL = os.getenv("APT_API_URL") or (
    "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/"
    "getRTMSDataSvcAptTradeDev"
)
PAGE_SIZE = 1000
MAX_RETRY = 3

# XML 태그(camelCase) -> raw.apt_trade 컬럼(snake_case)
FIELD_MAP = [
    ("aptNm", "apt_nm"),
    ("aptSeq", "apt_seq"),
    ("aptDong", "apt_dong"),
    ("umdNm", "umd_nm"),
    ("umdCd", "umd_cd"),
    ("sggCd", "sgg_cd"),
    ("jibun", "jibun"),
    ("bonbun", "bonbun"),
    ("bubun", "bubun"),
    ("landCd", "land_cd"),
    ("roadNm", "road_nm"),
    ("roadNmCd", "road_nm_cd"),
    ("roadNmSeq", "road_nm_seq"),
    ("roadNmSggCd", "road_nm_sgg_cd"),
    ("roadNmBonbun", "road_nm_bonbun"),
    ("roadNmBubun", "road_nm_bubun"),
    ("roadNmbCd", "road_nmb_cd"),
    ("buildYear", "build_year"),
    ("excluUseAr", "excl_use_ar"),
    ("floor", "floor"),
    ("dealAmount", "deal_amount"),
    ("dealYear", "deal_year"),
    ("dealMonth", "deal_month"),
    ("dealDay", "deal_day"),
    ("dealingGbn", "dealing_gbn"),
    ("buyerGbn", "buyer_gbn"),
    ("slerGbn", "sler_gbn"),
    ("estateAgentSggNm", "estate_agent_sgg_nm"),
    ("cdealType", "cdeal_type"),
    ("cdealDay", "cdeal_day"),
    ("rgstDate", "rgst_date"),
    ("landLeaseholdGbn", "land_leasehold_gbn"),
]
DATA_COLUMNS = [col for _, col in FIELD_MAP]
INSERT_COLUMNS = ["lawd_cd", "deal_ymd", *DATA_COLUMNS, "batch_id"]


def recent_months(n, today=None):
    """오늘이 속한 달부터 거꾸로 n개월의 YYYYMM 리스트(오래된 순)."""
    today = today or datetime.now()
    year, month = today.year, today.month
    result = []
    for _ in range(n):
        result.append(f"{year}{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(result))


def parse_items(xml_text):
    """XML 응답 -> (resultCode, totalCount, [item dict, ...])."""
    root = ET.fromstring(xml_text)
    code = (root.findtext("header/resultCode") or "").strip()
    msg = (root.findtext("header/resultMsg") or "").strip()
    if code not in ("00", "000"):
        raise RuntimeError(f"API 오류 resultCode={code} msg={msg}")
    total = int((root.findtext("body/totalCount") or "0").strip() or 0)
    items = []
    for item in root.iter("item"):
        items.append({child.tag: (child.text or "").strip() for child in item})
    return code, total, items


class _CABundleAdapter(HTTPAdapter):
    """지정한 SSLContext 로 HTTPS 연결을 만드는 어댑터."""

    def __init__(self, ssl_context, **kwargs):
        self._ssl_context = ssl_context
        super().__init__(**kwargs)

    def init_poolmanager(self, *args, **kwargs):
        kwargs["ssl_context"] = self._ssl_context
        return super().init_poolmanager(*args, **kwargs)


def build_session(ca_bundle=None):
    """HTTP 세션. ca_bundle 이 있으면 그 번들로 검증한다 (TLS 검사 프록시 환경용, 컨테이너).

    Python 3.13+ 는 VERIFY_X509_STRICT 를 기본으로 켜는데, 프록시 CA 중에는 key usage 확장이
    없어 이 검사에서만 거절되는 경우가 있다. 그 플래그 하나만 끄고 체인·만료·호스트명 검증은 유지한다.
    """
    session = requests.Session()
    if ca_bundle:
        ctx = ssl.create_default_context(cafile=ca_bundle)
        ctx.verify_flags &= ~getattr(ssl, "VERIFY_X509_STRICT", 0)
        session.mount("https://", _CABundleAdapter(ctx))
    return session


def mask_secret(text, secret):
    """에러 메시지에 섞인 API 키(원문/URL 인코딩 형태)를 *** 로 가린다."""
    if not secret:
        return text
    for form in {secret, quote(secret, safe=""), quote_plus(secret)}:
        text = text.replace(form, "***")
    return text


def fetch_page(session, params):
    secret = params.get("serviceKey", "")
    for attempt in range(1, MAX_RETRY + 1):
        try:
            res = session.get(API_URL, params=params, timeout=30)
            res.raise_for_status()
            return parse_items(res.text)
        except (requests.RequestException, ET.ParseError, RuntimeError) as exc:
            # requests 예외 메시지에는 serviceKey 가 포함된 요청 URL 이 들어갈 수 있다.
            safe_msg = mask_secret(f"{type(exc).__name__}: {exc}", secret)
            if attempt == MAX_RETRY:
                raise RuntimeError(f"API 호출 실패: {safe_msg}") from None
            wait = 2 ** attempt
            print(f"  재시도 {attempt}/{MAX_RETRY - 1} ({safe_msg}) - {wait}s 대기")
            time.sleep(wait)


def fetch_month(session, service_key, lawd_cd, deal_ymd):
    """한 달치 전체(모든 페이지)를 가져온다."""
    rows, page = [], 1
    while True:
        params = {
            "serviceKey": service_key,
            "LAWD_CD": lawd_cd,
            "DEAL_YMD": deal_ymd,
            "pageNo": page,
            "numOfRows": PAGE_SIZE,
        }
        _, total, items = fetch_page(session, params)
        rows.extend(items)
        if not items or len(rows) >= total:
            break
        page += 1
    return rows


def to_record(item, lawd_cd, deal_ymd, batch_id):
    values = [item.get(tag, "") for tag, _ in FIELD_MAP]
    return (lawd_cd, deal_ymd, *values, batch_id)


def replace_month(conn, lawd_cd, deal_ymd, records):
    """같은 (lawd_cd, deal_ymd)를 지우고 다시 넣는다. 한 트랜잭션."""
    with conn:  # 정상 종료 시 COMMIT, 예외 시 ROLLBACK
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM raw.apt_trade WHERE lawd_cd = %s AND deal_ymd = %s",
                (lawd_cd, deal_ymd),
            )
            if records:
                cols = ", ".join(INSERT_COLUMNS)
                execute_values(
                    cur,
                    f"INSERT INTO raw.apt_trade ({cols}) VALUES %s",
                    records,
                )


def count_month(conn, lawd_cd, deal_ymd):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM raw.apt_trade WHERE lawd_cd = %s AND deal_ymd = %s",
            (lawd_cd, deal_ymd),
        )
        return cur.fetchone()[0]


def connect():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5433")),
        dbname=os.environ["POSTGRES_DB"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lawd", default="11215", help="시군구 코드 (기본: 광진구)")
    parser.add_argument("--months", type=int, default=3, help="최근 N개월")
    parser.add_argument("--ym", help="특정 월만 (예: 202610)")
    args = parser.parse_args()

    load_dotenv()
    # Encoding/Decoding 어느 키를 넣어도 동작하도록 한 번 디코딩한다.
    service_key = unquote(os.environ["DATA_GO_KR_API_KEY"])
    months = [args.ym] if args.ym else recent_months(args.months)
    batch_id = datetime.now().strftime("%Y%m%d%H%M%S")

    session = build_session(os.getenv("APT_CA_BUNDLE"))
    conn = connect()
    skipped = []
    try:
        for ym in months:
            items = fetch_month(session, service_key, args.lawd, ym)
            records = [to_record(i, args.lawd, ym, batch_id) for i in items]
            # 이미 데이터가 있는 달에 API가 0건을 주면 이상 응답이므로 지우지 않고 보존한다.
            if not records and count_month(conn, args.lawd, ym) > 0:
                print(f"{args.lawd} {ym}: API 응답 0건 - 기존 데이터를 유지하고 건너뜀 (경고)")
                skipped.append(ym)
                continue
            replace_month(conn, args.lawd, ym, records)
            print(f"{args.lawd} {ym}: {len(records)}건 적재")
    finally:
        conn.close()
    if skipped:
        raise SystemExit(f"API가 빈 응답을 준 달이 있습니다: {', '.join(skipped)}")


if __name__ == "__main__":
    main()
