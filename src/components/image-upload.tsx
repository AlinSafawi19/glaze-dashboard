"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";

import { Button, Field, INPUT_CLASS, cx } from "@/components/ui";

/**
 * One image slot on a form: drop a file on the thumbnail, pick one with the
 * button, or paste a URL by hand.
 *
 * Whichever route it takes, the value ends up in the same named text input, so
 * the server action still receives a plain URL string and the artwork the
 * client already has on Framer's CDN keeps working untouched.
 */

/** Kept in step with ALLOWED_TYPES in `@/lib/storage`. */
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif";
const MAX_BYTES = 8 * 1024 * 1024;

interface UploadResponse {
  url?: string;
  error?: string;
}

/**
 * XHR rather than fetch: a product photo off a phone is several megabytes, and
 * this is the only way to show how far along it is instead of a spinner that
 * looks identical at 5% and 95%.
 */
function upload(
  file: File,
  folder: string,
  onProgress: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append("file", file);
    body.append("folder", folder);

    const request = new XMLHttpRequest();
    request.open("POST", "/api/uploads");
    request.responseType = "json";

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener("load", () => {
      const payload = (request.response ?? {}) as UploadResponse;
      if (request.status >= 200 && request.status < 300 && payload.url) {
        resolve(payload.url);
      } else {
        reject(new Error(payload.error ?? "The upload failed. Please try again."));
      }
    });
    request.addEventListener("error", () => reject(new Error("The upload failed.")));
    request.addEventListener("abort", () => reject(new Error("Upload cancelled.")));

    request.send(body);
  });
}

export function ImageUploadField({
  name,
  label,
  hint,
  defaultValue,
  folder = "products",
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: string;
  /** Which prefix the file is filed under in the bucket. */
  folder?: string;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [broken, setBroken] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const busy = progress !== null;

  async function accept(file: File | undefined): Promise<void> {
    if (!file) return;

    // Both checks are enforced again on the server; failing here just saves the
    // client watching a 40MB file upload before being told no.
    if (!ACCEPT.split(",").includes(file.type)) {
      setError("Choose a JPEG, PNG, WebP, AVIF or GIF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Images must be 8MB or smaller.");
      return;
    }

    setError(null);
    setProgress(0);
    try {
      const uploaded = await upload(file, folder, setProgress);
      setUrl(uploaded);
      setBroken(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The upload failed.");
    } finally {
      setProgress(null);
      // Without this, choosing the same file twice in a row fires no change
      // event and nothing appears to happen.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) void accept(e.dataTransfer.files[0]);
        }}
        onClick={() => !busy && fileInput.current?.click()}
        role="button"
        tabIndex={-1}
        aria-hidden
        title="Drop an image here, or click to choose one"
        className={cx(
          "relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden border bg-paper",
          dragging ? "border-dashed border-black bg-dusty" : "border-line"
        )}
      >
        {url && !broken ? (
          <Image
            src={url}
            alt=""
            width={80}
            height={80}
            unoptimized
            className="h-20 w-20 object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="px-1 text-center text-[10px] leading-tight text-muted">
            {broken ? "broken" : "drop or click"}
          </span>
        )}

        {busy && (
          <div className="absolute inset-0 flex items-end bg-white/70">
            <div className="h-1 w-full bg-dusty">
              <div
                className="h-1 bg-black transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <Field label={label} hint={hint}>
          <input
            id={inputId}
            name={name}
            type="url"
            className={INPUT_CLASS}
            value={url}
            placeholder="Upload a file, or paste an https:// link"
            disabled={busy}
            onChange={(e) => {
              setUrl(e.target.value);
              setBroken(false);
              setError(null);
            }}
          />
        </Field>

        {/* Outside the Field, because Field is a <label> and every click inside
            one is a click on the input it wraps. */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            // No `name`: this file never rides along with the form submit, it
            // has already been uploaded and reduced to a URL.
            onChange={(e) => void accept(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? `Uploading ${progress}%` : url ? "Replace" : "Upload"}
          </Button>
          {url && !busy && (
            <Button
              type="button"
              variant="ghost"
              className="px-3 py-1.5"
              onClick={() => {
                setUrl("");
                setBroken(false);
                setError(null);
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {error && <p className="font-inter text-[12px] text-error">{error}</p>}
      </div>
    </div>
  );
}
