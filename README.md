# apt — 아파트 매매 실거래가 데이터 파이프라인

국토교통부 공공데이터 API로 서울 광진구 아파트 매매 실거래가를 수집해
**raw → stg → map → mart → api** 계층으로 적재하는 개인 포트폴리오 프로젝트입니다.
Airflow 3 일 배치로 자동화하고, Spring Boot REST API와 Next.js 대시보드로 보여 줍니다.

```
data.go.kr API ──► raw ──► stg ──► map ──► mart ──► api(뷰) ──► Spring Boot ──► Next.js
   (XML)          원본     타입정리   기준표    월 집계    BE용 계층     REST API      대시보드
                     └──────────── Airflow 3 DAG (매일 06:00 KST) ────────────┘
```

## 기술 스택

| 구분 | 사용 |
|---|---|
| 수집 | Python (requests, psycopg2) |
| 저장 | PostgreSQL 16 |
| 오케스트레이션 | Apache Airflow 3.4 (`airflow standalone`) |
| 실행 환경 | Docker Compose (macOS + Colima) |
| API (BE) | Spring Boot 4.1 (Java 21), Spring Data JPA, springdoc-openapi (Swagger) |
| 대시보드 (FE) | Next.js 16 (App Router, TypeScript), Recharts |

## 폴더 구조

```
apt/
├── docker-compose.yml          postgres(데이터 DB, 호스트 5433) / airflow-db(메타DB) / airflow
├── .env                        환경변수 (git 제외)
├── certs/                      TLS 검사 프록시 환경용 CA 번들 (git 제외)
├── backend/                    Spring Boot REST API (api 뷰 조회, 포트 8081)
├── frontend/                   Next.js 대시보드 (포트 3000)
├── dags/apt_trade_daily.py     일 배치 DAG
├── ingest/
│   ├── load_apt_trade.py       API → raw.apt_trade 적재
│   └── requirements.txt
└── db/
    ├── init/01_raw_apt.sql     raw 테이블 DDL (컨테이너 최초 생성 시 1회 자동 실행)
    └── sql/
        ├── 02_stg_apt_trade.sql    stg 뷰
        ├── 03_map_tables.sql       매핑 테이블
        ├── 04_mart.sql             마트 3개
        ├── 05_checks.sql           수동 품질 점검 쿼리
        └── 06_api_views.sql        API용 뷰 4개
```

## 데이터 계층

| 계층 | 객체 | 설명 |
|---|---|---|
| raw | `raw.apt_trade` | API 응답 원문(전부 TEXT) + 요청 파라미터(`lawd_cd`, `deal_ymd`) + 적재 메타(`batch_id`, `ingested_at`) |
| stg | `stg.apt_trade` (뷰) | 공백→NULL, 금액 쉼표 제거·정수 변환, 연/월/일 → `deal_date`, 취소 플래그 `is_canceled`, 일괄 매각 플래그 `is_bulk` |
| map | `map.sgg_code`, `map.apt_name` | 시군구 코드→이름, 단지 코드→표준 단지명(최빈값 자동 시드, 수동 보정 가능) |
| mart | `mart.sgg_price_monthly`, `mart.umd_price_monthly`, `mart.apt_price_monthly` | 시군구/법정동/단지 × 월 집계. 평균·중위가, ㎡당 가격, 전월 대비(%), 3개월 이동평균, 월별 순위. **취소 거래·일괄 매각 제외**, 제외한 일괄 건수는 `bulk_cnt` |
| api | `api.v_sgg_price_monthly`, `api.v_umd_price_monthly`, `api.v_apt_price_monthly`, `api.v_sgg_ranking_latest` | BE가 읽는 뷰. 마트 구조가 바뀌어도 뷰만 맞추면 API는 그대로 둘 수 있음 |

- 가격 단위는 모두 **만원**입니다.

### 일괄 매각 처리

실거래가에는 개인 간 시장 거래 외에, 법인·공공기관이 신축 소형 건물의 수십~수백 세대를 **하루에 통째로 사들인 거래**가 섞여 있습니다.
시세가 아니므로 평균가와 거래량을 크게 왜곡합니다.

