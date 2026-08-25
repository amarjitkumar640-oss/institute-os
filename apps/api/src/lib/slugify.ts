// Mirrors apps/web/src/lib/utils.ts's slugify() exactly (same regex), so a
// scraped recruitment/current-affair's server-generated slug looks the same
// as one an admin would have typed by hand in the admin UI.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
