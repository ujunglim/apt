"use client";

// 테마 선택: 시스템 / 라이트 / 다크. 선택값은 localStorage("theme")에 저장한다.
// - 라이트·다크: <html data-theme="..."> 를 붙인다 (globals.css 가 이 값을 우선 적용).
// - 시스템: data-theme 를 지워 OS 설정(prefers-color-scheme)을 따른다.
// 새로고침 시 깜빡임은 layout.tsx 의 인라인 스크립트가 첫 페인트 전에 막는다.
import { useLayoutEffect, useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "theme";
const OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "시스템" },
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
];

const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system"; // 사생활 보호 모드 등 저장소 접근이 막힌 경우
  }
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

function save(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // 저장 실패해도 현재 화면에는 적용한다
  }
  apply(theme);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export default function ThemeToggle() {
  // 서버에서는 "system" 으로 그리고, 브라우저에서 저장된 값으로 맞춘다 (hydration 오류 없음)
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);

  // 개발 모드 재마운트 때 React 가 html 속성을 지울 수 있어 다시 적용한다 (프로덕션에서는 영향 없음)
  useLayoutEffect(() => {
    apply(read());
  }, []);

  return (
    <div className="theme-toggle" role="group" aria-label="화면 테마">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" aria-pressed={theme === o.value} onClick={() => save(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
