"use client";

import { useActionState, useRef, useState } from "react";
import { Download, FileUp, Upload } from "lucide-react";

import { Loader } from "@/components/loader";
import { Modal } from "@/components/modal";
import { Button, CancelButton, cx } from "@/components/ui";
import { runImport, type ImportState } from "@/lib/actions/transfer";

export interface TransferInfo {
  key: string;
  label: string;
  /** The columns an import file may carry — never the generated Slug. */
  headers: string[];
  notes: string[];
}

/**
 * Import and export for one collection.
 *
 * Import opens a dialog rather than firing a hidden file input, because the
 * client needs somewhere to read the column list and grab a sample file before
 * they commit — and somewhere for the result to be reported afterwards.
 */
export function TransferButtons({ info }: { info: TransferInfo }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <a
        href={`/api/export/${info.key}`}
        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-none border border-beige bg-transparent px-4 py-2.5 label-sm text-black transition-colors duration-300 hover:bg-black hover:text-accent"
      >
        <Download size={15} strokeWidth={1.5} />
        Export
      </a>

      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Upload size={15} strokeWidth={1.5} />
        Import
      </Button>

      {open && <ImportDialog info={info} onClose={() => setOpen(false)} />}
    </>
  );
}

function ImportDialog({ info, onClose }: { info: TransferInfo; onClose: () => void }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(
    runImport.bind(null, info.key as never),
    {}
  );

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);

  /** Mirrors a dropped file into the real input so the form still submits it. */
  function accept(list: FileList | null) {
    const next = list?.[0];
    if (!next) return;
    if (!/\.(csv|xlsx)$/i.test(next.name)) return;

    const transfer = new DataTransfer();
    transfer.items.add(next);
    if (input.current) input.current.files = transfer.files;
    setFile(next);
  }

  const done = state.result;

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title={`Import ${info.label.toLowerCase()}`}
      description="Upload the exported Excel file, or a CSV. Rows whose title already exists are updated rather than duplicated."
      width="max-w-xl"
      footer={
        done ? (
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <CancelButton type="button" onClick={onClose} disabled={pending}>
              Cancel
            </CancelButton>
            <Button
              type="button"
              disabled={pending || !file}
              onClick={() => form.current?.requestSubmit()}
            >
              {pending ? (
                <>
                  <Loader size={14} />
                  Importing…
                </>
              ) : (
                "Import"
              )}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Added", value: done.created },
              { label: "Updated", value: done.updated },
              { label: "Skipped", value: done.skipped },
            ].map((tile) => (
              <div key={tile.label} className="border border-beige p-3 text-center">
                <p className="font-clash text-[22px] tabular-nums">{tile.value}</p>
                <p className="label-sm text-brown">{tile.label}</p>
              </div>
            ))}
          </div>

          {done.problems.length > 0 && (
            <div className="max-h-56 overflow-y-auto border border-beige bg-warm p-3">
              <p className="mb-2 label-sm text-brown">Worth checking</p>
              <ul className="flex flex-col gap-1.5">
                {done.problems.map((problem) => (
                  <li
                    key={problem}
                    className="font-inter text-[13px] font-light leading-snug text-black"
                  >
                    {problem}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <form ref={form} action={action} className="flex flex-col gap-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              accept(event.dataTransfer.files);
            }}
            onClick={() => input.current?.click()}
            className={cx(
              "flex cursor-pointer flex-col items-center gap-2 border border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-plum bg-blush" : "border-beige bg-caledon hover:border-plum"
            )}
          >
            <FileUp size={22} strokeWidth={1.5} className="text-brown" />
            {file ? (
              <>
                <p className="font-inter text-[14px] text-black">{file.name}</p>
                <p className="font-inter text-[12px] font-light text-brown">
                  {(file.size / 1024).toFixed(0)} KB · click to choose another
                </p>
              </>
            ) : (
              <>
                <p className="font-inter text-[14px] text-black">
                  Drop an .xlsx or .csv here, or click to browse
                </p>
                <p className="font-inter text-[12px] font-light text-brown">
                  Up to 2 MB
                </p>
              </>
            )}

            <input
              ref={input}
              type="file"
              name="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => accept(event.target.files)}
            />
          </div>

          <div className="border border-beige bg-warm p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="label-sm text-brown">Expected columns</p>
              <a
                href={`/api/export/${info.key}?sample=1`}
                className="inline-flex items-center gap-1.5 cursor-pointer label-sm text-plum underline-offset-4 hover:underline"
              >
                <Download size={13} strokeWidth={1.5} />
                Download sample
              </a>
            </div>

            <p className="mt-2 font-mono text-[11px] leading-relaxed text-black">
              {info.headers.join(", ")}
            </p>

            <ul className="mt-3 flex flex-col gap-1">
              {info.notes.map((note) => (
                <li
                  key={note}
                  className="font-inter text-[12px] font-light leading-snug text-brown"
                >
                  {note}
                </li>
              ))}
            </ul>
          </div>

          {state.error && (
            <p className="bg-danger-soft px-3 py-2 font-inter text-[14px] font-light text-error">
              {state.error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
