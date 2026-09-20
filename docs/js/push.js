// Web Push helpers.
// Wired end-to-end at M7; for M1 we only ship the safe scaffolding.

// The VAPID public key is generated once and pasted here at M7.
// Placeholder now — do not attempt to subscribe until this is a real key.
export const VAPID_PUBLIC_KEY = '';

export function initPushUi() {
  // Placeholder — real subscription flow lands in M7.
  // Kept as a no-op so app.js can safely import it today.
}

// Utility that will be used at M7 to convert the VAPID public key to a Uint8Array.
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}
