"use client"; // 오류 경계는 클라이언트 컴포넌트여야 한다

// BE 가 꺼져 있거나 오류를 주면 이 화면이 나온다. 메시지는 src/lib/api.ts 의 ApiError 가 만든다.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
  return (
    <main className="container">
      <section className="card error" role="alert">
        <h2>데이터를 불러오지 못했습니다</h2>
        <p className="sub">{message}</p>
        <button type="button" onClick={() => retry()}>
          다시 시도
        </button>
      </section>
    </main>
  );
}
