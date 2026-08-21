import "server-only";

/**
 * The shell every Glaze email is built in.
 *
 * Email clients are twenty years behind browsers: no external stylesheet, no
 * flexbox worth trusting, and Outlook still renders through Word. So this is
 * tables and inline styles on purpose — one place to keep that ugliness, so
 * each template can be a few lines of content.
 *
 * The palette matches the dashboard and the storefront: blush ground, white
 * card, plum eyebrow, black on accent for the one button.
 */

const INK = "#000000";
const MUTED = "#6f6259";
const PLUM = "#7b3a56";
const LINE = "#e6ddd4";
const GROUND = "#fdf4f8";
const ACCENT = "#f5b7cf";

const FONT =
  "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

/** Anything a shopper typed can land in an email; escape it. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function money(value: string | number): string {
  return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export interface EmailShell {
  /** Shown in the inbox preview line, after the subject. */
  preheader: string;
  heading: string;
  /** Ready-made HTML — build it with the helpers below. */
  body: string;
  cta?: { label: string; href: string };
  /** Small print under the card. */
  footnote?: string;
}

export function shell({ preheader, heading, body, cta, footnote }: EmailShell): string {
  const button = cta
    ? `
      <tr><td style="padding-top:28px;">
        <a href="${cta.href}" style="display:inline-block;background:${INK};color:${ACCENT};padding:13px 26px;text-decoration:none;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;">${escapeHtml(cta.label)}</a>
      </td></tr>`
    : "";

  const small = footnote
    ? `<p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:${MUTED};">${footnote}</p>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${GROUND};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GROUND};padding:32px 16px;font-family:${FONT};">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;padding:32px;">
        <tr><td>
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${PLUM};">Glaze</p>
          <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;line-height:1.3;color:${INK};">${escapeHtml(heading)}</h1>
          ${body}
          ${small}
        </td></tr>
        ${button}
      </table>
      <p style="margin:20px 0 0;font-size:11px;color:${MUTED};font-family:${FONT};">Glaze — skincare, delivered.</p>
    </td></tr>
  </table>
</body></html>`;
}

/** A paragraph of body copy. `text` is escaped; pass `html` for markup. */
export function paragraph(text: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:${INK};">${escapeHtml(text)}</p>`;
}

export function rawParagraph(html: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:${INK};">${html}</p>`;
}

export function heading(text: string): string {
  return `<h2 style="margin:26px 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${PLUM};">${escapeHtml(text)}</h2>`;
}

/**
 * The one-time code, set large and letter-spaced so it can be read off a phone
 * screen and typed into another window without a second look.
 */
export function codeBlock(code: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;">
      <tr><td style="background:${GROUND};border:1px solid ${LINE};padding:16px 26px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;letter-spacing:0.28em;color:${INK};">${escapeHtml(code)}</td></tr>
    </table>`;
}

/** Label/value rows — an address, a set of contact details. */
export function definitionList(items: Array<[string, string]>): string {
  const rows = items
    .filter(([, value]) => value !== "")
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 16px 6px 0;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
          <td style="padding:6px 0;font-size:14px;line-height:1.6;color:${INK};">${escapeHtml(value).replace(/\n/g, "<br>")}</td>
        </tr>`
    )
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${rows}</table>`;
}

export interface LineItem {
  title: string;
  quantity: number;
  unitPrice: string;
}

/** The order lines and their total. */
export function itemsTable(items: LineItem[], total: string): string {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};">
            ${escapeHtml(item.title)}
            <span style="color:${MUTED};"> × ${item.quantity}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};text-align:right;white-space:nowrap;">${money(Number(item.unitPrice) * item.quantity)}</td>
        </tr>`
    )
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${rows}
      <tr>
        <td style="padding:14px 0 0;font-size:14px;font-weight:600;color:${INK};">Total</td>
        <td style="padding:14px 0 0;font-size:14px;font-weight:600;color:${INK};text-align:right;">${money(total)}</td>
      </tr>
    </table>`;
}
