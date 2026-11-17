import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { deleteAccount } from './handler.mjs';

Deno.serve((request: Request) => deleteAccount(request, () => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw Error('Missing Supabase credentials');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
}));