- **기준**: 같은 단지·같은 날 5건 이상 + 매수자가 법인 또는 공공기관 → `stg.is_bulk = true`
- **처리**: raw는 보존, stg는 표시만, mart 집계에서 제외하고 제외 건수는 `bulk_cnt`로 남김. `check_mart`가 제외 내역을 경고 로그로 기록
- **근거 (2025-12 ~ 2026-11, 4개 구)**: 6묶음 638건이 해당합니다. 모두 직거래이고, 20㎡ 안팎 신축이며, 가격이 거의 같습니다.
  같은 날 5건 이상이지만 매수자가 개인인 송파 대단지(잠실엘스, 헬리오시티 등) 거래는 시장 거래로 남깁니다. (`05_checks.sql` 5·6번)

| 사례 | 일괄 포함 평균 | 일괄 제외 평균 |
|---|---|---|
| 동대문구 2026-10 (에드가휘경 313건, 법인) | 4.78억, 전월 대비 -51% | **9.79억, +0.1%** |
| 송파구 2026-09 (송파해링턴타워 170건, 공공기관) | 11.95억 → 10월 +70% | **20.61억 → 10월 -1.4%** |
| 광진구 2026-05 (강변스카이타워 55건, 공공기관) | 12.84억, 거래 198건 | **16.47억, 거래 143건** |
- `is_current_month = true`인 달은 신고가 덜 들어와 값이 흔들릴 수 있습니다(실거래 신고 기한 30일).

## 배치 (Airflow DAG `apt_trade_daily`)

```
ingest_<시군구코드> → check_raw → build_stg → build_map → build_mart → check_mart → build_api
```

- **스케줄**: 매일 06:00 (Asia/Seoul), `catchup=False`, `max_active_runs=1`
- **수집 범위**: 매 실행마다 최근 N개월(기본 3)을 월 단위로 다시 받아 덮어씁니다. 늦은 신고, 취소, 등기일자 갱신을 반영하기 위해서입니다.
- **과거 채우기**: UI의 *Trigger DAG w/ config*에서 `months`(1~60)를 12 등으로 올려 실행합니다.
- **대상 시군구**: 환경변수 `APT_LAWD_CODES` (쉼표 구분, 기본 `11215` 광진구). 현재 광진·용산·송파·동대문 4개 구를 수집합니다.
  구를 추가할 때는 `db/sql/03_map_tables.sql`의 `map.sgg_code`에 코드를 넣고, `APT_LAWD_CODES`를 바꾼 뒤 `docker-compose up -d`(컨테이너 재생성으로 환경변수 반영) → `months=12`로 백필합니다.

### 왜 Airflow인가

| 이 파이프라인에 필요한 것 | Airflow가 해 주는 것 | 실제 운영에서 확인한 장면 |
|---|---|---|
| 매일 최근 3개월 재수집 (늦은 신고·취소·정정 반영) | 스케줄 `0 6 * * *` | 이틀 사이 원천에서 빠진 거래 2건이 재수집으로 반영됨 |
| 7단계를 순서대로, 앞 단계 실패 시 중단 | 태스크 의존성 `>>` | `check_raw` 통과 후에만 stg 단계 진행 |
| 시군구별 수집은 동시에 | 태스크 병렬 실행 | ingest 4개가 동시에 돌아 약 7초 만에 완료 |
| 잘못된 데이터가 API까지 가지 않게 | 품질 점검 태스크 실패 시 하위 단계 중단 | 건수 대사(stg = 마트 3개 합계) 통과 후에만 api 갱신 |
| 공공 API의 일시적 실패 | 태스크 재시도 (2회, 5분 간격) | — |
| 과거 데이터 채우기 | 실행 시 파라미터 (`months=12`) | UI에서 12개월 백필 |
| 언제 무엇이 돌았고 왜 실패했는지 | 실행 이력, 태스크별 로그, UI | Grid / Graph 화면 |

이 규모(하루 1회, 수천 건)는 cron + 스크립트로도 돌릴 수 있습니다. 다만 순서 제어, 실패 시 중단, 재시도, 병렬 실행, 이력 조회를 직접 구현해야 합니다.
Airflow는 이를 기본 제공하는 대신 메모리(standalone 약 1.2GB)와 구성 복잡도라는 비용이 있습니다.

### 멱등성과 보호 장치

