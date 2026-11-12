// 대시보드 데이터 접근. 서버 컴포넌트에서만 호출한다(브라우저 → BE 직접 호출 없음, CORS 불필요).
// 가격 단위는 모두 만원.
//
// 데이터 출처는 환경변수 DATA_SOURCE 로 고른다.
//   - "api"(기본): backend(Spring Boot) REST API 를 호출한다. 로컬 개발용.
//   - "static": data/dashboard.json 스냅샷을 읽는다. 백엔드·DB 없이 배포(Vercel)할 때 쓴다.
//     스냅샷은 scripts/export_dashboard_data.py 가 api 뷰에서 만들며, 형식은 BE 응답과 같다.
import "server-only";
import snapshot from "../../data/dashboard.json";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8081";
const STATIC = process.env.DATA_SOURCE === "static";

export type MonthlyPrice = {
  ym: string;
  tradeCnt: number;
  avgPriceMan: number | null;
  medianPriceMan: number | null;
  avgPricePerM2Man: number | null;
  momChangePct: number | null;
  ma3AvgPriceMan: number | null;
  currentMonth: boolean;
  bulkCnt: number; // 집계에서 뺀 일괄 매각 건수 (가격·건수는 이를 제외한 시장 거래 기준)
};

export type PageResponse<T> = {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type TrendPoint = {
  ym: string;
  avgPriceMan: number | null;
  ma3AvgPriceMan: number | null;
  medianPriceMan: number | null;
  momChangePct: number | null;
  tradeCnt: number;
  currentMonth: boolean;
  bulkCnt: number;
};

export type Trend = { sggCd: string; sggNm: string; points: TrendPoint[] };

export type RankingItem = {
  rank: number;
  sggCd: string;
  sggNm: string;
  tradeCnt: number;
  avgPriceMan: number | null;
  medianPriceMan: number | null;
  avgPricePerM2Man: number | null;
  momChangePct: number | null;
};

export type Ranking = { ym: string | null; sort: "AVG_PRICE" | "TRADE_CNT"; items: RankingItem[] };

/** BE 가 준 Problem Details 의 detail 을 메시지로 올린다. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { headers: { Accept: "application/json" } });
  } catch {
    throw new ApiError(503, `API 서버(${API_BASE_URL})에 연결할 수 없습니다. backend 가 실행 중인지 확인하세요.`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(res.status, body?.detail ?? `API 오류 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function getTrend(code: string, months: number): Promise<Trend> {
  if (STATIC) {
    // BE 와 같은 규칙: 최근 N개월을 오래된 달부터
    const r = staticRegion(code);
    return Promise.resolve({ sggCd: r.sggCd, sggNm: r.sggNm, points: r.months.slice(-months) });
  }
  return get<Trend>(`/regions/${code}/trend?months=${months}`);
}

export function getPrices(code: string, page: number, size = 12): Promise<PageResponse<MonthlyPrice>> {
  if (STATIC) {
    const all = staticRegion(code).months;
    return Promise.resolve({
      content: all.slice(page * size, page * size + size),
      page,
      size,
      totalElements: all.length,
      totalPages: Math.ceil(all.length / size),
    });
  }
  return get<PageResponse<MonthlyPrice>>(`/regions/${code}/prices?page=${page}&size=${size}`);
}

export function getRanking(): Promise<Ranking> {
  if (STATIC) return Promise.resolve(snapshot.ranking as Ranking);
  return get<Ranking>(`/regions/ranking`);
}

/** 스냅샷 생성 시각 (static 모드에서 화면에 "데이터 기준"으로 보여 준다). api 모드면 null. */
export function getSnapshotTime(): string | null {
  return STATIC ? snapshot.generatedAt : null;
}

type StaticRegion = { sggCd: string; sggNm: string; months: MonthlyPrice[] };

function staticRegion(code: string): StaticRegion {
  const r = (snapshot.regions as Record<string, StaticRegion>)[code];
  if (!r) throw new ApiError(404, `시군구 코드 ${code}의 데이터가 없습니다.`);
  return r;
}
