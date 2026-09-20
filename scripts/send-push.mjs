// Send a Web Push notification to every stored subscription.
// Runs inside the refresh workflow after a successful news refresh.
//
// Required env:
//   VAPID_PUBLIC_KEY    (safe to expose; also embedded in docs/js/push.js)
//   VAPID_PRIVATE_KEY   (GitHub secret)
//   PUSH_SUBSCRIPTION   (GitHub secret; may be either
//                        - a single subscription JSON object, OR
//                        - a JSON array of subscription objects for multi-device)
//
// Behaviour on missing config or expired subscription:
//   logs a warning and exits 0 — the workflow keeps succeeding so the
//   news.json refresh is never held up by a missing / dead subscription.
//   Per-device failures are logged individually and never stop the batch.

import webpush from 'web-push';

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
  || 'BBDp4fjLXezLsA8NMgWMs1ilJcb-jimdPHB_auV09jr_o1IR3sUqbCMGEzAM7j6w62EeOyTGBwKbfdDCEWjYOEk';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBSCRIPTION_JSON = process.env.PUSH_SUBSCRIPTION;
// VAPID subject: a mailto: URL OR an https:// URL identifying this service.
// The push service uses it as a contact point if something goes wrong. The URL
// of the app itself is a perfectly valid value, and is not personal info.
const SUBJECT = process.env.VAPID_SUBJECT || 'https://mattecost11.github.io/daily-briefing/';

function warn(msg) {
  console.warn('[push] ' + msg);
}

if (!PRIVATE_KEY) {
  warn('VAPID_PRIVATE_KEY not set — skipping notification.');
  process.exit(0);
}
if (!SUBSCRIPTION_JSON) {
  warn('PUSH_SUBSCRIPTION not set — skipping notification. (Add it after the user taps "Enable notifications" in the installed PWA.)');
  process.exit(0);
}

let parsed;
try {
  parsed = JSON.parse(SUBSCRIPTION_JSON);
} catch (e) {
  warn('PUSH_SUBSCRIPTION is not valid JSON — skipping. ' + e.message);
  process.exit(0);
}

// Normalise: accept a single subscription object OR an array.
const subscriptions = Array.isArray(parsed) ? parsed : [parsed];
const valid = subscriptions.filter((s) => s && typeof s === 'object' && s.endpoint);
if (valid.length === 0) {
  warn('No valid subscriptions found in PUSH_SUBSCRIPTION — skipping.');
  process.exit(0);
}

webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

const payload = JSON.stringify({
  title: 'Daily Briefing',
  body: 'New briefing available — tap to open.',
  url: '/daily-briefing/'
});

function short(sub) {
  try {
    const host = new URL(sub.endpoint).host;
    const tail = sub.endpoint.slice(-8);
    return `${host}/…${tail}`;
  } catch { return '?'; }
}

let ok = 0, expired = 0, failed = 0;

for (const sub of valid) {
  try {
    const res = await webpush.sendNotification(sub, payload);
    console.log(`[push] ok  ${short(sub)} statusCode=${res.statusCode}`);
    ok++;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      warn(`expired ${short(sub)} (HTTP ${err.statusCode}) — device probably uninstalled the PWA or revoked notifications. Regenerate its subscription and update PUSH_SUBSCRIPTION.`);
      expired++;
    } else {
      warn(`fail   ${short(sub)} — ${err.body || err.message || err}`);
      failed++;
    }
  }
}

console.log(`[push] done. devices=${valid.length}  ok=${ok}  expired=${expired}  failed=${failed}`);
