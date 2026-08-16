"use server";

import { revalidatePath } from "next/cache";

import { fromCsv } from "@/lib/csv";
import { requireUserForAction } from "@/lib/dal";
import { importCsv, TRANSFERS, type ImportResult, type TransferKey } from "@/lib/transfer";

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
    return { error: "Choose a CSV file first." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "That file is larger than 2 MB. Split it and import in parts." };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { error: "That file could not be read." };
  }

  const { headers, rows } = fromCsv(text);
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
