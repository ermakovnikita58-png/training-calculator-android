const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store'
};

function json(status, body, retry = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', ...(retry ? { 'Retry-After': '3' } : {}) }
  });
}

const unavailable = () => json(503, { error: 'Сервис временно недоступен. Повтори запрос.' }, true);
const temporary = error => !error?.status || error.status === 429 || error.status >= 500;

export async function deleteAccount(request, createAdmin) {
  if (request.method === 'OPTIONS') return new Response(null, { headers, status: 204 });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const token = /^Bearer ([A-Za-z0-9._-]+)$/i.exec(request.headers.get('Authorization') || '')?.[1];
  if (!token) return json(401, { error: 'Войди в аккаунт FORGE.' });

  const confirmation = await request.json().catch(() => null);
  if (confirmation?.confirm !== true) return json(400, { error: 'Подтверди удаление аккаунта.' });

  try {
    const admin = createAdmin();
    const { data, error } = await admin.auth.getUser(token);
    if (error) return temporary(error) ? unavailable() : json(401, { error: 'Сессия недействительна. Войди ещё раз.' });
    if (!data?.user?.id) return json(401, { error: 'Сессия недействительна. Войди ещё раз.' });

    // Ownership is determined by Auth. The foreign key cascades to forge_snapshots.
    const result = await admin.auth.admin.deleteUser(data.user.id);
    if (result.error) return temporary(result.error) ? unavailable() : json(409, { error: 'Удаление не подтверждено. Проверь вход и повтори.' });
    return json(200, { deleted: true });
  } catch {
    return unavailable();
  }
}
