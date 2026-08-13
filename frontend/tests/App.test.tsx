import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';

vi.mock('@/hooks/useLiveFleet', () => ({
  useLiveFleet: () => undefined,
}));

vi.mock('@/components/FleetPage', () => ({
  FleetPage: () => <div>Fleet</div>,
}));

vi.mock('@/components/HousePage', () => ({
  HousePage: () => <div>House</div>,
}));

vi.mock('@/components/PlayerDetailPage', () => ({
  PlayerDetailPage: () => <div>Player</div>,
}));

describe('App routes', () => {
  it('renders the fleet page at /', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('Fleet')).toBeInTheDocument();
  });

  it('renders the house page at /house', () => {
    render(
      <MemoryRouter initialEntries={['/house']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('House')).toBeInTheDocument();
  });
});
