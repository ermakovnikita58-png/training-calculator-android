const encoder = new TextEncoder();
const packageName = 'ru.trainingcalculator.app';
const googleBase = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + packageName;
const ruBase = 'https://public-api-m.rustore.ru';
const oauthUrl = 'https://oauth2.googleapis.com/token';

const base64 = (bytes) => btoa(String.fromCharCode(...bytes));
const url64 = (bytes) => base64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const rsa = { name: 'RSASSA-PKCS1-v1_5' };

async function sign(privateKey, hash, value) {
  const bytes = Uint8Array.from(atob(privateKey.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', bytes, { ...rsa, hash }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign(rsa, key, encoder.encode(value)));
}

export async function storeAccountId(account) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode('forge-commerce-v1:' + account.toLowerCase()));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

async function json(request, url, options) {
  const result = await request(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!result.ok) throw new Error('Store API request failed');
  return result.json();
}

export function createStores(env, request = fetch, now = Date.now) {
  async function playToken() {
    const credentials = JSON.parse(env('FORGE_PLAY_SERVICE_ACCOUNT_JSON') || '{}');
    const iat = Math.floor(now() / 1000);
    const claims = { iss: credentials.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: oauthUrl, iat, exp: iat + 300 };
    const jwt = [ { alg: 'RS256', typ: 'JWT' }, claims ].map(v => url64(encoder.encode(JSON.stringify(v)))).join('.');
    const signature = url64(await sign(credentials.private_key, 'SHA-256', jwt));
    const data = await json(request, oauthUrl, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt + '.' + signature }),
    });
    if (!data.access_token) throw new Error('Missing Google access token');
    return data.access_token;
  }

  async function rustoreToken() {
    const keyId = env('FORGE_RUSTORE_SANDBOX_KEY_ID');
    const timestamp = new Date(now()).toISOString();
    const signature = base64(await sign(env('FORGE_RUSTORE_SANDBOX_PRIVATE_KEY'), 'SHA-512', keyId + timestamp));
    const data = await json(request, ruBase + '/public/auth/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId, timestamp, signature }),
    });
    if (data.code !== 'OK' || !data.body?.jwe) throw new Error('Missing RuStore access token');
    return data.body.jwe;
  }

  return {
    async lookup(receipt) {
      const product = encodeURIComponent(receipt.product);
      const token = encodeURIComponent(receipt.token);
      if (receipt.store === 'GOOGLE_PLAY') {
        const headers = { Authorization: 'Bearer ' + await playToken() };
        return json(request, googleBase + '/purchases/subscriptionsv2/tokens/' + token, { headers });
      }
      const headers = { 'Public-Token': await rustoreToken() };
      return json(request, ruBase + '/public/sandbox/v5/subscription/' + packageName + '/' + product + '/' + token, { headers });
    },
    async acknowledge(receipt) {
      const product = encodeURIComponent(receipt.product);
      const token = encodeURIComponent(receipt.token);
      const options = { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json' }, body: '{}' };
      if (receipt.store === 'GOOGLE_PLAY') {
        options.headers.Authorization = 'Bearer ' + await playToken();
        const response = await request(googleBase + '/purchases/subscriptions/' + product + '/tokens/' + token + ':acknowledge', options);
        if (!response.ok) throw new Error('Google acknowledgement failed');
      } else {
        options.headers['Public-Token'] = await rustoreToken();
        const response = await json(request, 'https://public-api.rustore.ru/public/sandbox/v2/subscription/' +
          packageName + '/' + product + '/' + token + ':acknowledge', options);
        if (response.code !== 'OK') throw new Error('RuStore acknowledgement failed');
      }
    },
  };
}
