// 월별 표 (차트의 표 버전). 차트 값을 색·마우스 없이도 모두 읽을 수 있게 한다. BE 페이징을 그대로 쓴다.
import Link from "next/link";
import type { MonthlyPrice, PageResponse } from "@/lib/api";
import { formatEok, formatPct, formatYm } from "@/lib/format";

export default function PriceTable({ data, hrefForPage }: { data: PageResponse<MonthlyPrice>; hrefForPage: (page: number) => string }) {
  const { content, page, totalPages, totalElements } = data;
  return (
    <div>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">월별 아파트 매매가 (단위: 억 원)</caption>
          <thead>
            <tr>
              <th scope="col">월</th>
              <th scope="col">거래</th>
              <th scope="col">평균가</th>
              <th scope="col">중위가</th>
              <th scope="col">3개월 이동평균</th>
              <th scope="col">㎡당 평균</th>
              <th scope="col">전월 대비</th>
            </tr>
          </thead>
          <tbody>
            {content.map((r) => (
              <tr key={r.ym}>
                <td>
                  {formatYm(r.ym)}
                  {r.currentMonth && <span className="badge">집계 중</span>}
                </td>
                <td>
                  {r.tradeCnt}건
                  {r.bulkCnt > 0 && <span className="badge" title="법인·공공기관이 같은 단지를 같은 날 5건 이상 매수한 거래. 시세를 왜곡해 집계에서 제외">일괄 {r.bulkCnt}건 제외</span>}
                </td>
                <td>{formatEok(r.avgPriceMan, 2)}</td>
                <td>{formatEok(r.medianPriceMan, 2)}</td>
                <td>{formatEok(r.ma3AvgPriceMan, 2)}</td>
                <td>{r.avgPricePerM2Man == null ? "–" : `${Math.round(r.avgPricePerM2Man).toLocaleString("ko-KR")}만`}</td>
                <td>{formatPct(r.momChangePct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="pager" aria-label="표 페이지">
        {page > 0 ? <Link href={hrefForPage(page - 1)} scroll={false}>← 이전</Link> : <span className="disabled">← 이전</span>}
        <span>
          {page + 1} / {Math.max(totalPages, 1)} 페이지 · 전체 {totalElements}개월
        </span>
        {page + 1 < totalPages ? <Link href={hrefForPage(page + 1)} scroll={false}>다음 →</Link> : <span className="disabled">다음 →</span>}
      </nav>
    </div>
  );
}
