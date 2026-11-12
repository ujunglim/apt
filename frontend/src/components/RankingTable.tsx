// 시군구 순위. 지금은 광진구만 수집해서 1행이다 (막대 1개짜리 차트 대신 표로 둔다).
import type { Ranking } from "@/lib/api";
import { formatEok, formatPct, formatYm } from "@/lib/format";

export default function RankingTable({ ranking }: { ranking: Ranking }) {
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
            <th scope="col">전월 대비</th>
          </tr>
        </thead>
        <tbody>
          {ranking.items.map((r) => (
            <tr key={r.sggCd}>
              <td>{r.rank}</td>
              <td>{r.sggNm}</td>
              <td>{formatEok(r.avgPriceMan, 2)}</td>
              <td>{formatPct(r.momChangePct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">수집 시군구를 늘리면(APT_LAWD_CODES) 순위가 채워집니다.</p>
    </div>
  );
}