| 장치 | 동작 |
|---|---|
| 월 단위 교체 | `(lawd_cd, deal_ymd)` 단위로 한 트랜잭션 안에서 DELETE 후 INSERT합니다. 몇 번을 다시 돌려도 결과가 같습니다 |
| 빈 응답 보호 | 이미 데이터가 있는 달에 API가 0건을 주면 지우지 않고 보존한 뒤 실패로 종료합니다 |
| `check_raw` | 대상 시군구의 raw 데이터가 없으면 실패합니다 |
| `check_mart` | stg(취소 제외) 건수와 마트 3개 합계가 다르면 실패합니다. 매핑 누락이나 직전 월 대비 거래 50% 미만은 경고만 남깁니다 |
| 재시도 | 태스크 2회(5분 간격), API 호출 3회(지수 백오프) |

### 보안

- API 키, DB 비밀번호는 `.env`로만 주입하며 저장소에 포함하지 않습니다.
- 수집 스크립트의 재시도·에러 로그에서 `serviceKey`를 `***`로 마스킹합니다.
- TLS 검증은 끄지 않습니다. TLS 검사 프록시가 있는 네트워크에서는 CA 번들을 지정합니다(아래 참고).
- Airflow UI는 로그인 없이 열리는 로컬 학습용 구성이라 `127.0.0.1`에만 노출합니다.

## 실행 방법

### 1. 환경변수 (`.env`)

| 변수 | 설명 |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | 데이터 DB 계정 |
| `DATA_GO_KR_API_KEY` | 공공데이터포털 "국토교통부_아파트 매매 실거래가 상세 자료" 인증키 (Encoding/Decoding 어느 쪽이든 가능) |
| `APT_LAWD_CODES` | (선택) 수집할 시군구 코드, 기본 `11215` |
| `AIRFLOW_CA_BUNDLE` | (선택) 컨테이너 안 CA 번들 경로, 예: `/certs/ca-bundle.pem` |
| `AIRFLOW_JWT_SECRET`, `AIRFLOW_API_SECRET_KEY` | (선택) 미지정 시 로컬 개발용 기본값 사용 |

### 2. 기동

```bash
colima start vzc --memory 4   # (macOS + Colima) Docker VM 시작. 메모리는 최소 4GB
docker-compose up -d      # postgres, airflow-db, airflow 기동
docker-compose ps         # 상태 확인 (airflow가 healthy가 될 때까지 1~2분)
```

- Airflow UI: http://127.0.0.1:8080
- 헬스체크: `GET /api/v2/monitor/health`
- DAG를 처음 켜면 `catchup=False`여도 오늘 회차가 즉시 한 번 실행됩니다.
- `airflow standalone`은 약 1.2GB를 사용합니다. VM 메모리가 2GB이면 DAG 실행 중 메모리 부족(OOM)으로 api-server(UI)가 종료되어 컨테이너가 unhealthy가 됩니다.
  확인: `colima ssh -p vzc -- sh -c 'sudo dmesg | grep -i "killed process"'`

### 3. (선택) TLS 검사 프록시 환경

HTTPS를 자체 인증서로 재서명하는 네트워크에서는 공용 루트와 해당 CA를 함께 담은 번들을 만들어 둡니다.

```bash
security find-certificate -a -p \
  /System/Library/Keychains/SystemRootCertificates.keychain \
  /Library/Keychains/System.keychain > certs/ca-bundle.pem
```

이 번들은 두 곳에서 사용합니다.

| 위치 | 용도 | 설정 |
|---|---|---|
| Colima VM의 Docker 데몬 | 이미지 pull (`x509: certificate signed by unknown authority` 해결) | 아래 명령으로 VM 신뢰 저장소에 등록. `colima delete` 후에는 다시 등록 |
| Airflow 컨테이너의 수집 스크립트 | data.go.kr 호출 | `.env`에 `AIRFLOW_CA_BUNDLE=/certs/ca-bundle.pem` |

```bash
colima ssh -p vzc -- sh -c "sudo install -m 644 '$PWD/certs/ca-bundle.pem' \
  /usr/local/share/ca-certificates/apt-ca-bundle.crt && sudo update-ca-certificates && sudo systemctl restart docker"
```

