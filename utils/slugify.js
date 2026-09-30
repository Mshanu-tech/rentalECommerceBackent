/**
 * Turns a display name into a URL-safe slug. Uniqueness (appending -2, -3,
 * etc. on collision) is handled by the caller, since that requires a DB
 * lookup this pure function shouldn't know about.
 */
export function slugify(text) {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
