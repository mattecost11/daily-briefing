// Extend each news item's excerpt with an AI-generated summary (8–10 sentences).
// - Best-effort fetch of the linked article; extractor strips nav/scripts/ads and
//   keeps the article body (<article>/<main>) when present.
// - Gemini 2.0 Flash (free tier), low temperature, short retries.
// - On any per-item failure the item keeps its original RSS excerpt — the card
//   is never left empty and the pipeline never fails on a summariser hiccup.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const NEWS_PATH = resolve(ROOT, 'docs/data/news.json');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const CONCURRENCY = 3;
const FETCH_TIMEOUT_MS = 15000;
const GEMINI_TIMEOUT_MS = 30000;
const MAX_ARTICLE_CHARS = 12000;
const TARGET_SENTENCES = '8–10';
const TARGET_WORDS = '200–250';

function log(...a) { console.log('[summarize]', ...a); }
function warn(...a) { console.warn('[summarize]', ...a); }

if (!GEMINI_API_KEY) {
  warn('GEMINI_API_KEY not set — leaving RSS excerpts untouched.');
  process.exit(0);
}

const news = JSON.parse(await readFile(NEWS_PATH, 'utf8'));

const items = [
  ...(news.cloud?.partnerships || []),
  ...(news.cloud?.acquisitions || []),
  ...(news.cloud?.launches || []),
  ...(news.geo || []),
  ...(news.invest || [])
];

log(`processing ${items.length} items with ${MODEL}`);

let ok = 0, kept = 0, failed = 0;

// Simple concurrency limiter
async function runPool(tasks, limit) {
  const workers = new Array(limit).fill(0).map(async () => {
    while (tasks.length) {
      const t = tasks.shift();
      await t();
    }
  });
  await Promise.all(workers);
}

const tasks = items.map((item) => async () => {
  const original = item.excerpt || '';
  try {
    const body = await fetchArticleText(item.link);
    const source = body && body.length > 200 ? body : original;
    if (!source) { kept++; return; }
    const summary = await summarize(item.title, item.source, source);
    if (summary && summary.length > 60) {
      item.excerpt = summary;
      ok++;
    } else {
      kept++;
    }
  } catch (err) {
    warn(`skip <${item.link || 'no-link'}>: ${err.message}`);
    failed++;
  }
});

await runPool(tasks, CONCURRENCY);

await writeFile(NEWS_PATH, JSON.stringify(news, null, 2) + '\n', 'utf8');
log(`done. summarised=${ok}  kept-original=${kept}  failed=${failed}`);

// ----------------------------------------------------------------------------

async function fetchArticleText(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DailyBriefingBot/0.2; +https://github.com/mattecost11/daily-briefing)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9'
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractMainText(html);
  } catch (_) {
    return null;
  }
}

function extractMainText(html) {
  let s = String(html || '');
  // Remove elements that never contain article prose.
  s = s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ');
  // Prefer <article> / <main> when the page has one.
  const m = s.match(/<article[\s\S]*?<\/article>/i) || s.match(/<main[\s\S]*?<\/main>/i);
  if (m) s = m[0];
  // Extract paragraph text.
  const paragraphs = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = re.exec(s))) {
    const p = decodeEntities(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (p.length >= 40) paragraphs.push(p);
  }
  let text = paragraphs.join('\n\n');
  if (!text) {
    // Fallback: strip all tags.
    text = decodeEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }
  return text.length > MAX_ARTICLE_CHARS ? text.slice(0, MAX_ARTICLE_CHARS) : text;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

async function summarize(title, source, articleText) {
  const prompt = [
    `You are writing a neutral summary of a news article for a briefing app.`,
    ``,
    `Rules:`,
    `- ${TARGET_SENTENCES} sentences (about ${TARGET_WORDS} words). No shorter, no longer.`,
    `- Plain prose, one paragraph. No lists, no headings, no markdown.`,
    `- Report only facts from the article. Do not add opinion, speculation or "why this matters".`,
    `- Do not begin with "This article", "The article", "In this piece" or similar meta phrases.`,
    `- Use British English.`,
    `- If the article is behind a paywall or the text is obviously navigation/boilerplate, output only the exact string: SKIP`,
    ``,
    `Title: ${title}`,
    `Source: ${source}`,
    ``,
    `Article:`,
    articleText
  ].join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      topP: 0.9,
      maxOutputTokens: 800,
      responseMimeType: 'text/plain',
      // Gemini 3.x reserves output tokens for internal "thinking" by default,
      // which can starve the actual answer. We don't need reasoning here.
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS)
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    warn(`gemini HTTP ${res.status} — ${t.slice(0, 200)}`);
    return null;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) return null;
  if (/^SKIP\.?$/i.test(text)) return null;
  return text;
}
