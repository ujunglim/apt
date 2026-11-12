// 최근 "완결된" 달의 지표 4개. 진행 중인 달은 값이 흔들리므로 기준으로 쓰지 않는다.
import type { TrendPoint } from "@/lib/api";
import { formatEok, formatPct, formatYm } from "@/lib/format";

export default function StatTiles({ points }: { points: TrendPoint[] }) {
  const completed = points.filter((p) => !p.currentMonth);
  const latest = completed.at(-1);
  const prev = completed.at(-2);
  if (!latest) return null;

  const tradeDelta = prev ? latest.tradeCnt - prev.tradeCnt : null;

  return (
    <section aria-label={`${formatYm(latest.ym)} 주요 지표`}>
      <p className="sub" style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-secondary)" }}>
        기준: {formatYm(latest.ym)} (최근 완결 월)
      </p>
      <div className="tiles">
        <Tile label="평균 매매가" value={formatEok(latest.avgPriceMan, 2)} delta={`전월 대비 ${arrow(latest.momChangePct)} ${formatPct(latest.momChangePct)}`} />
        <Tile label="중위 매매가" value={formatEok(latest.medianPriceMan, 2)} delta={prev ? `전월 ${formatEok(prev.medianPriceMan, 2)}` : undefined} />
        <Tile
          label="거래 건수"
          value={`${latest.tradeCnt}건`}
          delta={tradeDelta == null ? undefined : `전월 대비 ${arrow(tradeDelta)} ${tradeDelta > 0 ? "+" : ""}${tradeDelta}건`}
        />
        <Tile label="3개월 이동평균" value={formatEok(latest.ma3AvgPriceMan, 2)} delta="최근 3개월 평균가의 평균" />
      </div>
    </section>
  );
}

// 가격 상승이 좋은지 나쁜지는 보는 사람마다 달라서 색 대신 화살표·부호로만 방향을 보여 준다.
function arrow(n: number | null) {
  if (n == null || n === 0) return "";
  return n > 0 ? "▲" : "▼";
}

function Tile({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="tile">
      <div className="t-label">{label}</div>
      <div className="t-value">{value}</div>
      {delta && <div className="t-delta">{delta}</div>}
    </div>
  );
}
