import { env } from "./env";

// Firecrawl (hosted API) over Crawl4AI — this stack is pure Node/TypeScript
// with no Python runtime anywhere, and Firecrawl needs nothing beyond an API
// key. Same lazy-init-and-warn-once, return-null-when-unconfigured
// convention as lib/email.ts.
let _warnedUnconfigured = false;

function isConfigured(): boolean {
  if (env.FIRECRAWL_API_KEY) return true;
  if (!_warnedUnconfigured) {
    _warnedUnconfigured = true;
    console.warn("[firecrawl] FIRECRAWL_API_KEY not configured — scraping will not run.");
  }
  return false;
}

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v1/scrape";

/**
 * Fetches a URL via Firecrawl and returns its content as clean markdown
 * (handles JS-rendered pages, strips nav/ads/boilerplate far better than a
 * raw fetch+HTML-parse would for arbitrary, often-messy government sites).
 * Returns null if unconfigured or the fetch fails — callers log and skip
 * that source for this sweep, they don't throw.
 */
export async function scrapeUrlToMarkdown(url: string): Promise<string | null> {
  if (!isConfigured()) return null;

  let response: Response;
  try {
    response = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({ url, formats: ["markdown"] }),
    });
  } catch (e) {
    console.error(`[firecrawl] request failed for ${url}:`, e);
    return null;
  }

  if (!response.ok) {
    console.error(`[firecrawl] scrape of ${url} returned ${response.status}:`, await response.text().catch(() => ""));
    return null;
  }

  const body = (await response.json()) as { success: boolean; data?: { markdown?: string } };
  if (!body.success || !body.data?.markdown) {
    console.error(`[firecrawl] scrape of ${url} returned no markdown content`);
    return null;
  }
  return body.data.markdown;
}
