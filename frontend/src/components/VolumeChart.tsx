"use client";

// 월별 거래 건수 (단일 시리즈). 가격과 단위가 달라 별도 차트로 둔다 (이중 축 금지).
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
  type TooltipContentProps,
} from "recharts";
import type { TrendPoint } from "@/lib/api";
import { formatYm, formatYmShort } from "@/lib/format";

export default function VolumeChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(...points.map((p) => p.tradeCnt));
  const ticks = countTicks(max);
  return (
    <div style={{ width: "100%", height: 300 }} role="img" aria-label="월별 거래 건수 차트. 같은 값은 아래 표에서 볼 수 있습니다.">
      <ResponsiveContainer>
        <BarChart data={points} margin={{ top: 20, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="ym"
            tickFormatter={formatYmShort}
            stroke="var(--axis)"
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            stroke="var(--axis)"
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={36}
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1]]}
          />
          <Tooltip content={(props) => <VolumeTooltip {...props} />} cursor={{ fill: "var(--wash)" }} />
          <Bar
            dataKey="tradeCnt"
            name="거래 건수"
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            fill="var(--series-1)"
            isAnimationActive={false}
            // 진행 중인 달은 옅게: 아직 신고가 덜 들어온 값이다
            shape={(props: BarShapeProps) => (
              <Rectangle {...props} fillOpacity={(props.payload as TrendPoint).currentMonth ? 0.35 : 1} />
            )}
          >
            {/* 최댓값에만 값 라벨 (모든 막대에 숫자 금지) */}
            <LabelList
              dataKey="tradeCnt"
              position="top"
              content={(props) => {
                const { x, y, width, value } = props as { x: number; y: number; width: number; value: number };
                if (value !== max) return null;
                return (
                  <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={12} fill="var(--text-secondary)">
                    {value}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 0부터 딱 떨어지는 눈금 4~5개 (예: 0/50/100/150/200, 0/200/400/600/800). */
function countTicks(max: number): number[] {
  const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const step = steps.find((s) => max / s <= 4) ?? 1000;
  const top = Math.max(step, Math.ceil(max / step) * step);
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

function VolumeTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as TrendPoint;
  return (
    <div className="tooltip">
      <div className="tt-title">{formatYm(String(label))}</div>
      <div className="tt-row">
        <strong>{p.tradeCnt}건</strong>
        <span className="tt-name">거래</span>
      </div>
      {p.bulkCnt > 0 && <div className="tt-note">일괄 매각 {p.bulkCnt}건 제외</div>}
      {p.currentMonth && <div className="tt-note">집계 중 · 신고 기한(30일)이 지나야 확정</div>}
    </div>
  );
}
