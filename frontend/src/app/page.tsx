import Link from "next/link";
import { Suspense } from "react";
import PriceTable from "@/components/PriceTable";
import RankingTable from "@/components/RankingTable";
import StatTiles from "@/components/StatTiles";
import ThemeToggle from "@/components/ThemeToggle";
import TrendChart from "@/components/TrendChart";
import VolumeChart from "@/components/VolumeChart";
import { getPrices, getRanking, getTrend } from "@/lib/api";

const SGG_CD = "11215"; // 광진구
const PERIODS = [
  { months: 6, label: "6개월" },
  { months: 12, label: "1년" },
  { months: 60, label: "전체" },
] as const;
const DEFAULT_MONTHS = 12;

type Search = { months?: string; page?: string };

// 헤더는 정적이라 바로 보내고, URL 쿼리(searchParams)를 읽는 대시보드 본문은 요청 시점에 스트리밍한다.
export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <main className="container">
      <header className="header">
        <div>
          <h1>광진구 아파트 매매 실거래가</h1>
          <p>국토교통부 실거래가 공개 데이터 · 매일 06:00 갱신 · 취소·일괄 매각 제외</p>
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

  // 서로 독립인 호출은 동시에 보낸다
  const [trend, prices, ranking] = await Promise.all([
    getTrend(SGG_CD, months),
    getPrices(SGG_CD, page),
    getRanking(),
  ]);

  const href = (q: { months?: number; page?: number }) => {
    const params = new URLSearchParams();
    const m = q.months ?? months;
    if (m !== DEFAULT_MONTHS) params.set("months", String(m));
    if (q.page) params.set("page", String(q.page));
    const s = params.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <>
      {/* 필터는 한 줄, 아래 차트 전체에 적용된다 */}
      <nav className="filters" aria-label="기간">
        <span className="label">기간</span>
        {PERIODS.map((p) => (
          <Link key={p.months} href={href({ months: p.months })} className="chip" aria-current={p.months === months} scroll={false}>
            {p.label}
          </Link>
        ))}
      </nav>

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
          <h2>시군구 순위</h2>
          <p className="sub">진행 중인 달을 제외한 최근 완결 월 기준</p>
          <RankingTable ranking={ranking} />
        </section>
      </div>
    </>
  );
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
