// Daily Briefing — feed refresh pipeline.
// Reads scripts/feeds.json + scripts/rules.json, fetches all feeds concurrently,
// classifies + clusters + deduplicates, writes docs/data/news.json.
// No push notifications yet — that arrives at M7.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Parser from 'rss-parser';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const FEEDS_PATH = resolve(ROOT, 'scripts/feeds.json');
const RULES_PATH = resolve(ROOT, 'scripts/rules.json');
const OUT_PATH = resolve(ROOT, 'docs/data/news.json');

const parser = new Parser({
  timeout: 20000,
  headers: {
    'User-Agent': 'DailyBriefingBot/0.1 (+https://github.com/mattecost11/daily-briefing)'
  }
});

const STOPWORDS = new Set([
  'the','a','an','and','or','of','to','in','on','for','at','by','with','from',
  'is','are','was','were','be','been','being','it','its','as','that','this',
  'these','those','after','over','under','up','down','out','into','not','no',
  'we','you','he','she','they','them','their','his','her','our','my','your',
  'has','have','had','will','shall','can','may','might','would','should','could',
  'do','does','did','done','done','so','if','than','then','also','more','most',
  'says','say','said','new','news','update','breaking','report','reports','reported',
  'about','against','between','before','through','one','two','three','four','five'
]);

// ---------- utilities ----------

const now = new Date();

function log(...a) { console.log('[refresh]', ...a); }

