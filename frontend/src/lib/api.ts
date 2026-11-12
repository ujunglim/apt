// 대시보드 데이터 접근. 서버 컴포넌트에서만 호출한다(브라우저 → BE 직접 호출 없음, CORS 불필요).
// 가격 단위는 모두 만원.
//
// 데이터 출처는 환경변수 DATA_SOURCE 로 고른다.
//   - "api"(기본): backend(Spring Boot) REST API 를 호출한다. 로컬 개발용.
//   - "static": 스냅샷 JSON 을 읽는다. 백엔드·DB 없이 배포(Vercel)할 때 쓴다.
//     DASHBOARD_DATA_URL 이 있으면 그 주소(Vercel Blob)를 요청마다 읽고, 없으면 저장소의 data/dashboard.json 을 쓴다.
//     스냅샷은 scripts/export_dashboard_data.py 가 api 뷰에서 만들며(Airflow 가 매일 Blob 에 올림), 형식은 BE 응답과 같다.
import "server-only";
import { cache } from "react";
import bundledSnapshot from "../../data/dashboard.json";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8081";
const STATIC = process.env.DATA_SOURCE === "static";
const DATA_URL = process.env.DASHBOARD_DATA_URL;

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

export async function getTrend(code: string, months: number): Promise<Trend> {
  if (STATIC) {
    // BE 와 같은 규칙: 최근 N개월을 오래된 달부터
    const r = await staticRegion(code);
    return { sggCd: r.sggCd, sggNm: r.sggNm, points: r.months.slice(-months) };
  }
  return get<Trend>(`/regions/${code}/trend?months=${months}`);
}

export async function getPrices(code: string, page: number, size = 12): Promise<PageResponse<MonthlyPrice>> {
  if (STATIC) {
    const all = (await staticRegion(code)).months;
    return {
      content: all.slice(page * size, page * size + size),
      page,
      size,
      totalElements: all.length,
      totalPages: Math.ceil(all.length / size),
    };
  }
  return get<PageResponse<MonthlyPrice>>(`/regions/${code}/prices?page=${page}&size=${size}`);
}

export async function getRanking(): Promise<Ranking> {
  if (STATIC) return (await loadSnapshot()).ranking;
  return get<Ranking>(`/regions/ranking`);
}

/** 헤더의 갱신 주기 문구. 데이터를 읽지 않아 정적 셸에서도 쓸 수 있다. */
export const refreshLabel = STATIC && !DATA_URL ? "정기 스냅샷" : "매일 06:00 갱신";

/** 스냅샷 생성 시각 (static 모드에서 화면에 "데이터 기준"으로 보여 준다). api 모드면 null. */
export async function getSnapshotTime(): Promise<string | null> {
  return STATIC ? (await loadSnapshot()).generatedAt : null;
}

type StaticRegion = { sggCd: string; sggNm: string; months: MonthlyPrice[] };
type Snapshot = { generatedAt: string; regions: Record<string, StaticRegion>; ranking: Ranking };

// 한 요청 안에서 여러 함수가 불러도 Blob 은 한 번만 읽는다 (React cache 는 요청 단위).
const loadSnapshot = cache(async (): Promise<Snapshot> => {
  if (!DATA_URL) return bundledSnapshot as Snapshot;
  let res: Response;
  try {
    // 기본(캐시 없음) fetch: 요청마다 읽는다. Blob CDN 이 최대 60초 캐시하므로 갱신은 1분 안에 보인다.
    res = await fetch(DATA_URL, { headers: { Accept: "application/json" } });
  } catch {
    throw new ApiError(503, "대시보드 데이터 파일에 연결할 수 없습니다.");
  }
  if (!res.ok) throw new ApiError(res.status, `대시보드 데이터 파일을 읽지 못했습니다 (${res.status}).`);
  return res.json() as Promise<Snapshot>;
});

async function staticRegion(code: string): Promise<StaticRegion> {
  const r = (await loadSnapshot()).regions[code];
  if (!r) throw new ApiError(404, `시군구 코드 ${code}의 데이터가 없습니다.`);
  return r;
}
