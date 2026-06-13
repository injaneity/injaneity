import { Routes, Route } from 'react-router-dom';
import { EInkShader } from '@/components/reader/EInkShader';
import { EInkDitherFilter } from '@/components/reader/EInkDitherFilter';
import { ReaderPage } from '@/components/pages/ReaderPage';

function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<ReaderPage />} />
        <Route path="/:slug" element={<ReaderPage />} />
      </Routes>
      <EInkDitherFilter />
      <EInkShader />
    </div>
  );
}

export default App;
