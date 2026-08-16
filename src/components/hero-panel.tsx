"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Logomark } from "@/components/logomark";

/** The storefront's hero art. */
const HERO =
  "https://framerusercontent.com/images/ZbYyoU6EfYLcinn2akWs02lFfg.png?scale-down-to=2048&width=2400&height=1800";

/**
 * The interlocking quarter-circle pattern the storefront lays over its hero and
 * footer artwork. Tile size tracks the container's width so the arcs keep the
 * same visual weight at any size — hence the ResizeObserver rather than a fixed
 * tile.
 */
function TruchetOverlay() {
  const svg = useRef<SVGSVGElement>(null);
  const [cell, setCell] = useState(14);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;

    const update = (width: number) => setCell(width / 400);
    update(element.getBoundingClientRect().width);

    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const r = cell / 2;
  const stroke = Math.max(0.3, cell * 0.08);

  const arcs = [
    `M${r},0 A${r},${r} 0 0,0 0,${r}`,
    `M${cell + r},0 A${r},${r} 0 0,1 ${cell * 2},${r}`,
    `M${r},${cell} A${r},${r} 0 0,1 ${cell},${cell + r}`,
    `M${cell + r},${cell} A${r},${r} 0 0,0 ${cell},${cell + r}`,
  ].join(" ");

  return (
    <svg
      ref={svg}
      className="absolute inset-0 z-[2] h-full w-full"
      aria-hidden
    >
      <defs>
        <pattern
          id="login-truchet"
          x="0"
          y="0"
          width={cell * 2}
          height={cell * 2}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={arcs}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#login-truchet)" />
    </svg>
  );
}

/**
 * Image, pattern, wordmark — the same three layers, in the same order, as the
 * block at the bottom of the storefront's footer.
 */
export function HeroPanel({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-clip ${className}`}>
      <div className="absolute inset-0 z-[1]">
        <Image
          src={HERO}
          alt=""
          fill
          sizes="(max-width: 1199px) 100vw, 460px"
          quality={90}
          priority
          className="object-cover object-center"
        />
      </div>

      <TruchetOverlay />

      <div className="relative z-[3] flex h-full items-center justify-center p-8">
        <Logomark tone="white" className="max-w-[240px]" />
      </div>
    </div>
  );
}
