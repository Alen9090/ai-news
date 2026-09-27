import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { RSS_SOURCES, DAILYDEV_CHANNELS } from "./sources.js";
import { parseFeed } from "./rss.js";
import { fetchDailyDevChannel } from "./dailydev.js";
import { summarizeAll } from "./summarize.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(ROOT, "public");
const PORT = Number(process.env.PORT) || 4317;
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;
const PER_SOURCE_LIMIT = 12;
const DAILYDEV_LIMIT = 45;
const MAX_ITEMS = 150;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

let cache = { at: 0, payload: null };
let inFlight = null;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchRss(source) {
  const res = await fetch(source.url, {
    headers: {
      "user-agent": UA,
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text())
    .slice(0, PER_SOURCE_LIMIT)
    .map((item) => ({ ...item, source: source.name }));
}

async function fetchDailyDev(source) {
  const items = await fetchDailyDevChannel(source.channel, {
    limit: DAILYDEV_LIMIT,
    timeoutMs: FETCH_TIMEOUT_MS,
  });
  return items.map((item) => ({ ...item, source: source.name }));
}

const ALL_SOURCES = [
  ...DAILYDEV_CHANNELS.map((s) => ({ ...s, load: () => fetchDailyDev(s) })),
  ...RSS_SOURCES.map((s) => ({ ...s, load: () => fetchRss(s) })),
];

function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9ğüşıöç ]/gi, "").replace(/\s+/g, " ").trim();
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const keys = [item.url.split("?")[0], normalizeTitle(item.title)];
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
}

async function buildFeed() {
  const settled = await Promise.allSettled(ALL_SOURCES.map((s) => s.load()));

  const sourceStatus = ALL_SOURCES.map((source, i) => ({
    name: source.name,
    ok: settled[i].status === "fulfilled",
    count: settled[i].status === "fulfilled" ? settled[i].value.length : 0,
    error: settled[i].status === "rejected" ? String(settled[i].reason?.message || settled[i].reason) : null,
  }));

  const items = dedupe(
    settled
      .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
      .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
  ).slice(0, MAX_ITEMS);

  const summary = await summarizeAll(items, {
    apiKey: process.env.ANTHROPIC_API_KEY,
    language: process.env.SUMMARY_LANGUAGE || "Turkish",
  });

  items.forEach((item) => delete item.body);

  return {
    updatedAt: new Date().toISOString(),
    aiSummaries: summary.ai,
    note: summary.reason,
    sources: sourceStatus,
    items,
  };
}

async function getFeed(force) {
  if (!force && cache.payload && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.payload, cached: true };
  }
  inFlight ??= buildFeed()
    .then((payload) => {
      cache = { at: Date.now(), payload };
      return payload;
    })
    .finally(() => { inFlight = null; });
  return { ...(await inFlight), cached: false };
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

async function serveStatic(res, pathname) {
  const rel = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const file = join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/news") {
      return sendJson(res, 200, await getFeed(url.searchParams.get("refresh") === "1"));
    }
    await serveStatic(res, url.pathname);
  } catch (err) {
    sendJson(res, 500, { error: String(err?.message || err) });
  }
}).listen(PORT, () => {
  console.log(`AI News → http://localhost:${PORT}`);
  console.log(
    process.env.ANTHROPIC_API_KEY
      ? "Özetler: Claude ile üretiliyor"
      : "Özetler: RSS alıntısı (ANTHROPIC_API_KEY ekleyerek AI özet açabilirsiniz)"
  );
});
