import { Navigate, Route, Routes } from 'react-router-dom';
import { FleetPage } from '@/components/FleetPage';
import { HousePage } from '@/components/HousePage';
import { PlayerDetailPage } from '@/components/PlayerDetailPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<FleetPage />} />
      <Route path="/house" element={<HousePage />} />
      <Route path="/player/:id" element={<PlayerDetailPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
