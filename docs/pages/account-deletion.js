(() => {
  'use strict';
  const project = 'https://evwvbozhfsprcabrfefe.supabase.co';
  const apikey = 'sb_publishable_baZN5BJspcpFLCBwcUNzVQ_VjNh2rGK';
  const pkceKey = 'forge-delete-pkce';
  const signIn = document.getElementById('sign-in');
  const account = document.getElementById('account');
  const status = document.getElementById('notice');
  const deletion = document.getElementById('delete-form');
  let accessToken = null;
  let busy = false;

  const notify = message => { status.textContent = message; };
  function showSession(session) {
    accessToken = session?.access_token || null;
    document.getElementById('identity').textContent = accessToken
      ? 'Аккаунт FORGE · ' + (session.user?.email || 'подтверждён')
      : '';
    deletion.reset();
    signIn.hidden = !!accessToken;
    account.hidden = !accessToken;
  }

  async function api(endpoint, body, token) {
    const headers = { apikey, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(project + endpoint, {
      method: 'POST', headers, body: JSON.stringify(body), redirect: 'error',
      cache: 'no-store', signal: AbortSignal.timeout(12000)
    });
    if (response.status === 401) throw Error('expired');
    if (!response.ok) throw Error('failed');
    return response.json();
  }

  async function run(action, onError) {
    if (busy) return;
    busy = true;
    for (const field of document.querySelectorAll('input, button')) field.disabled = true;
    try { await action(); } catch (error) { onError(error); }
    finally {
      busy = false;
      for (const field of document.querySelectorAll('input, button')) field.disabled = false;
    }
  }

  document.getElementById('email-login').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    form.elements.password.value = '';
    run(async () => {
      const session = await api('/auth/v1/token?grant_type=password', { email, password });
      if (!session?.access_token || !session.user?.id) throw Error('session');
      showSession(session);
      notify('Выбран аккаунт для удаления.');
    }, () => notify('Вход не выполнен. Проверь почту, пароль и подключение.'));
  });

  function base64url(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  document.getElementById('google').addEventListener('click', () => run(async () => {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    sessionStorage.setItem(pkceKey, JSON.stringify({ verifier, createdAt: Date.now() }));
    const target = new URL(project + '/auth/v1/authorize');
    target.search = new URLSearchParams({
      provider: 'google', redirect_to: location.origin + location.pathname,
      code_challenge: base64url(new Uint8Array(challenge)), code_challenge_method: 's256'
    }).toString();
    location.assign(target.href);
  }, () => notify('Не удалось открыть Google. Проверь подключение и повтори вход.')));

  async function completeGoogle() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (!code && !params.has('error') && !location.hash) return;
    history.replaceState(null, '', location.pathname);
    const pending = sessionStorage.getItem(pkceKey);
    sessionStorage.removeItem(pkceKey);
    await run(async () => {
      if (!code || !pending) throw Error('cancelled');
      const { verifier, createdAt } = JSON.parse(pending);
      if (typeof verifier !== 'string' || Date.now() - createdAt > 10 * 60 * 1000) throw Error('expired');
      const session = await api('/auth/v1/token?grant_type=pkce', { auth_code: code, code_verifier: verifier });
      if (!session?.access_token || !session.user?.id) throw Error('session');
      showSession(session);
      notify('Выбран аккаунт для удаления.');
    }, () => notify('Вход через Google не завершён. Нажми кнопку входа ещё раз.'));
  }

  document.getElementById('sign-out').addEventListener('click', () => {
    showSession(null);
    notify('Сеанс закрыт.');
  });

  deletion.addEventListener('submit', event => {
    event.preventDefault();
    if (!accessToken || !deletion.elements.confirm.checked) return;
    run(async () => {
      const result = await api('/functions/v1/delete-account', { confirm: true }, accessToken);
      if (result.deleted !== true) throw Error('not-deleted');
      showSession(null);
      notify('Аккаунт и облачная копия удалены.');
    }, error => {
      if (error.message === 'expired') {
        showSession(null);
        notify('Срок входа истёк. Чтобы проверить состояние аккаунта, войди снова.');
      } else notify('Сервер не подтвердил запрос. Проверь подключение, затем повтори.');
    });
  });

  completeGoogle().catch(() => notify('Не удалось завершить вход. Повтори попытку.'));
})();
