import { Navigate, Route, Routes } from 'react-router';
import { FleetPage } from '@/components/FleetPage';
import { HousePage } from '@/components/HousePage';
import { PlayerDetailPage } from '@/components/PlayerDetailPage';
import { ScrollToTop } from '@/components/ScrollToTop';

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<FleetPage />} />
        <Route path="/house" element={<HousePage />} />
        <Route path="/player/:id" element={<PlayerDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
