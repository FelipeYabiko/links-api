import { randomInt } from "node:crypto";

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/l/I
export const SLUG_PATTERN = "^[a-zA-Z0-9_-]{3,32}$";
const RESERVED = new Set(["auth", "links", "docs", "health", "api"]);

export function generateSlug(length = 7): string {
  let slug = "";
  for (let i = 0; i < length; i++) slug += ALPHABET[randomInt(ALPHABET.length)];
  return slug;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug.toLowerCase());
}
