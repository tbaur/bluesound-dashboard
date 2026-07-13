import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

type PressRepeatHandlers = {
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (event: MouseEvent) => void;
};

/**
 * Fire `action` immediately, then repeat while held.
 * Uses a ref so rapid steps always see the latest external state.
 */
export function usePressRepeat(
  action: () => void,
  {
    initialDelayMs = 320,
    repeatMs = 55,
  }: { initialDelayMs?: number; repeatMs?: number } = {},
): PressRepeatHandlers {
  const actionRef = useRef(action);
  const delayRef = useRef<number | undefined>(undefined);
  const repeatRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  useEffect(
    () => () => {
      if (delayRef.current) window.clearTimeout(delayRef.current);
      if (repeatRef.current) window.clearInterval(repeatRef.current);
    },
    [],
  );

  const stop = () => {
    if (delayRef.current) {
      window.clearTimeout(delayRef.current);
      delayRef.current = undefined;
    }
    if (repeatRef.current) {
      window.clearInterval(repeatRef.current);
      repeatRef.current = undefined;
    }
  };

  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    stop();
    actionRef.current();
    delayRef.current = window.setTimeout(() => {
      delayRef.current = undefined;
      repeatRef.current = window.setInterval(() => {
        actionRef.current();
      }, repeatMs);
    }, initialDelayMs);
  };

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (event) => event.preventDefault(),
  };
}
