const feedEl = document.getElementById("feed");
const metaEl = document.getElementById("meta");
const filtersEl = document.getElementById("filters");
const statusEl = document.getElementById("sources-status");
const searchEl = document.getElementById("search");
const refreshEl = document.getElementById("refresh");
const themeEl = document.getElementById("theme");

const SIGNIFICANCE = { breaking: "Son dakika", major: "Önemli", notable: "Dikkat çekici" };

let data = { items: [], sources: [] };
let activeSource = "all";
let query = "";

const savedTheme = localStorage.getItem("ai-news-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

themeEl.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("ai-news-theme", next);
});

function timeAgo(iso) {
  if (!iso) return "tarih yok";
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return "tarih yok";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR");
}

function matches(item) {
  if (activeSource !== "all" && item.source !== activeSource) return false;
  if (!query) return true;
  return `${item.title} ${item.summary} ${item.source}`.toLowerCase().includes(query);
}

function renderFilters() {
  const counts = new Map();
  for (const item of data.items) counts.set(item.source, (counts.get(item.source) || 0) + 1);

  const chips = [["all", `Tümü (${data.items.length})`]].concat(
    [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => [name, `${name} (${n})`])
  );

  filtersEl.replaceChildren(
    ...chips.map(([value, label]) => {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.textContent = label;
      btn.setAttribute("aria-pressed", String(value === activeSource));
      btn.addEventListener("click", () => {
        activeSource = value;
        renderFilters();
        renderFeed();
      });
      return btn;
    })
  );
}

function card(item) {
  const a = document.createElement("a");
  a.className = "card";
  a.href = item.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  if (item.image) {
    const img = document.createElement("img");
    img.className = "thumb";
    img.src = item.image;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove());
    a.append(img);
  }

  const body = document.createElement("div");
  body.className = "card-body";

  const top = document.createElement("div");
  top.className = "card-top";
  const src = document.createElement("span");
  src.className = "src";
  src.textContent = item.source;
  const time = document.createElement("span");
  time.textContent = timeAgo(item.publishedAt);
  top.append(src, time);
  if (SIGNIFICANCE[item.significance]) {
    const badge = document.createElement("span");
    badge.className = `badge sig-${item.significance}`;
    badge.textContent = SIGNIFICANCE[item.significance];
    top.append(badge);
  }
  if (item.summarySource === "ai") {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "AI özet";
    top.append(badge);
  }

  const title = document.createElement("h2");
  title.textContent = item.title;

  const summary = document.createElement("p");
  summary.className = "summary";
  summary.textContent = item.summary || "Özet bulunamadı.";

  const foot = document.createElement("div");
  foot.className = "card-foot";
  const host = document.createElement("span");
  if (item.domain) {
    host.textContent = item.domain.replace(/^www\./, "");
  } else {
    try { host.textContent = new URL(item.url).hostname.replace(/^www\./, ""); } catch { host.textContent = ""; }
  }
  const go = document.createElement("span");
  go.className = "go";
  go.textContent = "Kaynağa git →";
  foot.append(host, go);

  body.append(top, title, summary, foot);
  a.append(body);
  return a;
}

function renderFeed() {
  const visible = data.items.filter(matches);
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Eşleşen haber yok.";
    feedEl.replaceChildren(empty);
    return;
  }
  feedEl.replaceChildren(...visible.map(card));
}

function renderSkeletons() {
  feedEl.replaceChildren(
    ...Array.from({ length: 9 }, () => {
      const el = document.createElement("div");
      el.className = "skeleton";
      return el;
    })
  );
}

async function load(force = false) {
  refreshEl.disabled = true;
  feedEl.setAttribute("aria-busy", "true");
  if (!data.items.length) renderSkeletons();

  try {
    const res = await fetch(`/api/news${force ? "?refresh=1" : ""}`);
    if (!res.ok) throw new Error(`Sunucu hatası ${res.status}`);
    data = await res.json();

    const mode = data.aiSummaries ? "Claude özetleri" : "RSS alıntıları";
    metaEl.textContent = `${data.items.length} haber · ${mode} · güncellendi ${timeAgo(data.updatedAt)}`;

    const failed = (data.sources || []).filter((s) => !s.ok);
    statusEl.textContent = failed.length
      ? `Ulaşılamayan kaynaklar: ${failed.map((s) => `${s.name} (${s.error})`).join(", ")}`
      : `Tüm kaynaklar çalışıyor: ${(data.sources || []).map((s) => s.name).join(" · ")}`;

    renderFilters();
    renderFeed();
  } catch (err) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = `Haberler yüklenemedi: ${err.message}`;
    feedEl.replaceChildren(empty);
    metaEl.textContent = "Bağlantı hatası";
  } finally {
    refreshEl.disabled = false;
    feedEl.setAttribute("aria-busy", "false");
  }
}

let debounce;
searchEl.addEventListener("input", (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    query = e.target.value.trim().toLowerCase();
    renderFeed();
  }, 120);
});

refreshEl.addEventListener("click", () => load(true));
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== searchEl) {
    e.preventDefault();
    searchEl.focus();
  }
});

load();
setInterval(() => load(), 10 * 60 * 1000);
