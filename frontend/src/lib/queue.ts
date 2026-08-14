import type { QueueResponse } from '@/api/types';

/** Reorder a play-queue locally so ↑/↓ can paint before BluOS confirms. */
export function reorderQueue(
  queue: QueueResponse,
  fromIndex: number,
  toIndex: number,
): QueueResponse {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= queue.items.length ||
    toIndex >= queue.items.length
  ) {
    return queue;
  }
  const items = [...queue.items];
  const [item] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, item);
  return { items, count: queue.count };
}
