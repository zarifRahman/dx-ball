// app/page.tsx
import DxBallGame from './components/DxBallGame';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-900 p-0 m-0">
      <DxBallGame />
    </main>
  );
}
