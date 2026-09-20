// Web Push subscription flow.
// The public key is safe to commit. The private key lives only as the
// GitHub Actions secret VAPID_PRIVATE_KEY.

export const VAPID_PUBLIC_KEY =
  'BBDp4fjLXezLsA8NMgWMs1ilJcb-jimdPHB_auV09jr_o1IR3sUqbCMGEzAM7j6w62EeOyTGBwKbfdDCEWjYOEk';

export function initPushUi() {
  const btn = document.getElementById('enable-notifications');
  if (btn) btn.addEventListener('click', handleEnableClick);

  const copyBtn = document.getElementById('copy-subscription');
  if (copyBtn) copyBtn.addEventListener('click', copySubscription);
}

async function handleEnableClick(event) {
  event.preventDefault();
  const msg = document.getElementById('subscription-message');
  const box = document.getElementById('subscription-result');
  const btn = document.getElementById('enable-notifications');

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showResult('This browser does not support push notifications. On iPhone, make sure you have added the app to the Home Screen and opened it from there.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Requesting permission…';

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showResult('Notifications were not allowed. You can still open the app any time to read the latest briefing.');
      btn.disabled = false;
      btn.textContent = 'Try again';
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const json = JSON.stringify(sub.toJSON(), null, 2);
    document.getElementById('subscription-json').value = json;
    document.getElementById('subscription-result').hidden = false;
    showResult('✓ Subscribed. Copy the text below and send it to your setup computer.');
    btn.hidden = true;
  } catch (err) {
    console.error(err);
    showResult('Could not subscribe: ' + (err.message || err));
    btn.disabled = false;
    btn.textContent = 'Try again';
  }
}

async function copySubscription() {
  const ta = document.getElementById('subscription-json');
  if (!ta) return;
  try {
    await navigator.clipboard.writeText(ta.value);
    const btn = document.getElementById('copy-subscription');
    if (btn) {
      const old = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => (btn.textContent = old), 2000);
    }
  } catch (_) {
    ta.focus();
    ta.select();
  }
}

function showResult(text) {
  const el = document.getElementById('subscription-message');
  if (el) {
    el.textContent = text;
    el.hidden = false;
  }
}

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}
