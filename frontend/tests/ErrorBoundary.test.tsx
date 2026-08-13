import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function Boom(): never {
  throw new Error('secret internals');
}

describe('ErrorBoundary', () => {
  it('shows a generic message and does not leak the thrown error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong rendering the dashboard.')).toBeInTheDocument();
    expect(screen.queryByText('secret internals')).not.toBeInTheDocument();
    spy.mockRestore();
  });
});
