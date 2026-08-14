import { useEffect, useState, type ReactNode } from 'react';

type StickyArtProps = {
  src: string;
  className?: string;
  empty: ReactNode;
};

/** Keep the last image when src blips empty; swap only after the next URL has loaded. */
export function StickyArt({ src, className, empty }: StickyArtProps) {
  const [shown, setShown] = useState(src);

  useEffect(() => {
    if (!src || src === shown) return undefined;
    let cancelled = false;
    const probe = new Image();
    const reveal = () => {
      if (!cancelled) setShown(src);
    };
    probe.addEventListener('load', reveal);
    probe.addEventListener('error', reveal);
    probe.src = src;
    if (probe.complete) reveal();
    return () => {
      cancelled = true;
      probe.removeEventListener('load', reveal);
      probe.removeEventListener('error', reveal);
    };
  }, [src, shown]);

  if (!shown) return empty;
  return <img src={shown} alt="" className={className} />;
}