컨테이너의 Python 3.13은 `VERIFY_X509_STRICT`를 기본으로 켜는데, 프록시 CA에 key usage 확장이 없으면 이 검사에서만 거절됩니다
(`CA cert does not include key usage extension`). 수집 스크립트는 번들을 지정한 경우 이 플래그 하나만 끄고 체인·만료·호스트명 검증은 유지합니다.
로컬에서 Python을 직접 실행할 때는 `truststore`가 macOS 키체인을 사용합니다.

### 4. 로컬에서 수동 실행 (Airflow 없이)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r ingest/requirements.txt

python ingest/load_apt_trade.py                # 광진구, 최근 3개월
python ingest/load_apt_trade.py --months 12    # 최근 12개월
python ingest/load_apt_trade.py --ym 202610    # 특정 월만

# SQL 계층 생성 (02 → 03 → 04 → 06 순서)
for f in 02_stg_apt_trade 03_map_tables 04_mart 06_api_views; do
  docker exec -i apt-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < db/sql/$f.sql
done

# 품질 점검
docker exec -i apt-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/sql/05_checks.sql
```

## REST API (backend/)

`api` 스키마의 뷰를 **읽기 전용**으로 조회합니다. 모든 가격 단위는 만원입니다.

| 엔드포인트 | 읽는 뷰 | 설명 |
|---|---|---|
| `GET /regions/{code}/prices?from=YYYY-MM&to=YYYY-MM&page=0&size=12` | `api.v_sgg_price_monthly` | 시군구 월별 가격, 기간 필터(양 끝 포함), 페이징 |
| `GET /regions/{code}/trend?months=12` | `api.v_sgg_price_monthly` | 최근 N개월 추이(평균가, 3개월 이동평균, 중위가) |
| `GET /regions/ranking?sort=AVG_PRICE\|TRADE_CNT` | `api.v_sgg_ranking_latest` | 진행 중인 달을 제외한 최근 완결 월의 시군구 순위 |

- **읽기 전용**: 엔티티는 `@Immutable`, 리포지토리는 쓰기 메서드가 없는 `Repository` 상속, 커넥션은 `read-only`입니다. `ddl-auto: none`이라 스키마는 `db/sql`만 관리합니다.
- **오류 응답**: 잘못된 코드·월·범위는 400, 데이터가 없는 시군구는 404이며, 모두 RFC 9457 Problem Details(JSON)로 응답합니다.
- **설정**: 루트 `.env`를 `spring.config.import`로 읽으므로 설정 파일에 비밀값이 없습니다.

```bash
cd backend
./gradlew test              # 단위·웹 계층 테스트 (DB 불필요)
./gradlew integrationTest   # 로컬 apt-postgres(5433)의 실제 뷰 조회 (docker-compose up 필요)
./gradlew bootRun           # http://localhost:8081/swagger-ui.html
```

TLS 검사 프록시 환경에서 Gradle이 의존성을 받을 때 `PKIX path building failed`가 나면, 그 셸에서만 macOS 키체인을 신뢰 저장소로 지정합니다.

```bash
export JAVA_TOOL_OPTIONS="-Djavax.net.ssl.trustStoreType=KeychainStore -Djavax.net.ssl.trustStore=NONE"
```

## 대시보드 (frontend/)

BE를 서버 컴포넌트에서 호출하는 Next.js 대시보드입니다. 자세한 내용은 [frontend/README.md](frontend/README.md)를 참고하세요.

```bash
cd frontend && npm install && npm run dev   # http://localhost:3000 (backend 실행 필요)
```

- 지역 선택(광진·동대문·송파·용산), 최근 완결 월 지표 4개, 가격 추이(평균가·3개월 이동평균·중위가), 거래 건수, 월별 표(페이징), 시군구 평균가 순위(가로 막대, 클릭 시 이동)
- 지역·기간 필터는 URL 쿼리(`?region=11710&months=6`)로 동작해 링크 공유가 가능합니다.
- 진행 중인 달은 표본이 적어 가격 차트에서 제외하고, 거래 건수와 표에서만 `집계 중`으로 표시합니다.
- 라이트·다크 모드, 모바일 폭(390px) 대응

## 배포 (Vercel + Vercel Blob)

공개 사이트는 **대시보드만** Vercel에 올립니다. 백엔드·DB·Airflow는 로컬에서 돌고, 대시보드가 쓰는 집계 데이터만 JSON 파일 하나로 Vercel Blob(파일 보관함)에 올립니다. 사이트는 요청 때마다 그 파일을 읽으므로 **git push·재배포 없이** 매일 최신 데이터가 반영됩니다.

```
[로컬] Airflow 일 배치 → Postgres(api 뷰) → publish_dashboard (scripts/export_dashboard_data.py --upload)
                                              ↓ dashboard.json 덮어쓰기 (집계값이 바뀐 날만)
