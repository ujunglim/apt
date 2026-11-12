// 표시 형식. 원천 단위는 만원이고, 화면에는 억 원으로 보여 준다 (155,717만원 → 15.6억).

export function formatEok(man: number | null | undefined, digits = 1): string {
  if (man == null) return "–";
  return `${(man / 10000).toFixed(digits)}억`;
}

export function formatMan(man: number | null | undefined): string {
  if (man == null) return "–";
  return `${man.toLocaleString("ko-KR")}만`;
}

export function formatPct(pct: number | null | undefined): string {
  if (pct == null) return "–";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** "2026-10" → "2026년 10월" */
export function formatYm(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}년 ${Number(m)}월`;
}

/** 축 라벨용 "2026-10" → "26.10" */
export function formatYmShort(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y.slice(2)}.${m}`;
}
