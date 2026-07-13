// components/shared/Logo.tsx
//
// The Wedy.ai wordmark (public/images/Wedy.ai_Logo.png) — same asset the
// landing page's navbar uses, at whatever height the call site needs.
// Width is derived from the source file's real aspect ratio (777x561) so
// callers only ever have to specify one dimension.

import Image from 'next/image';

const SOURCE_WIDTH = 777;
const SOURCE_HEIGHT = 561;

export default function Logo({ height = 32, className }: { height?: number; className?: string }) {
  const width = Math.round((height * SOURCE_WIDTH) / SOURCE_HEIGHT);
  return (
    <Image
      src="/images/Wedy.ai_Logo.png"
      alt="Wedy.ai"
      width={width}
      height={height}
      className={className}
      priority
    />
  );
}
