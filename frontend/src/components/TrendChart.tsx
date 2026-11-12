"use client";

// 가격 추이: 평균가 · 3개월 이동평균 · 중위가 (모두 만원 → 억 원 표시, 축 하나).
// 진행 중인 달은 신고가 덜 들어와 값이 크게 흔들려(예: 4건 평균) 추세를 왜곡하므로 이 차트에서는 뺀다.
// 그 달은 거래 건수 차트(옅은 막대)와 월별 표(집계 중 배지)에서 보여 준다.
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { TrendPoint } from "@/lib/api";
import { formatEok, formatPct, formatYm, formatYmShort } from "@/lib/format";

const SERIES = [
  { key: "avgPriceMan", name: "평균가", color: "var(--series-1)" },
  { key: "ma3AvgPriceMan", name: "3개월 이동평균", color: "var(--series-2)" },
  { key: "medianPriceMan", name: "중위가", color: "var(--series-3)" },
] as const;

export default function TrendChart({ points: all }: { points: TrendPoint[] }) {
  const points = all.filter((p) => !p.currentMonth);
  const lastIndex = points.length - 1;
  const ticks = niceTicks(points);

  return (
    <div>
      <div className="legend" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <div style={{ width: "100%", height: 300 }} role="img" aria-label="월별 아파트 매매가 추이 차트. 같은 값은 아래 표에서 볼 수 있습니다.">
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis
              dataKey="ym"
              tickFormatter={formatYmShort}
              stroke="var(--axis)"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickLine={false}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              tickFormatter={(v: number) => `${Number.isInteger(v / 10000) ? v / 10000 : (v / 10000).toFixed(1)}억`}
              stroke="var(--axis)"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={44}
              ticks={ticks}
              domain={[ticks[0], ticks[ticks.length - 1]]}
            />
            <Tooltip
              content={(props) => <TrendTooltip {...props} />}
              cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="linear" // 곡선 보간은 실제 값보다 위아래로 튀어나와 직선으로 잇는다
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                isAnimationActive={false}
                connectNulls
                // 끝점에만 마커 (표면색 2px 링)
                dot={(d) =>
                  d.index === lastIndex ? (
                    <circle key={`${s.key}-end`} cx={d.cx} cy={d.cy} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
                  ) : (
                    <g key={`${s.key}-${d.index}`} />
                  )
                }
                activeDot={{ r: 5, fill: s.color, stroke: "var(--surface-1)", strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** 눈금을 0.5억 또는 1억 단위로 딱 떨어지게 만든다 (값 범위가 3억을 넘으면 1억 단위). */
function niceTicks(points: TrendPoint[]): number[] {
  const values = points.flatMap((p) => SERIES.map((s) => p[s.key])).filter((v): v is number => v != null);
  if (values.length === 0) return [0, 10000];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = max - min > 30000 ? 10000 : 5000;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return ticks.length > 1 ? ticks : [lo, lo + step];
}

function TrendTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as TrendPoint;
  return (
    <div className="tooltip">
      <div className="tt-title">{formatYm(String(label))}</div>
      {SERIES.map((s) => (
        <div className="tt-row" key={s.key}>
          <i style={{ display: "inline-block", width: 10, height: 2, background: s.color }} />
          <strong>{formatEok(p[s.key], 2)}</strong>
          <span className="tt-name">{s.name}</span>
        </div>
      ))}
      <div className="tt-note">
        거래 {p.tradeCnt}건 · 전월 대비 {formatPct(p.momChangePct)}
        {p.bulkCnt > 0 && ` · 일괄 ${p.bulkCnt}건 제외`}
      </div>
    </div>
  );
}