async function readJson(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

function stripTags(s) {
  if (!s) return '';
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

function canonicalUrl(u) {
  try {
    const url = new URL(u);
    // Drop common tracking parameters.
    const drop = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','ito','ref','oc','ncid','cmpid'];
    for (const k of drop) url.searchParams.delete(k);
    // Drop trailing slash consistency and hash.
    url.hash = '';
    let s = url.toString();
    if (s.endsWith('/') && url.pathname.length > 1) s = s.slice(0, -1);
    return s;
  } catch (_) {
    return u || '';
  }
}

function tokens(s) {
  return new Set(
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function hoursAgo(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return Infinity;
  return (now - d) / (1000 * 60 * 60);
}

function matchAnyPattern(text, patterns) {
  const lc = text.toLowerCase();
  for (const p of patterns) {
    try {
      const re = new RegExp(p, 'i');
      if (re.test(lc)) return true;
    } catch (_) {}
  }
  return false;
}

// ---------- fetching ----------

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    const items = (parsed.items || []).map((it) => normaliseItem(it, feed));
    log(`ok  ${feed.name}: ${items.length} items`);
    return items;
  } catch (err) {
    // Fallback: fetch raw, sanitise likely XML issues (unescaped &, control chars), retry.
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'DailyBriefingBot/0.1 (+https://github.com/mattecost11/daily-briefing)' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let text = await res.text();
      // Escape lone ampersands that are not already part of an XML entity.
      text = text.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
      // Strip control chars (0x00–0x1F except tab/newline/carriage return) that break parsers.
      text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      const parsed = await parser.parseString(text);
      const items = (parsed.items || []).map((it) => normaliseItem(it, feed));
      log(`ok* ${feed.name}: ${items.length} items (after sanitise)`);
      return items;
    } catch (err2) {
      log(`FAIL ${feed.name} <${feed.url}>: ${err.message} / fallback: ${err2.message}`);
      return [];
    }
  }
}

function normaliseItem(it, feed) {
  const title = stripTags(it.title || '');
  const link = it.link || it.guid || '';
  const excerpt = truncate(stripTags(it.contentSnippet || it.summary || it.content || ''), 200);
  const publishedIso = it.isoDate || (it.pubDate ? new Date(it.pubDate).toISOString() : null);
  return {
    title,
    link,
    canonical: canonicalUrl(link),
    excerpt,
    published_at: publishedIso,
    source: feed.name,
    topics: feed.topics || [],
    _tokens: tokens(title + ' ' + excerpt)
  };
}

// ---------- deduping ----------

function dedupe(items) {
  const byUrl = new Map();
  for (const it of items) {
    const key = it.canonical || it.link;
    if (!byUrl.has(key)) byUrl.set(key, it);
    else {
      // Prefer the one with a real published_at
      const prev = byUrl.get(key);
      if (!prev.published_at && it.published_at) byUrl.set(key, it);
    }
  }
  return [...byUrl.values()];
}

// ---------- classification ----------

function forTopic(items, topic) {
  return items.filter((it) => (it.topics || []).includes(topic));
}

function classifyCloud(items, rules) {
  const buckets = { partnerships: [], acquisitions: [], launches: [] };
  const cloudRules = rules.cloud || {};
  for (const it of items) {
    const text = (it.title || '') + ' — ' + (it.excerpt || '');
    // Priority order (most specific → most general):
    //   partnerships and acquisitions use specific verbs; launches uses broad
    //   verbs like "announces", so it should come last to avoid stealing items.
    if (matchAnyPattern(text, cloudRules.partnerships?.any_of || [])) {
      buckets.partnerships.push(it);
    } else if (matchAnyPattern(text, cloudRules.acquisitions?.any_of || [])) {
      buckets.acquisitions.push(it);
    } else if (matchAnyPattern(text, cloudRules.launches?.any_of || [])) {
      buckets.launches.push(it);
    }
  }
  return buckets;
}

function classifyInvest(items, rules) {
  const inc = rules.invest?.include_any || [];
  const exc = rules.invest?.exclude_any || [];
  return items.filter((it) => {
    const text = (it.title || '') + ' — ' + (it.excerpt || '');
    if (exc.length && matchAnyPattern(text, exc)) return false;
    if (!inc.length) return true;
    return matchAnyPattern(text, inc);
  });
}

// ---------- geopolitics clustering ----------

function containment(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}

function clusterGeo(items, recencyHours) {
  const fresh = items.filter((it) => hoursAgo(it.published_at) <= recencyHours);
  // Greedy clustering: each item joins the first existing cluster whose
  // representative has jaccard ≥ 0.3 OR containment ≥ 0.6 (near-duplicate),
  // else starts a new one.
  const clusters = [];
  for (const it of fresh) {
    let joined = null;
    for (const c of clusters) {
      if (
        jaccard(it._tokens, c.rep._tokens) >= 0.3 ||
        containment(it._tokens, c.rep._tokens) >= 0.45
      ) {
        c.items.push(it);
        joined = c;
        break;
      }
    }
    if (!joined) clusters.push({ rep: it, items: [it] });
  }
  // Rank: number of distinct sources first, then newest.
  for (const c of clusters) {
    c.sources = new Set(c.items.map((i) => i.source));
    c.newest = Math.max(...c.items.map((i) => new Date(i.published_at || 0).getTime()));
  }
  clusters.sort((a, b) => (b.sources.size - a.sources.size) || (b.newest - a.newest));
  return clusters;
}

// ---------- shaping ----------

function shape(it) {
  return {
    title: it.title,
    link: it.link,
    source: it.source,
    published_at: it.published_at,
    excerpt: it.excerpt
  };
}

function sortByDate(items) {
  return [...items].sort((a, b) => {
    const da = new Date(a.published_at || 0).getTime();
    const db = new Date(b.published_at || 0).getTime();
    return db - da;
  });
}

// ---------- main ----------

async function main() {
  const [{ feeds }, rules] = await Promise.all([readJson(FEEDS_PATH), readJson(RULES_PATH)]);
  const limit = rules.limits?.max_items_per_section ?? 5;
  log(`starting; ${feeds.length} feeds, limit ${limit}/section, ${now.toISOString()}`);

  // Fetch all feeds concurrently.
  const results = await Promise.all(feeds.map(fetchFeed));
  let all = dedupe(results.flat().filter((it) => it.title && it.link));
  log(`total unique items (raw): ${all.length}`);

  // Global filters: drop very thin items and anything matching global exclude patterns.
  const minLen = rules.global?.min_excerpt_chars ?? 0;
  const globalExclude = rules.global?.exclude_any || [];
  const before = all.length;
  all = all.filter((it) => {
    if ((it.excerpt || '').length < minLen) return false;
    const text = (it.title || '') + ' — ' + (it.excerpt || '');
    if (globalExclude.length && matchAnyPattern(text, globalExclude)) return false;
    return true;
  });
  log(`after global filters: ${all.length} (dropped ${before - all.length})`);

  // Cloud dashboard.
  const cloudPool = forTopic(all, 'cloud');
  const cloudBuckets = classifyCloud(cloudPool, rules);
  const cloud = {
    partnerships: sortByDate(cloudBuckets.partnerships).slice(0, limit).map(shape),
    acquisitions: sortByDate(cloudBuckets.acquisitions).slice(0, limit).map(shape),
    launches:     sortByDate(cloudBuckets.launches).slice(0, limit).map(shape)
  };

  // Geopolitics.
  const geoPool = forTopic(all, 'geo');
  const geoClusters = clusterGeo(geoPool, rules.geo?.recency_hours ?? 72);
  const geo = geoClusters.slice(0, limit).map((c) => {
    // Pick the most recent, longest item as the representative for display.
    const rep = [...c.items].sort((a, b) => {
      const t = new Date(b.published_at || 0) - new Date(a.published_at || 0);
      if (t) return t;
      return (b.excerpt?.length || 0) - (a.excerpt?.length || 0);
    })[0];
    return {
      ...shape(rep),
      also_covered_by: [...c.sources].filter((s) => s !== rep.source),
      sources_count: c.sources.size
    };
  });

  // Investments.
  const investPool = forTopic(all, 'invest');
  const investFiltered = classifyInvest(investPool, rules);
  const invest = sortByDate(investFiltered).slice(0, limit).map(shape);

  const out = {
    generated_at: now.toISOString(),
    schedule: 'Mon & Thu 07:00 Europe/London',
    cloud,
    geo,
    invest
  };

  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  log(`wrote ${OUT_PATH}`);
  log(`  cloud.partnerships: ${cloud.partnerships.length}`);
  log(`  cloud.acquisitions: ${cloud.acquisitions.length}`);
  log(`  cloud.launches:     ${cloud.launches.length}`);
  log(`  geo:                ${geo.length}  (from ${geoClusters.length} clusters)`);
  log(`  invest:             ${invest.length}`);
}

main().catch((err) => {
  console.error('refresh failed:', err);
  process.exit(1);
});
