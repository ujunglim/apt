// 시군구 순위 표 (순위 차트의 표 버전). 선택한 구의 행은 굵게 표시한다.
import Link from "next/link";
import type { Ranking } from "@/lib/api";
import { formatEok, formatPct, formatYm } from "@/lib/format";

type Props = { ranking: Ranking; selected: string; hrefs: Record<string, string> };

export default function RankingTable({ ranking, selected, hrefs }: Props) {
  if (!ranking.ym || ranking.items.length === 0) {
    return <p className="sub">아직 완결된 달이 없습니다.</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">{formatYm(ranking.ym)} 시군구 평균가 순위</caption>
        <thead>
          <tr>
            <th scope="col">순위</th>
            <th scope="col">시군구</th>
            <th scope="col">평균가</th>
            <th scope="col">중위가</th>
            <th scope="col">거래</th>
            <th scope="col">전월 대비</th>
          </tr>
        </thead>
        <tbody>
          {ranking.items.map((r) => {
            const isSelected = r.sggCd === selected;
            return (
              <tr key={r.sggCd} aria-current={isSelected ? "true" : undefined} style={isSelected ? { fontWeight: 600 } : undefined}>
                <td>{r.rank}</td>
                <td>
                  {isSelected ? (
                    r.sggNm
                  ) : (
                    <Link href={hrefs[r.sggCd] ?? "/"} scroll={false}>
                      {r.sggNm}
                    </Link>
                  )}
                </td>
                <td>{formatEok(r.avgPriceMan, 2)}</td>
                <td>{formatEok(r.medianPriceMan, 2)}</td>
                <td>{r.tradeCnt}건</td>
                <td>{formatPct(r.momChangePct)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="note">거래가 적은 구는 고가 거래 몇 건에 평균이 크게 움직이므로 중위가를 함께 보세요.</p>
    </div>
  );
}
