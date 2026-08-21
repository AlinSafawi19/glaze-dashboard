import "server-only";

import { inflateRawSync } from "node:zlib";

import { normaliseHeader, type ParsedCsv, type Row } from "@/lib/csv";

/**
 * A small, dependency-free .xlsx reader and writer.
 *
 * CSV cannot carry a dropdown, and the whole point of the product export is
 * that the client picks a brand from the brands we stock rather than typing a
 * new one. Excel's list validation only exists inside a real workbook, so this
 * writes one: a zip of a handful of XML parts, which is all an .xlsx is.
 *
 * It is deliberately narrow — one visible sheet of text and numbers, one hidden
 * sheet holding the dropdown lists, no styling, no formulas. Reading is just as
 * narrow: enough to get the first sheet of a workbook Excel saved back to us.
 */

// ── zip ──────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Little-endian writes, because that is what the zip format is made of. */
function pushU16(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushU32(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function pushBytes(out: number[], bytes: Uint8Array): void {
  for (const byte of bytes) out.push(byte);
}

/**
 * Entries are stored uncompressed. A catalogue workbook is a few hundred
 * kilobytes of XML at worst, and skipping deflate keeps this readable.
 */
function zip(entries: ZipEntry[]): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  // A fixed 1980-01-01 stamp: exports of the same catalogue stay byte-identical.
  const dosTime = 0;
  const dosDate = 0x0021;

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const offset = out.length;

    pushU32(out, 0x04034b50);
    pushU16(out, 20); // version needed
    pushU16(out, 0x0800); // UTF-8 names
    pushU16(out, 0); // stored
    pushU16(out, dosTime);
    pushU16(out, dosDate);
    pushU32(out, crc);
    pushU32(out, entry.data.length);
    pushU32(out, entry.data.length);
    pushU16(out, name.length);
    pushU16(out, 0);
    pushBytes(out, name);
    pushBytes(out, entry.data);

    pushU32(central, 0x02014b50);
    pushU16(central, 20); // version made by
    pushU16(central, 20); // version needed
    pushU16(central, 0x0800);
    pushU16(central, 0);
    pushU16(central, dosTime);
    pushU16(central, dosDate);
    pushU32(central, crc);
    pushU32(central, entry.data.length);
    pushU32(central, entry.data.length);
    pushU16(central, name.length);
    pushU16(central, 0); // extra
    pushU16(central, 0); // comment
    pushU16(central, 0); // disk
    pushU16(central, 0); // internal attrs
    pushU32(central, 0); // external attrs
    pushU32(central, offset);
    pushBytes(central, name);
  }

  const centralOffset = out.length;
  pushBytes(out, Uint8Array.from(central));

  pushU32(out, 0x06054b50);
  pushU16(out, 0);
  pushU16(out, 0);
  pushU16(out, entries.length);
  pushU16(out, entries.length);
  pushU32(out, central.length);
  pushU32(out, centralOffset);
  pushU16(out, 0);

  return Uint8Array.from(out);
}

/** Reads the central directory, so entries written with a data descriptor still work. */
function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map<string, Uint8Array>();

  // The end-of-central-directory record sits in the last 64 KB, after a comment
  // of unknown length, so it is found by scanning backwards for its signature.
  let end = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 65558; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Not a zip archive");

  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);

  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;

    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength)
    );

    // The local header repeats the name and extra field, at its own lengths.
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressedSize);

    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, new Uint8Array(inflateRawSync(raw)));
    // Any other method (rare in practice) is simply skipped.

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

// ── xml ──────────────────────────────────────────────────────────────────────

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Excel rejects control characters outright; drop them rather than fail.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = "";
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

/** Numbers go in as numbers so the client can total a price column. */
const NUMERIC = /^-?(0|[1-9]\d*)(\.\d+)?$/;