[Vercel Blob] https://<store>.public.blob.vercel-storage.com/dashboard.json
                                              ↑ 요청마다 읽음 (CDN 캐시 최대 60초)
[Vercel] 대시보드 (DATA_SOURCE=static, DASHBOARD_DATA_URL=위 주소)
```

- 파일에는 시군구 × 월 집계값과 최근 완결 월 순위만 담습니다 (공개 데이터 집계, 개별 거래·개인정보 없음, 약 13KB). 공개 URL로 둡니다.
- 데이터 출처 전환: `DATA_SOURCE=static` + `DASHBOARD_DATA_URL`(Blob) / `DATA_SOURCE=static`만(저장소의 `frontend/data/dashboard.json`) / 미설정(`api`, 로컬 BE 호출).
- `BLOB_READ_WRITE_TOKEN`이 없으면 `publish_dashboard`는 실패가 아니라 '건너뜀'으로 끝납니다.
- Airflow는 노트북(Colima)이 켜져 있어야 돌기 때문에, 꺼져 있던 날은 다음 실행 때 반영됩니다.

**처음 연결**
1. Vercel에 GitHub 계정으로 로그인 → *Add New → Project* → 이 저장소 import
2. **Root Directory**: `frontend` (Framework는 Next.js로 자동 인식)
3. Vercel 프로젝트 → *Storage* → Blob 스토어 생성(Public) → 토큰 `BLOB_READ_WRITE_TOKEN`을 로컬 `.env`에 추가
4. `docker-compose up -d airflow` (토큰 반영) → Airflow에서 DAG 실행 → `publish_dashboard` 로그의 업로드 URL 확인
5. **Environment Variables**: `DATA_SOURCE` = `static`, `DASHBOARD_DATA_URL` = 4의 URL → Redeploy (이후로는 재배포 불필요)

**수동 업로드** (Airflow 없이)
```bash
.venv/bin/python scripts/export_dashboard_data.py --upload   # api 뷰 → Vercel Blob
```

## 진행 상황

- [x] 수집 스크립트 (멱등 적재, 빈 응답 보호, 로그 마스킹)
- [x] stg / map / mart / api 계층 SQL
- [x] Airflow 3 DAG + docker-compose (가짜 API 서버로 7단계 전체 성공, 재실행 시 건수 불변 확인)
- [x] 실제 Docker 환경에서 첫 기동 점검
  - [x] 공식 Airflow 이미지에 `psycopg2` 2.9.13, `asyncpg` 0.32.0 포함 확인
  - [x] 실제 data.go.kr API 호출 (TLS 검사 프록시 환경 대응 포함)
  - [x] 메타DB는 `postgresql+psycopg2://` URL만으로 정상 동작
  - [x] DAG 첫 회차 7단계 전체 성공
- [x] `months=12`로 과거 12개월 백필 (2025-12 ~ 2026-11, 923건)
  - 이틀 전 수집본 대비 원천에서 거래 2건이 빠진 것이 재수집으로 반영됨 → 최근 N개월 재수집 설계의 근거
- [x] **BE**: Spring Boot REST API (`api` 뷰 조회)
  - [x] `GET /regions/{code}/prices`, `GET /regions/{code}/trend`, `GET /regions/ranking`
  - [x] 페이징, Problem Details 예외 처리, Swagger
  - [x] 테스트: 단위·웹 계층 12개, 실제 DB 통합 4개
  - [ ] API 전용 읽기 전용 DB 계정 (현재는 파이프라인과 같은 계정 사용)
- [x] **FE**: Next.js + TypeScript 대시보드 (차트, 표, 지역·기간 필터, 다크 모드)
- [x] **배포**: Vercel + Vercel Blob (Airflow가 매일 데이터 파일 갱신, 재배포 불필요)

## 데이터 출처

- [공공데이터포털 — 국토교통부_아파트 매매 실거래가 상세 자료](https://www.data.go.kr/)
