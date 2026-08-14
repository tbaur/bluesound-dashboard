import { useState, type ReactNode } from 'react';

type StickyArtProps = {
  src: string;
  className?: string;
  empty: ReactNode;
};

/** Keep the last image when src blips empty (skip/back). Swap immediately for a new URL. */
export function StickyArt({ src, className, empty }: StickyArtProps) {
  const [shown, setShown] = useState(src);
  if (src && src !== shown) {
    setShown(src);
  }

  if (!shown) return empty;
  return <img src={shown} alt="" className={className} />;
}
