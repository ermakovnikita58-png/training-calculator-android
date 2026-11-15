import assert from 'node:assert/strict';
import test from 'node:test';
import { createHandler } from '../supabase/functions/verify-entitlement/handler.mjs';
import { createStores, storeAccountId } from '../supabase/functions/verify-entitlement/stores.mjs';

const account = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const accountHash = await storeAccountId(account);
const now = Date.parse('2026-11-11T00:00:00Z');
const expiry = now + 86_400_000;
const play = { store: 'GOOGLE_PLAY', product: 'pro_month', token: 'play-test-123' };
const ru = { store: 'RUSTORE', product: 'pro_month', token: '11111111-1111-4111-8111-111111111111' };
const playPurchase = {
  testPurchase: {},
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  externalAccountIdentifiers: { obfuscatedExternalAccountId: accountHash },
  lineItems: [{ productId: 'pro_month', expiryTime: new Date(expiry).toISOString() }],
  acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
};
const ruPurchase = { code: 'OK', body: { purchaseType: 0, externalAccountId: accountHash,
  paymentState: 1, expiryTimeMillis: String(expiry), autoRenewing: false, acknowledgementState: 'ACKNOWLEDGED' } };

function fixture(purchase, { enabled = true, user = account, ackError = false } = {}) {
  const calls = [];
  const env = key => ({ FORGE_COMMERCE_SANDBOX: String(enabled),
    FORGE_COMMERCE_PRODUCTS_JSON: JSON.stringify({ GOOGLE_PLAY: { pro_month: 'PRO' }, RUSTORE: { pro_month: 'TRAINER' } })
  })[key];
  const handler = createHandler({
    env, now: () => now, authenticate: async () => user,
    stores: { lookup: async () => { calls.push('lookup'); return purchase; },
      acknowledge: async () => { calls.push('ack'); if (ackError) throw new Error('private response'); } },
  });
  const send = (receipt, authenticated = true) => handler(new Request('https://local.example/', {
    method: 'POST', headers: authenticated ? { Authorization: 'Bearer mock' } : {}, body: JSON.stringify(receipt),
  }));
  return { calls, send };
}

test('Google confirms only a verified test purchase belonging to the caller', async () => {
  const f = fixture(playPurchase);
  const result = await f.send(play);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { account, tier: 'PRO', sandbox: true, state: 'ACTIVE', validUntilEpochMs: expiry });
  assert.deepEqual(f.calls, ['lookup', 'ack']);
  for (const bad of [
    fixture(playPurchase, { user: other }),
    fixture({ ...playPurchase, testPurchase: undefined }),
    fixture({ ...playPurchase, lineItems: [{ ...playPurchase.lineItems[0], productId: 'other' }] }),
  ]) {
    assert.equal((await bad.send(play)).status, 403);
    assert.deepEqual(bad.calls, ['lookup']);
  }
});

test('RuStore sandbox cancellation retains access only through the current paid period', async () => {
  const current = fixture(ruPurchase);
  assert.equal((await (await current.send(ru)).json()).state, 'CANCELED');
  assert.deepEqual(current.calls, ['lookup']);
  for (const body of [
    { ...ruPurchase.body, expiryTimeMillis: String(now) },
    { ...ruPurchase.body, cancelReason: 3 },
    { ...ruPurchase.body, paymentState: 0 },
  ]) {
    const f = fixture({ code: 'OK', body });
    assert.equal((await (await f.send(ru)).json()).tier, 'FREE');
    assert.deepEqual(f.calls, ['lookup']);
  }
  assert.equal((await fixture({ code: 'OK', body: { ...ruPurchase.body, purchaseType: undefined } }).send(ru)).status, 403);
});

test('disabled sandbox, missing login and unknown products do not call the stores', async () => {
  const disabled = fixture(playPurchase, { enabled: false });
  const anonymous = fixture(playPurchase);
  assert.equal((await disabled.send(play)).status, 503);
  assert.equal((await anonymous.send(play, false)).status, 401);
  assert.equal((await anonymous.send({ ...play, product: 'unlisted' })).status, 400);
  assert.equal((await anonymous.send({ ...ru, token: 'deprecated-token' })).status, 400);
  assert.deepEqual([...disabled.calls, ...anonymous.calls], []);
});

test('failed acknowledgement grants no access and hides provider details', async () => {
  const result = await fixture(playPurchase, { ackError: true }).send(play);
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: 'verification_unavailable' });
});

test('store adapters sign credentials and use the Google v2 and RuStore sandbox v5 endpoints', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  );
  const privateKey = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  const env = key => ({ FORGE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'service@example.test', private_key: privateKey }),
    FORGE_RUSTORE_SANDBOX_KEY_ID: 'sandbox-id', FORGE_RUSTORE_SANDBOX_PRIVATE_KEY: privateKey })[key];
  const requests = [];
  const stores = createStores(env, async (url, options) => {
    requests.push(url);
    if (url === 'https://oauth2.googleapis.com/token') {
      assert.equal(options.body.get('assertion').split('.').length, 3);
      return Response.json({ access_token: 'mock-play' });
    }
    if (url.endsWith('/public/auth/')) {
      const body = JSON.parse(options.body);
      assert.equal(body.keyId, 'sandbox-id');
      assert.ok(Buffer.from(body.signature, 'base64').length > 0);
      return Response.json({ code: 'OK', body: { jwe: 'mock-ru' } });
    }
    if (url.includes('/subscriptionsv2/tokens/')) {
      assert.equal(options.headers.Authorization, 'Bearer mock-play');
      return Response.json(playPurchase);
    }
    assert.match(url, /\/public\/sandbox\/v5\/subscription\/ru\.trainingcalculator\.app\/pro_month\//);
    assert.equal(options.headers['Public-Token'], 'mock-ru');
    return Response.json(ruPurchase);
  }, () => now);
  assert.deepEqual(await stores.lookup(play), playPurchase);
  assert.deepEqual(await stores.lookup(ru), ruPurchase);
  assert.equal(requests.length, 4);
});
