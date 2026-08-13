import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusPills } from '@/components/StatusPills';

describe('StatusPills', () => {
  it('shows live connection and player count with discovery method', () => {
    render(
      <StatusPills
        connection="live"
        deviceCount={2}
        discoveryMethod="mdns+lsdp"
        loading={false}
      />,
    );
    expect(screen.getByText('Live updates')).toBeInTheDocument();
    expect(screen.getByText(/2 players/)).toBeInTheDocument();
    expect(screen.getByText(/via mDNS \+ LSDP/)).toBeInTheDocument();
  });

  it('shows scanning while loading', () => {
    render(
      <StatusPills connection="connecting" deviceCount={0} discoveryMethod="mdns" loading />,
    );
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    expect(screen.getByText('Scanning…')).toBeInTheDocument();
  });

  it('singularizes a single player', () => {
    render(
      <StatusPills connection="offline" deviceCount={1} discoveryMethod="lsdp" loading={false} />,
    );
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText(/1 player/)).toBeInTheDocument();
    expect(screen.getByText(/via LSDP/)).toBeInTheDocument();
  });
});
