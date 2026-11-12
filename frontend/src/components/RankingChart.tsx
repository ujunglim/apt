"use client";

// 시군구 평균가 순위 (가로 막대). 선택한 구만 강조색, 나머지는 회색 (색은 구가 아니라 "선택 여부"를 뜻한다).
// 막대를 누르면 그 구로 이동한다. 모든 값은 아래 순위 표에서도 볼 수 있다.
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  LabelList,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
  type TooltipContentProps,
} from "recharts";
import type { RankingItem } from "@/lib/api";
import { formatEok, formatPct } from "@/lib/format";

type Props = { items: RankingItem[]; selected: string; hrefs: Record<string, string> };

const ROW = 40; // 막대 한 줄 높이(px)

export default function RankingChart({ items, selected, hrefs }: Props) {
  const router = useRouter();
  const data = [...items].sort((a, b) => a.rank - b.rank);

  return (
    <div
      style={{ width: "100%", height: data.length * ROW + 16 }}
      role="img"
      aria-label="시군구 평균 매매가 순위 차트. 같은 값은 아래 표에서 볼 수 있습니다."
    >
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="sggNm"
            width={64}
            tickLine={false}
            axisLine={{ stroke: "var(--axis)" }}
            tick={{ fill: "var(--text-secondary)", fontSize: 13 }}
          />
          <Tooltip content={(props) => <RankingTooltip {...props} />} cursor={{ fill: "var(--wash)" }} />
          <Bar
            dataKey="avgPriceMan"
            maxBarSize={24}
            radius={[0, 4, 4, 0]} // 데이터 끝만 둥글게, 기준선 쪽은 각지게
            isAnimationActive={false}
            cursor="pointer"
            onClick={(entry) => {
              const code = (entry.payload as RankingItem).sggCd;
              if (hrefs[code]) router.push(hrefs[code], { scroll: false });
            }}
            shape={(props: BarShapeProps) => {
              const isSelected = (props.payload as RankingItem).sggCd === selected;
              return <Rectangle {...props} fill={isSelected ? "var(--series-1)" : "var(--bar-muted)"} />;
            }}
          >
            {/* 막대 끝에 값 (4개뿐이라 모두 표시해도 읽힌다) */}
            <LabelList
              dataKey="avgPriceMan"
              position="right"
              content={(props) => {
                const { x, y, width, height, value } = props as { x: number; y: number; width: number; height: number; value: number };
                return (
                  <text x={x + width + 8} y={y + height / 2} dominantBaseline="central" fontSize={12} fill="var(--text-secondary)">
                    {formatEok(value)}
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

function RankingTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload as RankingItem;
  return (
    <div className="tooltip">
      <div className="tt-title">
        {r.rank}위 · {r.sggNm}
      </div>
      <div className="tt-row">
        <strong>{formatEok(r.avgPriceMan, 2)}</strong>
        <span className="tt-name">평균가</span>
      </div>
      <div className="tt-row">
        <strong>{formatEok(r.medianPriceMan, 2)}</strong>
        <span className="tt-name">중위가</span>
      </div>
      <div className="tt-note">
        거래 {r.tradeCnt}건 · 전월 대비 {formatPct(r.momChangePct)} · 클릭하면 이 구로 이동
      </div>
    </div>
  );
}
