import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { EInkShader } from '@/components/reader/EInkShader';
import { EInkDitherFilter } from '@/components/reader/EInkDitherFilter';

const ReaderPage = lazy(() => import('@/components/pages/ReaderPage').then(m => ({ default: m.ReaderPage })));

function App() {
  return (
    <div className="min-h-screen">
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-gray-600 font-sohne-regular">Loading...</p>
        </div>
      }>
        <Routes>
          <Route path="/" element={<ReaderPage />} />
          <Route path="/:slug" element={<ReaderPage />} />
        </Routes>
      </Suspense>
      <EInkDitherFilter />
      <EInkShader />
    </div>
  );
}

export default App;
