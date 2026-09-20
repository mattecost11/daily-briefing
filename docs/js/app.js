// Daily Briefing — main app logic
// Loads news + theory, routes tabs, computes today's unlocked notions.

import { initPushUi } from './push.js';

const STORAGE = {
  installDate: 'db.installDate',
  lastSeenGeneratedAt: 'db.lastSeenGeneratedAt',
  onboarded: 'db.onboarded'
};

const state = {
  news: null,
  theory: null
};

// ---------- Boot ----------

registerServiceWorker();
initRouting();
initOnboarding();
loadData().then(render).catch((err) => {
  console.error('load failed', err);
  render();
});
initPushUi();

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((e) => {
      console.warn('SW registration failed', e);
    });
  });
}

// ---------- Routing ----------

function initRouting() {
  const routes = ['cloud', 'geo', 'invest', 'library'];
  function apply() {
    const hash = (location.hash || '#cloud').slice(1);
    const tab = routes.includes(hash) ? hash : 'cloud';
    // Only show one dashboard view (onboarding is separate)
    for (const r of routes) {
      const el = document.getElementById(`view-${r}`);
      if (el) el.hidden = r !== tab;
    }
    for (const a of document.querySelectorAll('#tab-bar a')) {
      a.classList.toggle('active', a.dataset.tab === tab);
    }
  }
  window.addEventListener('hashchange', apply);
  apply();
}

// ---------- Onboarding ----------

function initOnboarding() {
  const wasOnboarded = localStorage.getItem(STORAGE.onboarded) === '1';
  const forceSetup = location.hash === '#setup';
  const onboardingView = document.getElementById('view-onboarding');
  if (wasOnboarded && !forceSetup) {
    onboardingView.hidden = true;
    return;
  }
  // Hide dashboards, show onboarding
  for (const id of ['view-cloud', 'view-geo', 'view-invest', 'view-library']) {
    document.getElementById(id).hidden = true;
  }
  onboardingView.hidden = false;

  // Stamp install date the first time onboarding is seen, so theory unlock
  // starts today whether or not the user actually enables notifications.
  if (!localStorage.getItem(STORAGE.installDate)) {
    localStorage.setItem(STORAGE.installDate, todayIsoDate());
  }

  // Enable notifications: push.js owns this whole flow — do NOT dismiss the
  // onboarding here, because the JSON block appears inside it and the user
  // must be able to see and copy it.
  document.getElementById('dismiss-onboarding').addEventListener('click', finishOnboarding);
}

function finishOnboarding() {
  localStorage.setItem(STORAGE.onboarded, '1');
  if (!localStorage.getItem(STORAGE.installDate)) {
    localStorage.setItem(STORAGE.installDate, todayIsoDate());
  }
  document.getElementById('view-onboarding').hidden = true;
  // Force re-apply so the correct tab is shown.
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  render();
}

// ---------- Data loading ----------

async function loadData() {
  const [news, theory] = await Promise.all([
    fetchJson('data/news.json'),
    fetchJson('data/theory.json')
  ]);
  state.news = news;
  state.theory = theory;
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

// ---------- Rendering ----------

function render() {
  renderHeader();
  renderCloud();
  renderGeo();
  renderInvest();
  renderLibrary();
}

function renderHeader() {
  const label = document.getElementById('last-updated');
  const badge = document.getElementById('new-badge');
  if (!state.news || !state.news.generated_at) {
    label.textContent = 'No data yet';
    badge.hidden = true;
    return;
  }
  const gen = new Date(state.news.generated_at);
  label.textContent = `Last updated: ${formatDateTime(gen)}`;
  const lastSeen = localStorage.getItem(STORAGE.lastSeenGeneratedAt);
  const isNew = !lastSeen || lastSeen !== state.news.generated_at;
  badge.hidden = !isNew;
  // Mark as seen after render so a fresh install still shows "New" once.
  localStorage.setItem(STORAGE.lastSeenGeneratedAt, state.news.generated_at);
}

function renderCloud() {
  fillItems('cloud.partnerships', state.news?.cloud?.partnerships);
  fillItems('cloud.acquisitions', state.news?.cloud?.acquisitions);
  fillItems('cloud.launches', state.news?.cloud?.launches);
}

function renderGeo() {
  fillItems('geo', state.news?.geo);
}

function renderInvest() {
  fillItems('invest', state.news?.invest);
  const todaysNotions = todaysUnlockedNotions();
  fillNotions('theory-today', todaysNotions);
}

function renderLibrary() {
  const list = document.getElementById('library-list');
  const empty = document.getElementById('library-empty');
  const search = document.getElementById('library-search');
  const filter = document.getElementById('library-filter');
  const unlocked = allUnlockedNotions();

  function draw() {
    const q = (search.value || '').trim().toLowerCase();
    const level = filter.value;
    const filtered = unlocked.filter((n) => {
      if (level !== 'all' && n.level !== level) return false;
      if (!q) return true;
      return (
        (n.title || '').toLowerCase().includes(q) ||
        (n.description || '').toLowerCase().includes(q) ||
        (n.example || '').toLowerCase().includes(q)
      );
    });
    list.innerHTML = '';
    if (filtered.length === 0) {
      empty.hidden = false;
      empty.textContent = unlocked.length === 0
        ? 'Nothing unlocked yet. Come back tomorrow.'
        : 'No notions match your search.';
      return;
    }
    empty.hidden = true;
    for (const n of filtered) list.appendChild(notionCard(n));
  }
  search.oninput = draw;
  filter.onchange = draw;
  draw();
}

function fillItems(selectorKey, items) {
  const list = document.querySelector(`[data-group="${selectorKey}"]`);
  if (!list) return;
  list.innerHTML = '';
  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.className = 'card rule-note';
    li.textContent = 'No items yet. The next scheduled refresh will populate this.';
    list.appendChild(li);
    return;
  }
  for (const it of items) list.appendChild(newsCard(it));
}

