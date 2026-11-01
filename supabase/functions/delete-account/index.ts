// Supabase Edge Function: удаление собственной учётной записи по JWT.
// Развернуть в своём проекте. Сервисный ключ хранится ТОЛЬКО на сервере Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: object) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors, status: 204 });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const rawAuth = req.headers.get('Authorization') ?? '';
  if (!rawAuth.startsWith('Bearer ')) return json(401, { error: 'Not authenticated' });
  const token = rawAuth.slice(7);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json(500, { error: 'Server not configured' });
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: whoError } = await admin.auth.getUser(token);
  if (whoError || !user) return json(401, { error: 'Invalid session' });
  // FK ON DELETE CASCADE удаляет связанную строку forge_snapshots.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json(500, { error: 'Could not delete account' });
  return json(200, { deleted: true });
});
