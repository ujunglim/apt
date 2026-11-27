"""국토교통부 아파트 매매 실거래가(상세) API -> raw.apt_trade 적재.

월 단위로 [API 호출 -> 트랜잭션(DELETE 후 INSERT)]을 반복하므로
같은 월을 몇 번 다시 돌려도 결과가 같다(멱등).

실행 예:
    python ingest/load_apt_trade.py                  # 광진구, 최근 3개월
    python ingest/load_apt_trade.py --months 6       # 최근 6개월
    python ingest/load_apt_trade.py --ym 202610      # 특정 월만
"""
import argparse                       # 실행 옵션(--months 6 등)을 읽는 도구
import os                             # 환경변수 읽기 (os.getenv)
import ssl                            # HTTPS 인증서 설정
import time                           # time.sleep(): 재시도 전에 기다리기
import xml.etree.ElementTree as ET    # XML 파싱 도구. 이름이 길어서 ET로 줄여 씀
from datetime import datetime         # 현재 시각 (batch_id, 최근 N개월 계산)
from urllib.parse import quote, quote_plus, unquote   # URL 인코딩/디코딩 (API 키 처리)

# 회사 인증서 처리
try:  # 맥(회사 네트워크): 키체인의 사내 인증서를 사용. 컨테이너에는 없으므로 건너뛴다.
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

import psycopg2                                 # Postgres DB 접속 드라이버
import requests                                 # HTTP 요청 (JS의 fetch/axios)
from psycopg2.extras import execute_values      # 여러 행을 한 번에 INSERT 하는 도구
from requests.adapters import HTTPAdapter       # HTTPS 연결 방식 커스터마이즈 (인증서용)

# env 읽기 도구
try:
    from dotenv import load_dotenv # load_dotenv: .env파일을 읽어 환경변수로 만듦
except ImportError:  # 컨테이너에서는 환경변수가 이미 주입되어 있다.
    def load_dotenv(*_args, **_kwargs):
        return False

# 국토부 매매 API 주소. 환경변수 APT_API_URL 로 주소를 바꿀 수 있다 (가짜 서버로 테스트할 때).
API_URL = os.getenv("APT_API_URL") or (
    "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/"
    "getRTMSDataSvcAptTradeDev"
)
PAGE_SIZE = 1000
MAX_RETRY = 3

# API 응답 필드와 DB 컬럼 매핑목록. XML 태그(camelCase) -> raw.apt_trade 컬럼(snake_case)
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
INSERT_COLUMNS = ["lawd_cd", "deal_ymd", *DATA_COLUMNS, "batch_id"]  # lawd_cd: 요청할때 넣는 구 코드. deal_ymd: 요청할 때 넣은 월. batch_id: 이번 실행의 ID. (이 행은 언제 실행에서 들어왔냐 추적)

