import type { PresenceSegment } from '@/lib/health';

interface PresenceBarProps {
  segments: PresenceSegment[];
  label?: string;
}

export function PresenceBar({ segments, label = 'Presence last 12 hours' }: PresenceBarProps) {
  const total = segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
  return (
    <div className="presence-bar" role="img" aria-label={label}>
      {segments.map((segment) => {
        const span = segment.end - segment.start;
        const flex = total > 0 ? span / total : 0;
        return (
          <span
            key={`${segment.state}-${segment.start}`}
            className="presence-seg"
            data-state={segment.state}
            style={{ flexGrow: flex, flexBasis: 0 }}
          />
        );
      })}
    </div>
  );
}
