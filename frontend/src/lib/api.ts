// BE(Spring Boot) 응답 타입과 호출 함수. 서버 컴포넌트에서만 호출한다(브라우저 → BE 직접 호출 없음, CORS 불필요).
// 가격 단위는 모두 만원.
import "server-only";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8081";

export type MonthlyPrice = {
  ym: string;
  tradeCnt: number;
  avgPriceMan: number | null;
  medianPriceMan: number | null;
  avgPricePerM2Man: number | null;
  momChangePct: number | null;
  ma3AvgPriceMan: number | null;
  currentMonth: boolean;
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

export function getTrend(code: string, months: number) {
  return get<Trend>(`/regions/${code}/trend?months=${months}`);
}

export function getPrices(code: string, page: number, size = 12) {
  return get<PageResponse<MonthlyPrice>>(`/regions/${code}/prices?page=${page}&size=${size}`);
}

export function getRanking() {
  return get<Ranking>(`/regions/ranking`);
}
