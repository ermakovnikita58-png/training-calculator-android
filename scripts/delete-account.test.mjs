import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deleteAccount } from '../supabase/functions/delete-account/handler.mjs';

const url = 'https://forge.example.test/functions/v1/delete-account';
const request = (method = 'POST', authorization, body) => new Request(url, {
  method,
  headers: authorization ? { Authorization: authorization } : {},
  body: body === undefined ? undefined : JSON.stringify(body)
});

test('preflight, anonymous calls, and absent confirmation do not create an admin client', async () => {
  const unchecked = () => assert.fail('Unexpected admin client');
  for (const [input, status] of [
    [request('OPTIONS'), 204],
    [request('GET'), 405],
    [request('POST', '', { confirm: true }), 401],
    [request('POST', 'Bearer token', { confirm: false }), 400]
  ]) {
    const response = await deleteAccount(input, unchecked);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

test('a validated session can delete only its own account', async () => {
  const deleted = [];
  const admin = authResult => () => ({
    auth: {
      getUser: async token => { assert.equal(token, 'valid-token'); return authResult; },
      admin: { deleteUser: async id => { deleted.push(id); return { error: null }; } }
    }
  });
  const response = await deleteAccount(request('POST', 'Bearer valid-token', { confirm: true, userId: 'another' }),
    admin({ data: { user: { id: 'fixture-owner' } } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.deepEqual(deleted, ['fixture-owner']);

  const expired = await deleteAccount(request('POST', 'Bearer valid-token', { confirm: true }),
    admin({ data: null, error: { status: 401 } }));
  assert.equal(expired.status, 401);
  assert.equal(deleted.length, 1);
});

test('temporary failures preserve the request outcome and allow an explicit retry', async () => {
  const response = await deleteAccount(request('POST', 'Bearer valid-token', { confirm: true }), () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'fixture-owner' } } }),
      admin: { deleteUser: async () => ({ error: { status: 503, message: 'internal details' } }) }
    }
  }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '3');
  assert.doesNotMatch(await response.text(), /internal details/);
});
