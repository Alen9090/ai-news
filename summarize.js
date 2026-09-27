const MODEL = "claude-haiku-4-5-20251001";
const MAX_PER_BATCH = 12;

export function extractiveSummary(text, maxChars = 260) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= maxChars) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [clean];
  let out = "";
  for (const sentence of sentences) {
    if (out && (out + sentence).length > maxChars) break;
    out += sentence;
  }
  out = out.trim();
  if (!out) out = clean.slice(0, maxChars).replace(/\s\S*$/, "");
  return out.length < clean.length ? out.replace(/[.,;:\s]+$/, "") + "…" : out;
}

async function summarizeBatch(apiKey, items, language) {
  const payload = items.map((item, i) => ({
    id: i,
    title: item.title,
    source: item.source,
    excerpt: extractiveSummary(item.body, 900),
  }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text:
            "You summarize AI/tech news headlines. For each article produce one " +
            `neutral sentence (max 30 words) in ${language} capturing the concrete news. ` +
            "No hype, no marketing language, no invented facts. If the excerpt is empty, " +
            "summarize from the title alone. Reply ONLY with a JSON array of " +
            '{"id": number, "summary": string} and nothing else.',
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array in model response");
  return JSON.parse(match[0]);
}

export async function summarizeAll(items, { apiKey, language = "Turkish" } = {}) {
  for (const item of items) {
    item.summary = extractiveSummary(item.body);
    item.summarySource = "excerpt";
  }
  if (!apiKey) return { ai: false, reason: "ANTHROPIC_API_KEY not set" };

  const batches = [];
  for (let i = 0; i < items.length; i += MAX_PER_BATCH) {
    batches.push(items.slice(i, i + MAX_PER_BATCH));
  }

  const results = await Promise.allSettled(
    batches.map((batch) => summarizeBatch(apiKey, batch, language))
  );

  let ok = 0;
  let reason = null;
  results.forEach((result, b) => {
    if (result.status !== "fulfilled") {
      reason ??= result.reason?.message || String(result.reason);
      return;
    }
    for (const entry of result.value) {
      const item = batches[b][entry.id];
      if (item && entry.summary) {
        item.summary = String(entry.summary).trim();
        item.summarySource = "ai";
        ok++;
      }
    }
  });

  return { ai: ok > 0, summarized: ok, reason };
}
