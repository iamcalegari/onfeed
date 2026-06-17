import Link from "next/link";

/** Marca onFeed: quadradinho verde-floresta + wordmark serifado. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest font-display text-lg font-semibold leading-none text-creme">
        f
      </span>
      <span className="font-display text-xl font-semibold tracking-tight text-forest">
        onFeed
      </span>
    </Link>
  );
}