function fillNotions(selectorKey, notions) {
  const list = document.querySelector(`[data-group="${selectorKey}"]`);
  if (!list) return;
  list.innerHTML = '';
  if (!notions || notions.length === 0) {
    const li = document.createElement('li');
    li.className = 'card rule-note';
    li.textContent = 'No new notions today.';
    list.appendChild(li);
    return;
  }
  for (const n of notions) list.appendChild(notionCard(n));
}

function newsCard(it) {
  const li = document.createElement('li');
  li.className = 'card';
  const link = document.createElement('a');
  link.className = 'card-link';
  link.href = it.link || '#';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const title = document.createElement('p');
  title.className = 'title';
  title.textContent = it.title || '';
  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = `${it.source || 'Unknown source'} · ${formatDate(new Date(it.published_at || Date.now()))}`;
  const excerpt = document.createElement('p');
  excerpt.className = 'excerpt';
  excerpt.textContent = truncate(it.excerpt || '', 200);
  link.append(title, meta, excerpt);
  li.appendChild(link);
  return li;
}

function notionCard(n) {
  const li = document.createElement('li');
  li.className = 'card notion';
  const header = document.createElement('p');
  header.className = 'title';
  const badge = document.createElement('span');
  badge.className = `level-badge ${n.level || 'beginner'}`;
  badge.textContent = capitalize(n.level || 'beginner');
  header.append(badge, document.createTextNode(n.title || ''));
  const desc = document.createElement('p');
  desc.className = 'excerpt';
  desc.textContent = n.description || '';
  li.append(header, desc);
  if (n.example) {
    const ex = document.createElement('div');
    ex.className = 'example';
    ex.textContent = `Example: ${n.example}`;
    li.appendChild(ex);
  }
  if (n.takeaway) {
    const t = document.createElement('p');
    t.className = 'takeaway';
    t.textContent = `→ ${n.takeaway}`;
    li.appendChild(t);
  }
  return li;
}

// ---------- Theory unlock ----------

function todayIsoDate() {
  const d = new Date();
  // Local date, YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysSinceInstall() {
  const install = localStorage.getItem(STORAGE.installDate);
  if (!install) return 0;
  const start = new Date(install + 'T00:00:00');
  const now = new Date(todayIsoDate() + 'T00:00:00');
  const diff = Math.floor((now - start) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
}

function currentDayNumber() {
  // Day 1 on install day.
  return daysSinceInstall() + 1;
}

function allUnlockedNotions() {
  if (!state.theory || !Array.isArray(state.theory.notions)) return [];
  const today = currentDayNumber();
  return state.theory.notions
    .filter((n) => Number.isFinite(n.day) && n.day <= today)
    .sort((a, b) => a.day - b.day || (a.order || 0) - (b.order || 0));
}

function todaysUnlockedNotions() {
  if (!state.theory || !Array.isArray(state.theory.notions)) return [];
  const today = currentDayNumber();
  return state.theory.notions
    .filter((n) => n.day === today)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

// ---------- Utils ----------

function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(d) {
  try {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (_) {
    return d.toISOString().slice(0, 10);
  }
}

function formatDateTime(d) {
  try {
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  } catch (_) {
    return d.toISOString();
  }
}
