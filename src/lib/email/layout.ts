import "server-only";

import { STOREFRONT_URL } from "@/lib/email/send";

/**
 * The shell every Glaze email is built in.
 *
 * Email clients are twenty years behind browsers: no external stylesheet, no
 * flexbox worth trusting, and Outlook still renders through Word. So this is
 * tables and inline styles on purpose — one place to keep that ugliness, so
 * each template can be a few lines of content.
 *
 * The palette matches the dashboard and the storefront: blush ground, white
 * card, plum for the wordmark and eyebrows, black on accent for the one button.
 * Headings are set in a serif and body copy in a sans — the editorial pairing
 * the storefront makes with Clash Display over Inter, rebuilt from the two
 * families every mail client already has.
 */

const INK = "#000000";
const MUTED = "#6f6259";
const PLUM = "#7b3a56";
const LINE = "#e6ddd4";
const GROUND = "#fdf4f8";
const ACCENT = "#f5b7cf";

const FONT =
  "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
/** Georgia is the one editorial serif on essentially every device. */
const SERIF = "Georgia,'Iowan Old Style','Times New Roman',Times,serif";

/**
 * The wordmark, as a raster: every client renders PNG, and almost none render
 * SVG. Flattened onto white rather than left transparent, so the older Outlooks
 * cannot paint their own ground behind it.
 *
 * It is served by the storefront, which is the public origin — with none
 * configured there is nothing to link to, and the masthead falls back to the
 * wordmark set as text.
 */
const LOGO_SRC = STOREFRONT_URL
  ? `${STOREFRONT_URL.replace(/\/$/, "")}/email/glaze-wordmark.png`
  : "";

/** The storefront's hero artwork, for the emails that want the brand in view. */
export const HERO_IMAGE =
  "https://framerusercontent.com/images/ZbYyoU6EfYLcinn2akWs02lFfg.png?scale-down-to=2048&width=2400&height=1800";

/** The card's inner gutter. Rows carry it themselves so a hero can bleed. */
const GUTTER = "32px";

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
  /** The small letterspaced label above the heading. */
  eyebrow?: string;
  heading: string;
  /** Ready-made HTML — build it with the helpers below. */
  body: string;
  cta?: { label: string; href: string };
  /** Small print under a hairline at the foot of the card. */
  footnote?: string;
  /**
   * Artwork across the full width of the card, under the masthead. Worth it
   * where the email is an occasion — an order placed — and noise everywhere
   * else, so it is opt-in rather than part of the shell.
   */
  hero?: { src: string; alt?: string };
  /**
   * Centres the whole card. Right for a short, one-thing email like a code,
   * wrong for an order confirmation, where a centred table of lines is a mess
   * to read. `text-align` on the cell is what every client inherits from,
   * including the ones rendering through Word.
   */
  centered?: boolean;
}

/** The wordmark, centred over a hairline. Present on every email. */
function masthead(): string {
  const mark = LOGO_SRC
    ? `<img src="${LOGO_SRC}" width="176" height="27" alt="Glaze" style="display:block;margin:0 auto;width:176px;height:auto;border:0;outline:none;text-decoration:none;">`
    : `<span style="font-family:${FONT};font-size:15px;letter-spacing:0.42em;text-transform:uppercase;color:${PLUM};">Glaze</span>`;

  return `
      <tr><td align="center" style="padding:34px ${GUTTER} 26px;border-bottom:1px solid ${LINE};">
        ${mark}
      </td></tr>`;
}

