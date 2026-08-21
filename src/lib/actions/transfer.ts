"use server";

import { revalidatePath } from "next/cache";

import { fromCsv, type ParsedCsv } from "@/lib/csv";
import { requireUserForAction } from "@/lib/dal";
import { importCsv, TRANSFERS, type ImportResult, type TransferKey } from "@/lib/transfer";
import { fromXlsx } from "@/lib/xlsx";

export interface ImportState {
  error?: string;
  result?: ImportResult;
}

/** Guards against a stray multi-megabyte upload before any parsing happens. */
const MAX_BYTES = 2 * 1024 * 1024;

export async function runImport(
  key: TransferKey,
  _state: ImportState,
  formData: FormData
): Promise<ImportState> {
  await requireUserForAction();

  if (!TRANSFERS[key]) return { error: "Unknown collection." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file first." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "That file is larger than 2 MB. Split it and import in parts." };
  }

  let parsed: ParsedCsv;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Every .xlsx is a zip, and every zip starts "PK" — a surer test than the
    // file's name, which is whatever the client's machine decided to call it.
    const isWorkbook = bytes[0] === 0x50 && bytes[1] === 0x4b;
    parsed = isWorkbook
      ? fromXlsx(bytes)
      : fromCsv(new TextDecoder().decode(bytes));
  } catch (error) {
    console.error("[import parse]", error);
    return { error: "That file could not be read. Save it as .xlsx or .csv and try again." };
  }

  const { headers, rows } = parsed;
  if (headers.length === 0) {
    return { error: "That file has no header row." };
  }

  const result = await importCsv(key, rows);

  // Products can move because of a taxonomy import, so refresh both.
  revalidatePath(`/${key}`);
  revalidatePath("/products");
  revalidatePath("/dashboard");

  return { result };
}
