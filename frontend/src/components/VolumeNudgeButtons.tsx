import { useRef } from 'react';
import { usePressRepeat } from '@/hooks/usePressRepeat';

type VolumeNudgeButtonsProps = {
  value: number;
  onChange: (level: number) => void;
  disabled?: boolean;
};

export function VolumeNudgeButtons({ value, onChange, disabled = false }: VolumeNudgeButtonsProps) {
  const levelRef = useRef(value);
  levelRef.current = value;

  const nudge = (delta: number) => {
    const next = Math.max(0, Math.min(100, levelRef.current + delta));
    if (next === levelRef.current) return;
    levelRef.current = next;
    onChange(next);
  };

  const down = usePressRepeat(() => nudge(-1));
  const up = usePressRepeat(() => nudge(1));

  return (
    <div className="volume-nudge" role="group" aria-label="Adjust volume">
      <button
        type="button"
        className="btn btn-compact volume-nudge-btn"
        disabled={disabled || value <= 0}
        aria-label="Volume down"
        {...down}
      >
        −
      </button>
      <button
        type="button"
        className="btn btn-compact volume-nudge-btn"
        disabled={disabled || value >= 100}
        aria-label="Volume up"
        {...up}
      >
        +
      </button>
    </div>
  );
}
