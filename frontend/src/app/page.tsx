import Link from "next/link";
import { Suspense } from "react";
import PriceTable from "@/components/PriceTable";
import RankingChart from "@/components/RankingChart";
import RankingTable from "@/components/RankingTable";
import StatTiles from "@/components/StatTiles";
import ThemeToggle from "@/components/ThemeToggle";
import TrendChart from "@/components/TrendChart";
import VolumeChart from "@/components/VolumeChart";
import { getPrices, getRanking, getSnapshotTime, getTrend } from "@/lib/api";

const DEFAULT_REGION = "11215"; // 광진구 (가장 먼저 수집한 구)
const PERIODS = [
  { months: 6, label: "6개월" },
  { months: 12, label: "1년" },
  { months: 60, label: "전체" },
] as const;
const DEFAULT_MONTHS = 12;

type Search = { region?: string; months?: string; page?: string };

// 헤더는 정적이라 바로 보내고, URL 쿼리(searchParams)를 읽는 대시보드 본문은 요청 시점에 스트리밍한다.
export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <main className="container">
      <header className="header">
        <div>
          <h1>서울 아파트 매매 실거래가</h1>
          <p>국토교통부 실거래가 공개 데이터 · {getSnapshotTime() ? "정기 스냅샷" : "매일 06:00 갱신"} · 취소·일괄 매각 제외</p>
        </div>
        <ThemeToggle />
      </header>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard searchParams={searchParams as Promise<Search>} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const months = parseMonths(sp.months);
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);

  // 구 목록(순위)을 먼저 받아, 목록에 없는 코드(오타·수집 안 하는 구)는 기본 구로 돌린다.
  const ranking = await getRanking();
  const known = new Set(ranking.items.map((r) => r.sggCd));
  const region = sp.region && (known.has(sp.region) || known.size === 0) ? sp.region : DEFAULT_REGION;

  // 선택 구의 추이·표는 서로 독립이라 동시에 보낸다
  const [trend, prices] = await Promise.all([getTrend(region, months), getPrices(region, page)]);

  // 링크는 현재 선택(구·기간)을 유지한다. 구나 기간을 바꾸면 표 페이지는 처음으로.
  const href = (q: { region?: string; months?: number; page?: number }) => {
    const params = new URLSearchParams();
    const r = q.region ?? region;
    const m = q.months ?? months;
    if (r !== DEFAULT_REGION) params.set("region", r);
    if (m !== DEFAULT_MONTHS) params.set("months", String(m));
    if (q.page) params.set("page", String(q.page));
    const s = params.toString();
    return s ? `/?${s}` : "/";
  };

  // 구 목록은 순위 API에서 가져온다 (수집 구를 늘리면 화면 코드 수정 없이 나타난다). 이름 가나다순으로 고정.
  const regions = [...ranking.items].sort((a, b) => a.sggNm.localeCompare(b.sggNm, "ko"));
  if (!regions.some((r) => r.sggCd === region)) {
    regions.push({ ...regions[0], sggCd: region, sggNm: trend.sggNm });
  }
  const regionHrefs = Object.fromEntries(regions.map((r) => [r.sggCd, href({ region: r.sggCd })]));

  return (
    <>
      {/* 필터는 한 줄, 아래 차트 전체에 적용된다 */}
      <div className="filters">
        <nav className="filter-group" aria-label="지역">
          <span className="label">지역</span>
          {regions.map((r) => (
            <Link key={r.sggCd} href={regionHrefs[r.sggCd]} className="chip" aria-current={r.sggCd === region} scroll={false}>
              {r.sggNm}
            </Link>
          ))}
        </nav>
        <nav className="filter-group" aria-label="기간">
          <span className="label">기간</span>
          {PERIODS.map((p) => (
            <Link key={p.months} href={href({ months: p.months })} className="chip" aria-current={p.months === months} scroll={false}>
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <h2 className="region-title">{trend.sggNm}</h2>
      <SnapshotNote />

      <StatTiles points={trend.points} />

      <div className="grid-2">
        <section className="card">
          <h2>가격 추이</h2>
          <p className="sub">월 평균가 · 3개월 이동평균 · 중위가 (억 원) · 완결된 달만 표시</p>
          <TrendChart points={trend.points} />
        </section>
        <section className="card">
          <h2>거래 건수</h2>
          <p className="sub">월별 매매 신고 건수</p>
          <VolumeChart points={trend.points} />
        </section>
      </div>

      <div className="stack">
        <section className="card">
          <h2>월별 상세</h2>
          <p className="sub">차트의 모든 값을 표로 확인할 수 있습니다. 집계 중인 달은 신고 기한(30일)이 지나야 확정됩니다. 법인·공공기관의 일괄 매각은 시세를 왜곡해 제외합니다.</p>
          <PriceTable data={prices} hrefForPage={(p) => href({ page: p })} />
        </section>
        <section className="card">
          <h2>시군구 평균가 순위</h2>
          <p className="sub">
            {ranking.ym ? `${ranking.ym.replace("-", "년 ")}월` : ""} 기준 (진행 중인 달 제외) · 막대나 이름을 누르면 그 구로 이동합니다
          </p>
          {ranking.items.length > 0 && <RankingChart items={ranking.items} selected={region} hrefs={regionHrefs} />}
          <RankingTable ranking={ranking} selected={region} hrefs={regionHrefs} />
        </section>
      </div>
    </>
  );
}

// 정적 배포(DATA_SOURCE=static)에서는 데이터가 언제 기준인지 알려 준다.
function SnapshotNote() {
  const t = getSnapshotTime();
  if (!t) return null;
  const kst = new Date(t).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
  return <p className="note" style={{ margin: "0 0 8px" }}>데이터 기준: {kst} (정적 스냅샷)</p>;
}

function parseMonths(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return PERIODS.some((p) => p.months === n) ? n : DEFAULT_MONTHS;
}

function DashboardSkeleton() {
  // 레이아웃이 튀지 않게 실제 배치와 같은 높이를 잡아 둔다
  return (
    <div aria-busy="true" aria-label="불러오는 중" style={{ marginTop: 24 }}>
      <div className="tiles">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 96 }} />
        ))}
      </div>
      <div className="grid-2">
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </div>
  );
}
