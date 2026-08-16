import Image from "next/image";

/**
 * The GLAZE wordmark, same artwork the storefront ships. The SVG carries its
 * own colour, so callers pick a `tone` to suit the surface rather than a text
 * utility.
 */
const SRC = {
  white: "/glaze-monochrome-white.svg",
  plum: "/glaze-monochrome-plum.svg",
  blush: "/glaze-monochrome-blush.svg",
} as const;

export function Logomark({
  className = "",
  tone = "plum",
}: {
  className?: string;
  tone?: keyof typeof SRC;
}) {
  return (
    <Image
      src={SRC[tone]}
      alt="GLAZE"
      width={982}
      height={152}
      priority
      className={`block h-auto w-full ${className}`}
    />
  );
}
