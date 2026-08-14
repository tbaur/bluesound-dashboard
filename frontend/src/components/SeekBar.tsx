import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { ChangeEvent, Ref } from 'react';
import { formatClock } from '@/lib/clock';
import {
  clampPlayback,
  playbackPosition,
  playbackProgress,
  shouldSnapPlayback,
} from '@/lib/playbackClock';

type SeekBarProps = {
  initialSecs: number;
  totlen: number;
  playing: boolean;
  canSeek?: boolean;
  onSeek?: (seconds: number) => void;
};

function paint(
  fill: HTMLDivElement | null,
  time: HTMLSpanElement | null,
  range: HTMLInputElement | null,
  dragging: boolean,
  raw: number,
  totlen: number,
): number {
  const secs = clampPlayback(raw, totlen);
  if (fill) fill.style.transform = `scaleX(${playbackProgress(secs, totlen)})`;
  if (time) time.textContent = formatClock(secs);
  if (range) {
    range.setAttribute('aria-valuetext', `${formatClock(secs)} of ${formatClock(totlen)}`);
    if (!dragging) range.value = String(secs);
  }
  return secs;
}

type TrackProps = {
  totlen: number;
  seekable: boolean;
  fillRef: Ref<HTMLDivElement>;
  timeRef: Ref<HTMLSpanElement>;
  rangeRef: Ref<HTMLInputElement>;
  onPointerDown: () => void;
  onPointerUp: () => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

const SeekTrack = memo(function SeekTrack({
  totlen,
  seekable,
  fillRef,
  timeRef,
  rangeRef,
  onPointerDown,
  onPointerUp,
  onChange,
}: TrackProps) {
  return (
    <div className="dossier-progress">
      <div className="dossier-progress-hit">
        <div className="dossier-progress-track">
          <div ref={fillRef} className="dossier-progress-fill" />
        </div>
        {seekable ? (
          <input
            ref={rangeRef}
            type="range"
            className="house-seek"
            min={0}
            max={totlen}
            step="any"
            defaultValue={0}
            aria-label="Seek"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onChange={onChange}
          />
        ) : null}
      </div>
      <div className="dossier-progress-times">
        <span ref={timeRef} />
        <span>{totlen > 0 ? formatClock(totlen) : '—'}</span>
      </div>
    </div>
  );
});

export function SeekBar({
  initialSecs,
  totlen,
  playing,
  canSeek = false,
  onSeek,
}: SeekBarProps) {
  const fillRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const originRef = useRef<{ secs: number; at: number | null }>({
    secs: initialSecs,
    at: null,
  });
  const lastRef = useRef(initialSecs);
  const draggingRef = useRef(false);
  const playingRef = useRef(playing);
  const totlenRef = useRef(totlen);
  const onSeekRef = useRef(onSeek);
  const commitTimer = useRef<number | undefined>(undefined);
  const pending = useRef<number | null>(null);
  const seekable = Boolean(canSeek && onSeek && totlen > 0);

  useLayoutEffect(() => {
    totlenRef.current = totlen;
    playingRef.current = playing;
    onSeekRef.current = onSeek;
  }, [totlen, playing, onSeek]);

  useLayoutEffect(() => {
    const now = performance.now();
    const predicted = playbackPosition(
      originRef.current.secs,
      originRef.current.at ?? now,
      now,
      originRef.current.at !== null && playingRef.current && !draggingRef.current,
    );
    if (originRef.current.at === null || shouldSnapPlayback(predicted, initialSecs)) {
      originRef.current = { secs: initialSecs, at: now };
      lastRef.current = paint(
        fillRef.current,
        timeRef.current,
        rangeRef.current,
        draggingRef.current,
        initialSecs,
        totlenRef.current,
      );
    }
  }, [initialSecs]);

  useEffect(() => {
    if (!playing) {
      originRef.current.secs = lastRef.current;
      originRef.current.at = performance.now();
      lastRef.current = paint(
        fillRef.current,
        timeRef.current,
        rangeRef.current,
        false,
        lastRef.current,
        totlenRef.current,
      );
      return undefined;
    }
    originRef.current = { secs: lastRef.current, at: performance.now() };
    let frame = 0;
    const tick = (now: number) => {
      if (!draggingRef.current) {
        const originAt = originRef.current.at ?? now;
        lastRef.current = paint(
          fillRef.current,
          timeRef.current,
          rangeRef.current,
          false,
          playbackPosition(originRef.current.secs, originAt, now, true),
          totlenRef.current,
        );
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      originRef.current.secs = lastRef.current;
      originRef.current.at = performance.now();
    };
  }, [playing]);

  useEffect(
    () => () => {
      if (commitTimer.current) window.clearTimeout(commitTimer.current);
    },
    [],
  );

  const onPointerDown = useCallback(() => {
    draggingRef.current = true;
  }, []);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    originRef.current = { secs: lastRef.current, at: performance.now() };
  }, []);

  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    lastRef.current = paint(
      fillRef.current,
      timeRef.current,
      rangeRef.current,
      true,
      next,
      totlenRef.current,
    );
    pending.current = Math.round(next);
    if (commitTimer.current) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = undefined;
      const seconds = pending.current;
      pending.current = null;
      if (seconds !== null) onSeekRef.current?.(seconds);
    }, 80);
  }, []);

  return (
    <SeekTrack
      totlen={totlen}
      seekable={seekable}
      fillRef={fillRef}
      timeRef={timeRef}
      rangeRef={rangeRef}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onChange={onChange}
    />
  );
}
