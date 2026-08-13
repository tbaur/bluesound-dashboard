import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VolumeNudgeButtons } from '@/components/VolumeNudgeButtons';

describe('VolumeNudgeButtons', () => {
  it('nudges volume up and down', () => {
    const onChange = vi.fn();
    render(<VolumeNudgeButtons value={20} onChange={onChange} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Volume up' }), { button: 0 });
    expect(onChange).toHaveBeenCalledWith(21);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Volume down' }), { button: 0 });
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('disables down at zero and up at 100', () => {
    const { rerender } = render(<VolumeNudgeButtons value={0} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Volume down' })).toBeDisabled();
    rerender(<VolumeNudgeButtons value={100} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Volume up' })).toBeDisabled();
  });
});
