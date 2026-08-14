import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StickyArt } from '@/components/StickyArt';

describe('StickyArt', () => {
  it('keeps the last image when src goes empty', () => {
    const { rerender } = render(
      <StickyArt src="http://art/a.jpg" empty={<span>empty</span>} />,
    );
    expect(screen.getByRole('presentation')).toHaveAttribute('src', 'http://art/a.jpg');
    rerender(<StickyArt src="" empty={<span>empty</span>} />);
    expect(screen.getByRole('presentation')).toHaveAttribute('src', 'http://art/a.jpg');
    expect(screen.queryByText('empty')).not.toBeInTheDocument();
  });

  it('keeps the current image until the next url has loaded', async () => {
    const probes: Array<{ src: string; load: () => void }> = [];

    class Probe {
      onload: (() => void) | null = null;
      complete = false;

      addEventListener(type: string, fn: () => void) {
        if (type === 'load') this.onload = fn;
      }

      removeEventListener() {
        this.onload = null;
      }

      set src(value: string) {
        probes.push({
          src: value,
          load: () => {
            this.complete = true;
            this.onload?.();
          },
        });
      }
    }

    vi.stubGlobal('Image', Probe);
    try {
      const { rerender } = render(
        <StickyArt src="http://art/a.jpg" empty={<span>empty</span>} />,
      );
      rerender(<StickyArt src="http://art/b.jpg" empty={<span>empty</span>} />);
      expect(screen.getByRole('presentation')).toHaveAttribute('src', 'http://art/a.jpg');
      const next = probes.find((probe) => probe.src === 'http://art/b.jpg');
      expect(next).toBeDefined();
      act(() => {
        next?.load();
      });
      await waitFor(() =>
        expect(screen.getByRole('presentation')).toHaveAttribute('src', 'http://art/b.jpg'),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
