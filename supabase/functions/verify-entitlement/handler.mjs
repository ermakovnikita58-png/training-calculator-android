import { storeAccountId } from './stores.mjs';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const productId = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const playToken = /^[A-Za-z0-9_.~+-]{8,4096}$/;
const playStates = new Map([
  ['SUBSCRIPTION_STATE_ACTIVE', 'ACTIVE'],
  ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'ACTIVE'],
  ['SUBSCRIPTION_STATE_CANCELED', 'CANCELED'],
  ['SUBSCRIPTION_STATE_EXPIRED', 'EXPIRED'],
  ['SUBSCRIPTION_STATE_ON_HOLD', 'PENDING'],
  ['SUBSCRIPTION_STATE_PAUSED', 'PENDING'],
  ['SUBSCRIPTION_STATE_PENDING', 'PENDING'],
  ['SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', 'REVOKED'],
]);
const response = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

function normalize(receipt, purchase, accountId) {
  if (receipt.store === 'GOOGLE_PLAY') {
    const items = purchase.lineItems;
    if (!purchase.testPurchase || typeof purchase.testPurchase !== 'object' ||
        purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId !== accountId ||
        !Array.isArray(items) || items.length !== 1 || items[0]?.productId !== receipt.product) return null;
    const state = purchase.canceledStateContext?.replacementCancellation
      ? 'REVOKED' : playStates.get(purchase.subscriptionState);
    const expiry = items[0].expiryTime == null && state === 'PENDING' ? 0 : Date.parse(items[0].expiryTime);
    return {
      state, expiry,
      acknowledged: purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      acknowledgementPending: purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
    };
  }
  const body = purchase.body;
  if (purchase.code !== 'OK' || body?.purchaseType !== 0 || body.externalAccountId !== accountId ||
      typeof body.autoRenewing !== 'boolean') return null;
  let state = body.paymentState === 0 ? 'PENDING' : body.autoRenewing === false ? 'CANCELED' : 'ACTIVE';
  if (body.cancelReason != null && body.cancelReason !== 0) state = 'REVOKED';
  else if (![0, 1, 2].includes(body.paymentState)) state = 'EXPIRED';
  const expiry = /^\d{1,16}$/.test(body.expiryTimeMillis) ? Number(body.expiryTimeMillis) : NaN;
  return { state, expiry, acknowledged: body.acknowledgementState === 'ACKNOWLEDGED',
    acknowledgementPending: body.acknowledgementState === 'PENDING' };
}

export function createHandler({ env, authenticate, stores, now = Date.now }) {
  return async (request) => {
    if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });
    if (env('FORGE_COMMERCE_SANDBOX') !== 'true') return response(503, { error: 'sandbox_disabled' });
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return response(401, { error: 'unauthenticated' });

    let receipt;
    try { receipt = await request.json(); } catch { return response(400, { error: 'invalid_receipt' }); }
    const { store, product, token } = receipt ?? {};
    const tokenPattern = store === 'RUSTORE' ? uuid : playToken;
    if (!['GOOGLE_PLAY', 'RUSTORE'].includes(store) || typeof product !== 'string' || !productId.test(product) ||
        typeof token !== 'string' || !tokenPattern.test(token)) return response(400, { error: 'invalid_receipt' });

    try {
      const account = await authenticate(authorization);
      if (typeof account !== 'string' || !uuid.test(account)) return response(401, { error: 'unauthenticated' });
      const products = JSON.parse(env('FORGE_COMMERCE_PRODUCTS_JSON') || '{}')[store];
      const tier = products && Object.hasOwn(products, product) ? products[product] : null;
      if (!['PRO', 'TRAINER'].includes(tier)) return response(400, { error: 'unknown_product' });

      const accountId = await storeAccountId(account);
      const purchase = await stores.lookup({ store, product, token });
      const result = normalize(receipt, purchase, accountId);
      if (!result || !result.state || !Number.isSafeInteger(result.expiry) || result.expiry < 0) {
        return response(403, { error: 'unverified_purchase' });
      }
      const current = result.expiry > now() && ['ACTIVE', 'CANCELED'].includes(result.state);
      if (current && !result.acknowledged) {
        if (!result.acknowledgementPending) return response(403, { error: 'unverified_purchase' });
        await stores.acknowledge({ store, product, token });
      }
      return response(200, { account, tier: current ? tier : 'FREE', sandbox: true,
        state: result.expiry <= now() && ['ACTIVE', 'CANCELED'].includes(result.state) ? 'EXPIRED' : result.state,
        validUntilEpochMs: result.expiry });
    } catch {
      return response(503, { error: 'verification_unavailable' });
    }
  };
}