# 최근 n개월 목록 만들기
def recent_months(n, today=None):
    """오늘이 속한 달부터 거꾸로 n개월의 YYYYMM 리스트(오래된 순)."""
    today = today or datetime.now()
    year, month = today.year, today.month
    result = []
    for _ in range(n):
        result.append(f"{year}{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12 # 1월에서 한달 전은 작년 12월로
    return list(reversed(result))

# API가 준 XML 응답을 파이썬이 다루기 쉬운 dict로 바꾸기
def parse_items(xml_text):
    root = ET.fromstring(xml_text) # XML 문자열을 트리객체로 바꿈
    code = (root.findtext("header/resultCode") or "").strip() # 헤더에서 성공 실패 여부 등 파싱
    msg = (root.findtext("header/resultMsg") or "").strip()
    # 결과 코드가 00, 000 이 아니면 실패로 보고 에러던짐
    if code not in ("00", "000"):
        raise RuntimeError(f"API 오류 resultCode={code} msg={msg}")
    total = int((root.findtext("body/totalCount") or "0").strip() or 0) # 전체 건수. 페이지 판단할때 씀
    items = []
    for item in root.iter("item"):
        items.append({child.tag: (child.text or "").strip() for child in item})
    return code, total, items

# 회사망, 컨테이너에서 HTTPS 인증서 처리
class _CABundleAdapter(HTTPAdapter): # HTTPAdapter를 상속한 클래스
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
    # 회사 프록시 환경에서 TLS 검증을 끄지 않고, CA 번들을 지정하는 방식으로 해결
    # 회사망 환경 때문에만 필요한 코드라서 지금은 이 한 줄만 기억하시면 됩니다. "컨테이너에서 회사 인증서를 믿게 하려고, 인증서 파일을 지정하는 HTTP 클라이언트를 만든다." 나중에 AWS로 옮기면 회사망을 거치지 않으니 필요 없어질 수도 있습니다
    session = requests.Session() # HTTPS 클라이언트 객체 생성 axios.create()
    if ca_bundle:
        ctx = ssl.create_default_context(cafile=ca_bundle)
        ctx.verify_flags &= ~getattr(ssl, "VERIFY_X509_STRICT", 0)
        session.mount("https://", _CABundleAdapter(ctx))
    return session


def mask_secret(text, secret):
    """에러 메시지에 섞인 API 키(원문/URL 인코딩 형태)를 *** 로 가린다."""
    if not secret:
        return text
    for form in {secret, quote(secret, safe=""), quote_plus(secret)}: # {a, b, c} 집합(set)은 중복이 자동으로 제거되는 리스트. quote(): URL(/) 인코딩, quote_plus(): 공백을 +로 인코딩
        text = text.replace(form, "***")
    return text

# 한 페이지 API 호출
def fetch_page(session, params):
    secret = params.get("serviceKey", "") # 요청 파라미터에서 API키를 꺼내둠. 에러메시지를 가릴 때 씀
    for attempt in range(1, MAX_RETRY + 1):
        try:
            res = session.get(API_URL, params=params, timeout=30) # GET 요청을 보냄 파라미터 붙여서, 30초 안에 응답 없으면 실패로 봄 (이게 없으면 서버가 멈췄을때 무한정 기다림)
            res.raise_for_status() # 상태가 4xx, 5xx이면 에러를 던짐.
            return parse_items(res.text) # 성공하면 XML을 파싱해서 결과를 반환하고 끝남
        except (requests.RequestException, ET.ParseError, RuntimeError) as exc: # 세 종류의 에러를 잡음 (네트워크, 타임아웃, 4xx/5xx, XML이 깨져서 옴, )
            # requests 예외 메시지에는 serviceKey 가 포함된 요청 URL 이 들어갈 수 있다.
            safe_msg = mask_secret(f"{type(exc).__name__}: {exc}", secret)
            if attempt == MAX_RETRY: # 3번째 시도 실패시 에러 던짐 -> airflow 태스크 실패
                raise RuntimeError(f"API 호출 실패: {safe_msg}") from None
            wait = 2 ** attempt
            print(f"  재시도 {attempt}/{MAX_RETRY - 1} ({safe_msg}) - {wait}s 대기")
            time.sleep(wait)

# 여러 페이지 이어 받기
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
        rows.extend(items) # 기존 rows에 이번 페이지 거래들을 이어 붙임
        if not items or len(rows) >= total:
            break # 페이지가 비어있거나 모든 갯수가 전체 건수에 도달하면 끝
        page += 1
    return rows # 그 달 거래 전체를 반환 {key: value, ...}

# API dict를 DB에 넣을 튜플로 바꾸기. INSERT_COLUMNS와 동일한 순서로 정리
def to_record(item, lawd_cd, deal_ymd, batch_id):
    values = [item.get(tag, "") for tag, _ in FIELD_MAP] # 태그가 없으면 빈 문다열을 넣어서, 특정 필드가 빠져도 컬럼 갯수가 항상 동
    return (lawd_cd, deal_ymd, *values, batch_id)


# DB에 저장하기, 멱등성
def replace_month(conn, lawd_cd, deal_ymd, records):
    """같은 (lawd_cd, deal_ymd)를 지우고 다시 넣는다. 이 블록 전체가 한 트랜잭션."""
    with conn:  # 정상 종료 시 COMMIT, 예외 시 ROLLBACK
        with conn.cursor() as cur: # 커서는 sql을 보내고 결과를 받는 도구, 블록이 끝나면 자동으로 닫힘
            # 이 구, 이 달의 기존 데이터를 지움
            cur.execute(
                "DELETE FROM raw.apt_trade WHERE lawd_cd = %s AND deal_ymd = %s",  # %s는 자리표시자 아래 튜플을 안전하게 넣어줌
                (lawd_cd, deal_ymd),
            )
            # 넣을 데이터가 있을때만 insert
            if records:
                cols = ", ".join(INSERT_COLUMNS)
                execute_values(
                    cur,
                    f"INSERT INTO raw.apt_trade ({cols}) VALUES %s",
                    records,
                )
# 이 구, 이 달 데이터가 지금 몇 건 있는 지 셈
def count_month(conn, lawd_cd, deal_ymd):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM raw.apt_trade WHERE lawd_cd = %s AND deal_ymd = %s",
            (lawd_cd, deal_ymd),
        )
        return cur.fetchone()[0]

# db 연결. Postgres db에 접속하고 연결 객체를 돌려줌
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
    months = [args.ym] if args.ym else recent_months(args.months) # --ym을 주면 그 달 하나만 아니면 최근 n개월
    batch_id = datetime.now().strftime("%Y%m%d%H%M%S") # 현재 시각을 "20261126060012" 같은 문자열로 만듦

    # HTTP 클라이언트와 DB 연결을 만듦. DB 연결은 하나를 만들어 모든 달에 재사용함
    session = build_session(os.getenv("APT_CA_BUNDLE"))
    conn = connect()
    skipped = [] # 빈 응답 때문에 건넌뛴 달을 모을 리스트
    # 달마다 반복하는 트랜잭션
    try:
        for ym in months:
            items = fetch_month(session, service_key, args.lawd, ym)         # API에서 그 달 전체 받기
            records = [to_record(i, args.lawd, ym, batch_id) for i in items] # DB 행 형태로 변환
            # 이미 데이터가 있는 달에 API가 0건을 주면 이상 응답이므로 지우지 않고 보존한다.
            if not records and count_month(conn, args.lawd, ym) > 0:         # 빈 응답 보호
                print(f"{args.lawd} {ym}: API 응답 0건 - 기존 데이터를 유지하고 건너뜀 (경고)")
                skipped.append(ym)
                continue
            replace_month(conn, args.lawd, ym, records)                      # 지우고 넣기 (트랜잭션)
            print(f"{args.lawd} {ym}: {len(records)}건 적재")
    finally:
        conn.close() # db 연결 닫기
    if skipped:
        raise SystemExit(f"API가 빈 응답을 준 달이 있습니다: {', '.join(skipped)}")  # 메시지 출력하고 종료 코드 1 (실패)로 끝남 = process.exit(1)


if __name__ == "__main__":
    main()
