import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
