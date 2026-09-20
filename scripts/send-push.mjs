// Send a Web Push notification to the stored subscription.
// Runs inside the refresh workflow after a successful news refresh.
//
// Required env:
//   VAPID_PUBLIC_KEY    (safe to expose; also embedded in docs/js/push.js)
//   VAPID_PRIVATE_KEY   (GitHub secret)
//   PUSH_SUBSCRIPTION   (GitHub secret; JSON payload from pushManager.subscribe)
//
// Behaviour on missing config or expired subscription:
//   logs a warning and exits 0 — the workflow keeps succeeding so the
//   news.json refresh is never held up by a missing / dead subscription.

import webpush from 'web-push';

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
  || 'BBDp4fjLXezLsA8NMgWMs1ilJcb-jimdPHB_auV09jr_o1IR3sUqbCMGEzAM7j6w62EeOyTGBwKbfdDCEWjYOEk';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBSCRIPTION_JSON = process.env.PUSH_SUBSCRIPTION;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:matteo.costamagna03@gmail.com';

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

let subscription;
try {
  subscription = JSON.parse(SUBSCRIPTION_JSON);
} catch (e) {
  warn('PUSH_SUBSCRIPTION is not valid JSON — skipping. ' + e.message);
  process.exit(0);
}

webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

const payload = JSON.stringify({
  title: 'Daily Briefing',
  body: 'New briefing available — tap to open.',
  url: '/daily-briefing/'
});

try {
  const res = await webpush.sendNotification(subscription, payload);
  console.log('[push] sent. statusCode=' + res.statusCode);
} catch (err) {
  // 404 or 410 = subscription is gone (user uninstalled PWA or revoked permission).
  if (err.statusCode === 404 || err.statusCode === 410) {
    warn(`Subscription expired (HTTP ${err.statusCode}). Ask the user to re-enable notifications in the app and update the PUSH_SUBSCRIPTION secret.`);
    process.exit(0);
  }
  warn('Send failed: ' + (err.body || err.message || err));
  process.exit(0);
}