function cellXml(ref: string, value: string): string {
  if (value === "") return "";
  if (NUMERIC.test(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml(
  headers: string[],
  rows: string[][],
  extra: { validations?: string; freezeHeader?: boolean } = {}
): string {
  const lines: string[] = [];
  const all = [headers, ...rows];

  all.forEach((cells, rowIndex) => {
    const xml = cells
      .map((value, columnIndex) => cellXml(`${columnName(columnIndex)}${rowIndex + 1}`, value))
      .join("");
    lines.push(`<row r="${rowIndex + 1}">${xml}</row>`);
  });

  // Roughly fit each column to its widest cell, so nothing opens as "#####".
  const widths = headers
    .map((header, index) => {
      const longest = Math.max(
        header.length,
        ...rows.map((row) => (row[index] ?? "").length)
      );
      return Math.min(46, Math.max(10, longest + 2));
    })
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");

  const views = extra.freezeHeader
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : "";

  return [
    XML_HEAD,
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<dimension ref="A1:${columnName(Math.max(headers.length - 1, 0))}${all.length}"/>`,
    views,
    `<cols>${widths}</cols>`,
    `<sheetData>${lines.join("")}</sheetData>`,
    extra.validations ?? "",
    "</worksheet>",
  ].join("");
}

// ── write ────────────────────────────────────────────────────────────────────

export interface XlsxDropdown {
  /** Columns on the main sheet that pick from this list. */
  headers: string[];
  /** The allowed values, in the order they should appear in the dropdown. */
  values: string[];
  /** What the list is called on the hidden sheet. */
  label: string;
}

export interface XlsxOptions {
  sheetName: string;
  headers: string[];
  rows: Row[];
  dropdowns?: XlsxDropdown[];
  /**
   * Blank rows below the data that still carry the dropdowns, so new products
   * can be typed straight into the sheet.
   */
  spareRows?: number;
}

const LISTS_SHEET = "Lists";

export function toXlsx(options: XlsxOptions): Uint8Array {
  const { sheetName, headers, rows } = options;
  const spareRows = options.spareRows ?? 200;
  // An empty list cannot be a validation range, and a column the sheet does not
  // have cannot be validated — both are dropped rather than written as broken XML.
  const dropdowns = (options.dropdowns ?? []).filter(
    (dropdown) =>
      dropdown.values.length > 0 &&
      dropdown.headers.some((header) => headers.includes(header))
  );

  const body = rows.map((row) => headers.map((header) => row[header] ?? ""));

  const listRows: string[][] = [];
  const tallest = Math.max(0, ...dropdowns.map((dropdown) => dropdown.values.length));
  for (let n = 0; n < tallest; n += 1) {
    listRows.push(dropdowns.map((dropdown) => dropdown.values[n] ?? ""));
  }

  const lastRow = body.length + 1 + spareRows;
  const validations: string[] = dropdowns
    .flatMap((dropdown, listIndex) => {
      const column = columnName(listIndex);
      const range = `${LISTS_SHEET}!$${column}$2:$${column}$${dropdown.values.length + 1}`;

      return dropdown.headers
        .map((header) => headers.indexOf(header))
        .filter((index) => index >= 0)
        .map((index) => {
          const letter = columnName(index);
          return [
            `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"`,
            ` errorTitle="Not on the list" error="Pick one of the ${escapeXml(dropdown.label.toLowerCase())} we already have, or add it in the dashboard first."`,
            ` sqref="${letter}2:${letter}${lastRow}">`,
            `<formula1>${range}</formula1>`,
            `</dataValidation>`,
          ].join("");
        });
    });

  const parts: ZipEntry[] = [
    {
      name: "[Content_Types].xml",
      data: utf8(
        `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          "</Types>"
      ),
    },
    {
      name: "_rels/.rels",
      data: utf8(
        `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          "</Relationships>"
      ),
    },
    {
      name: "xl/workbook.xml",
      data: utf8(
        `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          "<sheets>" +
          `<sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>` +
          `<sheet name="${LISTS_SHEET}" sheetId="2" state="hidden" r:id="rId2"/>` +
          "</sheets></workbook>"
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: utf8(
        `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
          "</Relationships>"
      ),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: utf8(
        sheetXml(headers, body, {
          // The count attribute has to match the elements, not the list count:
          // three Skin Type columns share one list but are three validations.
          validations: validations.length
            ? `<dataValidations count="${validations.length}">${validations.join("")}</dataValidations>`
            : "",
          freezeHeader: true,
        })
      ),
    },
    {
      name: "xl/worksheets/sheet2.xml",
      data: utf8(sheetXml(dropdowns.map((dropdown) => dropdown.label), listRows)),
    },
  ];

  return zip(parts);
}

/** Turns a workbook into a downloadable response. */
export function xlsxResponse(filename: string, body: Uint8Array): Response {
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// ── read ─────────────────────────────────────────────────────────────────────

/** Every `<t>` inside one shared string, so rich text comes back as plain text. */
function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((run) => unescapeXml(run[1]))
      .join("")
  );
}

/** "BC12" → 54. */
function columnIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function firstSheetPath(files: Map<string, Uint8Array>): string {
  const decode = (name: string) => {
    const part = files.get(name);
    return part ? new TextDecoder().decode(part) : "";
  };

  const sheet = decode("xl/workbook.xml").match(/<sheet\b[^>]*\/>/);
  const id = sheet?.[0].match(/r:id="([^"]+)"/)?.[1];
  const rels = decode("xl/_rels/workbook.xml.rels");
  const target = id
    ? rels.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`))?.[1]
    : undefined;

  if (!target) return "xl/worksheets/sheet1.xml";
  return target.startsWith("/")
    ? target.slice(1)
    : `xl/${target.replace(/^\.\//, "")}`;
}

/**
 * Reads the first sheet of a workbook into the same shape `fromCsv` produces,
 * so the importer does not care which kind of file the client uploaded.
 */
export function fromXlsx(bytes: Uint8Array): ParsedCsv {
  const files = unzip(bytes);
  const decode = (name: string) => {
    const part = files.get(name);
    return part ? new TextDecoder().decode(part) : "";
  };

  const strings = sharedStrings(decode("xl/sharedStrings.xml"));
  const sheet = decode(firstSheetPath(files));
  if (!sheet) return { headers: [], rows: [] };

  const grid: string[][] = [];

  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];

    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="([^"]+)"/)?.[1];

      let value: string;
      if (type === "inlineStr") {
        value = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
          .map((run) => unescapeXml(run[1]))
          .join("");
      } else {
        const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        value = type === "s" ? (strings[Number(raw)] ?? "") : unescapeXml(raw);
      }

      const index = ref ? columnIndex(ref) : cells.length;
      while (cells.length < index) cells.push("");
      cells[index] = value.trim();
    }

    grid.push(cells);
  }

  const first = grid.findIndex((cells) => cells.some((cell) => cell !== ""));
  if (first < 0) return { headers: [], rows: [] };

  const headers = grid[first].map((header) => header.trim());
  const keys = headers.map(normaliseHeader);

  const rows = grid
    .slice(first + 1)
    .filter((cells) => cells.some((cell) => cell !== ""))
    .map((cells) => {
      const row: Row = {};
      keys.forEach((key, index) => {
        row[key] = (cells[index] ?? "").trim();
      });
      return row;
    });

  return { headers, rows };
}
