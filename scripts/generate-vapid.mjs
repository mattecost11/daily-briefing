// Generate a VAPID keypair for Web Push (once).
// The PUBLIC key is committed inside docs/js/push.js.
// The PRIVATE key is a GitHub Actions secret named VAPID_PRIVATE_KEY.
// NEVER commit the private key to the repo.

import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('');
console.log('=== VAPID keys generated ===');
console.log('');
console.log('PUBLIC key  (paste into docs/js/push.js, safe to commit):');
console.log(keys.publicKey);
console.log('');
console.log('PRIVATE key (paste into GitHub secret VAPID_PRIVATE_KEY, NEVER commit):');
console.log(keys.privateKey);
console.log('');
console.log('One-shot gh command to store the private key:');
console.log(`  gh secret set VAPID_PRIVATE_KEY --body "${keys.privateKey}"`);
console.log('');
