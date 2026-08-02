import { useEffect } from 'react';
import { useLocation } from 'react-router';

/** Reset window scroll on route changes (SPA pages don't do this by default). */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
