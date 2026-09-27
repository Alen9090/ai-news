const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", eacute: "é", shy: "",
};

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function stripHtml(html) {
  return decodeEntities(
    String(html)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/?[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function unwrap(raw) {
  const cdata = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return cdata ? cdata[1] : raw;
}

function tag(block, names) {
  for (const name of [].concat(names)) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
    const m = block.match(re);
    if (m) return unwrap(m[1]).trim();
  }
  return "";
}

function link(block) {
  const href = block.match(/<link[^>]*\srel=["']alternate["'][^>]*\shref=["']([^"']+)["']/i)
    || block.match(/<link[^>]*\shref=["']([^"']+)["'][^>]*\/?>/i);
  if (href) return decodeEntities(href[1]);
  const inner = tag(block, "link");
  if (inner) return decodeEntities(inner);
  const guid = tag(block, "guid");
  return /^https?:\/\//.test(guid) ? guid : "";
}

function image(block) {
  const candidates = [
    /<media:(?:content|thumbnail)[^>]*\surl=["']([^"']+)["']/i,
    /<enclosure[^>]*\stype=["']image\/[^"']*["'][^>]*\surl=["']([^"']+)["']/i,
    /<enclosure[^>]*\surl=["']([^"']+\.(?:jpg|jpeg|png|webp|gif))["']/i,
  ];
  for (const re of candidates) {
    const m = block.match(re);
    if (m) return decodeEntities(m[1]);
  }
  const body = tag(block, ["content:encoded", "description", "content", "summary"]);
  const img = body.match(/<img[^>]*\ssrc=["']([^"']+)["']/i);
  return img ? decodeEntities(img[1]) : "";
}

// hnrss descriptions are boilerplate ("Article URL: … Points: … # Comments: …")
// rather than prose, so turn the only useful part into the summary.
function cleanBody(text) {
  if (!/^Article URL:/.test(text)) return text;
  const points = text.match(/Points:\s*(\d+)/)?.[1];
  const comments = text.match(/#\s*Comments:\s*(\d+)/)?.[1];
  return [points && `${points} puan`, comments && `${comments} yorum`]
    .filter(Boolean)
    .join(" · ");
}

export function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];
  return blocks.map((block) => {
    const body = tag(block, ["description", "summary", "content:encoded", "content"]);
    const dateStr = tag(block, ["pubDate", "published", "updated", "dc:date"]);
    const parsed = dateStr ? Date.parse(dateStr) : NaN;
    return {
      title: stripHtml(tag(block, "title")),
      url: link(block),
      body: cleanBody(stripHtml(body)),
      image: image(block),
      author: stripHtml(tag(block, ["dc:creator", "author"])) || "",
      publishedAt: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(),
    };
  }).filter((item) => item.title && item.url);
}
