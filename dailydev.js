import { stripHtml } from "./rss.js";

const PAGE = "https://daily.dev/highlights/";
const REDIRECT = "https://api.daily.dev/r/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// daily.dev is a client-rendered Next.js app; highlights are embedded in the
// __NEXT_DATA__ react-query cache rather than exposed via a public feed.
function extractNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("__NEXT_DATA__ not found (page layout changed)");
  return JSON.parse(m[1]);
}

export async function fetchDailyDevChannel(channel, { limit = 40, timeoutMs = 15000 } = {}) {
  const res = await fetch(PAGE + encodeURIComponent(channel), {
    headers: { "user-agent": UA, accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const queries = extractNextData(await res.text())?.props?.pageProps?.dehydratedState?.queries || [];
  const feed = queries.find((q) => q.queryKey?.[0] === "channel-highlights-feed");
  const highlights = feed?.state?.data?.postHighlights;
  if (!Array.isArray(highlights)) throw new Error("no postHighlights in page data");

  return highlights
    .filter((h) => h.post?.id && h.headline)
    .slice(0, limit)
    .map((h) => ({
      title: stripHtml(h.headline),
      // /r/<id> redirects to the original article instead of the daily.dev page.
      url: REDIRECT + h.post.id,
      body: stripHtml(h.post.summary || h.post.contentHtml || ""),
      image: h.post.source?.image || "",
      author: h.post.source?.name || h.post.domain || "",
      publishedAt: h.highlightedAt || null,
      significance: h.significance || null,
      domain: h.post.domain || "",
    }));
}
