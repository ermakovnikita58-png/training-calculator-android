import { createHandler } from './handler.mjs';
import { createStores } from './stores.mjs';

const env = (key: string) => Deno.env.get(key);

async function authenticate(authorization: string): Promise<string | undefined> {
  const url = env('SUPABASE_URL');
  const apiKey = env('SUPABASE_ANON_KEY');
  if (!url || !apiKey) throw new Error('Supabase Auth is not configured');
  const result = await fetch(url + '/auth/v1/user', {
    headers: { authorization, apikey: apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  if (result.status === 401 || result.status === 403) return undefined;
  if (!result.ok) throw new Error('Supabase Auth is unavailable');
  return (await result.json()).id;
}

Deno.serve(createHandler({ env, authenticate, stores: createStores(env) }));