export function shell({
  preheader,
  eyebrow,
  heading,
  body,
  cta,
  footnote,
  hero,
  centered = false,
}: EmailShell): string {
  const align = centered ? ' align="center"' : "";
  const text = centered ? "text-align:center;" : "";

  // Full width of the card, and no gutter on its row — `max-width` is what
  // keeps it inside a phone, `width` is what Outlook reads instead.
  const banner = hero
    ? `
      <tr><td style="padding:0;font-size:0;line-height:0;">
        <img src="${hero.src}" width="560" alt="${escapeHtml(hero.alt ?? "")}" style="display:block;width:100%;max-width:560px;height:auto;border:0;outline:none;text-decoration:none;">
      </td></tr>`
    : "";

  const label = eyebrow
    ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:${PLUM};">${escapeHtml(eyebrow)}</p>`
    : "";

  const button = cta
    ? `
      <tr><td${align} style="padding:0 ${GUTTER} 36px;${text}">
        <a href="${cta.href}" style="display:inline-block;background:${INK};color:${ACCENT};padding:14px 30px;text-decoration:none;font-family:${FONT};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">${escapeHtml(cta.label)}</a>
      </td></tr>`
    : "";

  const small = footnote
    ? `
      <tr><td${align} style="padding:0 ${GUTTER} 34px;${text}">
        <p style="margin:0;padding-top:22px;border-top:1px solid ${LINE};font-family:${FONT};font-size:12px;line-height:1.7;color:${MUTED};">${footnote}</p>
      </td></tr>`
    : "";

  // A hero already separates itself from the masthead; without one the content
  // needs the breathing room back.
  const contentTop = hero ? "32px" : "36px";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${GROUND};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GROUND};padding:40px 16px;font-family:${FONT};">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};">
        ${masthead()}
        ${banner}
        <tr><td${align} style="padding:${contentTop} ${GUTTER} 30px;${text}">
          ${label}
          <h1 style="margin:0 0 18px;font-family:${SERIF};font-size:30px;font-weight:400;line-height:1.25;letter-spacing:-0.01em;color:${INK};">${escapeHtml(heading)}</h1>
          ${body}
        </td></tr>
        ${button}
        ${small}
      </table>
      <p style="margin:22px 0 0;font-family:${FONT};font-size:11px;letter-spacing:0.06em;color:${MUTED};">Skincare from Seoul, delivered.</p>
    </td></tr>
  </table>
</body></html>`;
}

/** A paragraph of body copy. `text` is escaped; pass `html` for markup. */
export function paragraph(text: string): string {
  return rawParagraph(escapeHtml(text));
}

export function rawParagraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.75;color:${INK};">${html}</p>`;
}

/**
 * A section rule: the label sits on a hairline that runs the width of the card,
 * which is what separates "Delivering to" from the lines above it without a
 * heavier box around either.
 */
export function heading(text: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:34px 0 4px;">
      <tr><td style="padding:0 0 10px;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${PLUM};">${escapeHtml(text)}</td></tr>
    </table>`;
}

/**
 * The one-time code, set large and letter-spaced so it can be read off a phone
 * screen and typed into another window without a second look.
 */
export function codeBlock(code: string): string {
  // Centred two ways on purpose: `align` is what Outlook's Word engine obeys,
  // `margin:auto` is what everything else does. The text-indent pays back the
  // trailing letter-space after the last digit, which would otherwise leave the
  // digits sitting visibly left of centre inside the box.
  return `
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:4px auto 18px;">
      <tr><td align="center" style="background:${GROUND};border:1px solid ${LINE};padding:16px 26px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;letter-spacing:0.28em;text-indent:0.28em;color:${INK};">${escapeHtml(code)}</td></tr>
    </table>`;
}

/** Label/value rows — an address, a set of contact details. */
export function definitionList(items: Array<[string, string]>): string {
  const rows = items
    .filter(([, value]) => value !== "")
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:9px 20px 9px 0;font-family:${FONT};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
          <td style="padding:9px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(value).replace(/\n/g, "<br>")}</td>
        </tr>`
    )
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:6px;">${rows}</table>`;
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
          <td style="padding:14px 0;border-bottom:1px solid ${LINE};font-family:${SERIF};font-size:16px;line-height:1.4;color:${INK};">
            ${escapeHtml(item.title)}
            <span style="font-family:${FONT};font-size:12px;letter-spacing:0.08em;color:${MUTED};">&nbsp;&times;&nbsp;${item.quantity}</span>
          </td>
          <td style="padding:14px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:15px;color:${INK};text-align:right;vertical-align:top;white-space:nowrap;">${money(Number(item.unitPrice) * item.quantity)}</td>
        </tr>`
    )
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:6px;">
      ${rows}
      <tr>
        <td style="padding:18px 0 0;font-family:${FONT};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${MUTED};">Total</td>
        <td style="padding:18px 0 0;font-family:${SERIF};font-size:22px;color:${INK};text-align:right;white-space:nowrap;">${money(total)}</td>
      </tr>
    </table>`;
}
