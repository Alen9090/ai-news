# AI News

Dünyadaki yapay zekâ haberlerini tek ekranda toplayan, özetleyen ve tek tıkla
orijinal kaynağına götüren bir haber okuyucu.

![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)
![Dependencies](https://img.shields.io/badge/dependencies-0-blue)

## Özellikler

- **12 kaynak** — daily.dev (Agentic/vibes kanalı), TechCrunch, The Verge, Ars Technica,
  MIT Tech Review, VentureBeat, OpenAI, Google AI, DeepMind, Hugging Face, Hacker News, smol AI.
- **Özetler** — her haber için kısa bir özet. `ANTHROPIC_API_KEY` tanımlıysa özetler
  Claude ile Türkçe üretilir; tanımlı değilse RSS alıntısından çıkarılır.
- **Kaynağa git** — karta tıklayınca daily.dev veya RSS ara sayfası değil, haberin
  orijinal adresi yeni sekmede açılır.
- **Önem rozetleri** — daily.dev haberleri `Son dakika` / `Önemli` / `Dikkat çekici`
  olarak etiketlenir.
- **Kaynak filtresi, arama, açık/koyu tema** — arama kutusuna `/` tuşuyla atlanır.
- **Sıfır npm bağımlılığı** — yalnızca Node'un yerleşik modülleri kullanılır.
- 10 dakikalık önbellek, arka planda otomatik yenileme, kaynak sağlık durumu göstergesi.

## Kurulum

Node.js 18+ gerekir (`fetch` ve `AbortSignal.timeout` için).

```bash
git clone <repo-url>
cd ai-news
npm start
```

Ardından http://localhost:4317 adresini açın.

### AI özetlerini açmak (opsiyonel)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

Anahtar tanımlı olduğunda haberler Claude Haiku ile toplu hâlde özetlenir; sistem
istemi prompt cache'e alınır. Anahtar yoksa uygulama yine tam çalışır, sadece
özetler RSS metninden kırpılır.

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `PORT` | `4317` | Sunucu portu |
| `ANTHROPIC_API_KEY` | — | Tanımlıysa AI özetleri açılır |
| `SUMMARY_LANGUAGE` | `Turkish` | Özet dili |

## Proje yapısı

```
server.js       HTTP sunucusu, önbellek, /api/news uç noktası
sources.js      RSS kaynakları ve daily.dev kanal listesi
rss.js          Bağımlılıksız RSS/Atom ayrıştırıcı
dailydev.js     daily.dev highlights adaptörü
summarize.js    Özetleme (Claude API + alıntı yedeği)
public/         Arayüz (HTML/CSS/JS, framework yok)
```

## daily.dev nasıl okunuyor?

daily.dev'in `/highlights/vibes` sayfasının herkese açık bir RSS akışı yok. Sayfa
Next.js ile sunulduğu için haberler `__NEXT_DATA__` içindeki react-query önbelleğinde
gömülü geliyor; `dailydev.js` bu veriyi ayrıştırıyor. Bağlantılar
`api.daily.dev/r/<postId>` üzerinden orijinal kaynağa yönlendiriliyor.

> Bu, resmî bir API olmadığı için daily.dev sayfa yapısını değiştirirse kırılabilir.
> Böyle bir durumda uygulama çökmez, o kaynak "ulaşılamadı" olarak işaretlenir.

## API

`GET /api/news` → `{ updatedAt, aiSummaries, sources[], items[] }`

`GET /api/news?refresh=1` önbelleği atlayıp kaynakları yeniden çeker.

## Lisans

MIT
