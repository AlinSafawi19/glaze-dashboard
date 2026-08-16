/**
 * A small, dependency-free CSV reader and writer.
 *
 * Spreadsheets are what the client actually has, so the parser handles what
 * Excel and Google Sheets emit: quoted fields, embedded commas and newlines,
 * doubled quotes as an escape, CRLF line endings, and a UTF-8 BOM. It is not a
 * general CSV library — it is exactly enough for the import/export round trip,
 * which keeps it auditable.
 */

export type Row = Record<string, string>;

/** Quotes a field only when it needs it, so files stay readable. */
function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: string[], rows: Row[]): string {
  const lines = [headers.map(quote).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => quote(row[header] ?? "")).join(","));
  }
  // Excel needs the BOM to read UTF-8; without it "Kiehl's" arrives mangled.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Splits raw CSV text into rows of cells, honouring quotes. */
function parseCells(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];

    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  // Whatever is left when the text ends is the last field of the last row.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

export interface ParsedCsv {
  headers: string[];
  rows: Row[];
}

/**
 * Header matching is case- and space-insensitive, because "Skin Type" and
 * "skin type" are the same column to the person who typed it.
 */
export const normaliseHeader = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

export function fromCsv(text: string): ParsedCsv {
  const cells = parseCells(text);
  if (cells.length === 0) return { headers: [], rows: [] };

  const headers = cells[0].map((header) => header.trim());
  const keys = headers.map(normaliseHeader);

  const rows = cells.slice(1).map((line) => {
    const row: Row = {};
    keys.forEach((key, index) => {
      row[key] = (line[index] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}

/** Turns a CSV string into a downloadable response. */
export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
