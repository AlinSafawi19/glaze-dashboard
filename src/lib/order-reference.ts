import "server-only";

import { randomInt } from "node:crypto";

/**
 * The reference a shopper is given for their order.
 *
 * Deliberately not the row's sequential `number`: handing that out tells anyone
 * who places two orders exactly how many the shop has taken in between, which
 * is a business figure, not the customer's.
 *
 * The alphabet drops the pairs that get misheard and mistyped — no 0/O, no
 * 1/I — because this gets read down the phone to a courier. Eight characters
 * from thirty-two is about 1.1 x 10^12 references; the store would need to be
 * taking a million orders a day for a century before a birthday collision is
 * likely, and the unique index catches one anyway.
 */

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PREFIX = "GLZ";

/** How many times to try again if the unique index rejects a reference. */
export const REFERENCE_ATTEMPTS = 5;

function block(length: number): string {
  let out = "";
  // `randomInt` rather than Math.random: a guessable reference is an order
  // somebody else can look up.
  for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return out;
}

/** `GLZ-7K4M-2QX9` */
export function newOrderReference(): string {
  return `${PREFIX}-${block(4)}-${block(4)}`;
}

/**
 * Accepts what someone actually types — lower case, spaces, a missing prefix,
 * the dashes left out — and returns the canonical form, or null if it could
 * not be one of ours. Used by the dashboard's search box.
 */
export function normaliseOrderReference(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const body = cleaned.startsWith(PREFIX) ? cleaned.slice(PREFIX.length) : cleaned;

  if (body.length !== 8) return null;
  if ([...body].some((char) => !ALPHABET.includes(char))) return null;

  return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}
