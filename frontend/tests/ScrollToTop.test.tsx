import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollToTop } from '@/components/ScrollToTop';

describe('ScrollToTop', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  it('scrolls to the top on initial route and when navigating', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ScrollToTop />
        <Routes>
          <Route
            path="/"
            element={
              <div>
                fleet
                <Link to="/player/abc">Open player</Link>
              </div>
            }
          />
          <Route path="/player/:id" element={<div>player</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    vi.mocked(window.scrollTo).mockClear();

    fireEvent.click(screen.getByRole('link', { name: 'Open player' }));
    expect(screen.getByText('player')).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
