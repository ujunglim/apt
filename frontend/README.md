# frontend — 서울 아파트 실거래가 대시보드 (Next.js)

`backend`(Spring Boot, 8081)의 REST API를 **서버 컴포넌트에서** 호출해 그리는 대시보드입니다.
브라우저가 BE를 직접 부르지 않으므로 CORS 설정이 필요 없습니다.

```bash
npm install
npm run dev          # http://localhost:3000  (backend 가 8081 에서 실행 중이어야 함)
npm run build && npm run start
```

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `API_BASE_URL` | `http://localhost:8081` | backend 주소 (서버에서만 사용) |
| `DATA_SOURCE` | (미설정 = `api`) | `static`이면 backend 대신 `data/dashboard.json` 스냅샷을 읽음 (Vercel 배포용) |

TLS 검사 프록시 환경에서 `npm install`이 인증서 오류를 내면 그 셸에서만 CA 번들을 지정합니다.

```bash
export NODE_EXTRA_CA_CERTS=../certs/ca-bundle.pem
```

## 구성

- `src/app/page.tsx` — 정적 헤더 + `Suspense` 안에서 `searchParams`(기간·페이지)를 읽어 BE 3개 엔드포인트를 동시에 호출
- `src/components/` — 지표 타일, 가격 추이(라인), 거래 건수(막대), 월별 표, 시군구 순위(가로 막대 + 표)
- 지역(`?region=`)·기간(`?months=`)·표 페이지(`?page=`)는 URL 쿼리로 관리해 링크를 공유할 수 있습니다. 지역 목록은 순위 API에서 받아 수집 구를 늘리면 자동으로 나타납니다.
- `src/lib/api.ts` — BE 응답 타입과 호출 (`server-only`), Problem Details 의 `detail`을 오류 메시지로 사용. `DATA_SOURCE=static`이면 같은 형식의 JSON 스냅샷에서 응답
- `data/dashboard.json` — 정적 배포용 스냅샷 (`scripts/export_dashboard_data.py`가 생성)
- `src/app/error.tsx` — BE가 꺼져 있거나 오류일 때의 화면

## 차트 원칙

- 가격(억 원)과 거래 건수(건)는 단위가 달라 **별도 차트**로 그립니다 (이중 축 금지).
- **진행 중인 달은 가격 차트에서 제외**합니다. 신고 기한(30일) 전이라 표본이 적어(예: 4건) 추세를 왜곡하기 때문입니다. 거래 건수 차트에서는 옅은 막대로, 표에서는 `집계 중` 배지로 보여 줍니다.
- 선은 직선으로 잇습니다 (곡선 보간은 실제 값 밖으로 튀어나옴).
- 시리즈 색 3개는 색각 이상 구분도(CVD ΔE ≥ 9.2)를 라이트·다크 모두 검증했고, 모든 값은 표로도 확인할 수 있습니다.
