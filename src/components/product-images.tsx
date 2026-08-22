"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cx } from "@/components/ui";

/**
 * The four artwork slots on a product card, as one frame you can step through.
 *
 * A product carries a cover plus up to three more images, and the list only
 * ever showed the cover — so whether the other three were set, wrong, or
 * missing could not be seen without opening the editor. Stepping through them
 * here is the cheapest way to check a product looks right.
 *
 * Controls only appear when there is more than one image: a single-image
 * product should look like a plain picture, not a carousel with nothing to do.
 */
export function ProductImages({
  images,
  title,
  className,
}: {
  /** Cover first, then the extra slots. Blank entries are the caller's to drop. */
  images: string[];
  title: string;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const count = images.length;

  // Wraps both ways, so the last image's "next" is the cover again rather than
  // a dead button.
  const go = (step: number) => setIndex((was) => (was + step + count) % count);

  if (count === 0) {
    return (
      <div
        className={cx(
          "flex items-center justify-center border-b border-beige bg-dusty label-sm text-brown",
          className
        )}
      >
        No image
      </div>
    );
  }

  return (
    <div className={cx("group relative overflow-hidden border-b border-beige bg-dusty", className)}>
      {/* Every image stays mounted and is faded between, so stepping through
          does not flash an empty frame while the next one loads. */}
      {images.map((src, i) => (
        <Image
          key={src + i}
          src={src}
          alt={i === 0 ? title : `${title} — image ${i + 1}`}
          fill
          unoptimized
          sizes="(min-width: 1200px) 33vw, (min-width: 810px) 50vw, 100vw"
          className={cx(
            "object-cover transition-opacity duration-300",
            i === index ? "opacity-100" : "opacity-0"
          )}
          aria-hidden={i !== index}
        />
      ))}

      {count > 1 && (
        <>
          <Arrow side="left" onClick={() => go(-1)} label="Previous image" />
          <Arrow side="right" onClick={() => go(1)} label="Next image" />

          <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
            {images.map((src, i) => (
              <button
                key={src + i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show image ${i + 1} of ${count}`}
                aria-current={i === index}
                className={cx(
                  "h-1.5 w-1.5 cursor-pointer rounded-full border-none p-0 transition-colors duration-200",
                  i === index ? "bg-black" : "bg-white/70 hover:bg-white"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Arrow({
  side,
  onClick,
  label,
}: {
  side: "left" | "right";
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      // Visible on touch, where there is no hover to reveal them, and firmer
      // once the pointer is over the card.
      className={cx(
        "absolute top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center",
        "rounded-full border-none bg-white/75 text-black opacity-80 transition-all duration-200",
        "hover:bg-white group-hover:opacity-100",
        "focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum",
        side === "left" ? "left-2" : "right-2"
      )}
    >
      {side === "left" ? (
        <ChevronLeft size={16} strokeWidth={1.5} />
      ) : (
        <ChevronRight size={16} strokeWidth={1.5} />
      )}
    </button>
  );
}
