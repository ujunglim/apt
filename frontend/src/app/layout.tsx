import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "광진구 아파트 실거래가",
  description: "국토교통부 실거래가 공개 데이터로 만든 서울 광진구 아파트 매매가 대시보드",
};

// 저장된 테마를 첫 페인트 전에 <html data-theme> 로 적용한다 (새로고침 시 깜빡임 방지).
// 저장값이 없으면 아무것도 하지 않아 OS 설정을 따른다.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // 인라인 스크립트가 hydration 전에 data-theme 를 바꾸므로 html 요소의 불일치 경고를 끈다
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
