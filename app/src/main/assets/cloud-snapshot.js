(function (root) {
  'use strict';

  function publicKey(value) {
    if (/^sb_publishable_[A-Za-z0-9_-]{15,}$/.test(value)) return true;
    const parts = String(value).split('.');
    if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return false;
    try {
      const claims = JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')));
      return claims.role === 'anon';
    } catch { return false; }
  }

  function revision(snapshot) {
    if (!snapshot) return null;
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1) throw Error('Обнови схему Supabase до версии с ревизиями');
    return snapshot.revision;
  }

  function mutation(userId, observed, payload) {
    const rev = revision(observed);
    if (rev === null) {
      return {
        path: '/rest/v1/forge_snapshots?on_conflict=user_id&select=revision,updated_at',
        method: 'POST', body: { user_id: userId, payload }, prefer: 'resolution=ignore-duplicates,return=representation'
      };
    }
    return {
      path: '/rest/v1/forge_snapshots?user_id=eq.' + encodeURIComponent(userId) + '&revision=eq.' + rev + '&select=revision,updated_at',
      method: 'PATCH', body: { payload }, prefer: 'return=representation'
    };
  }

  const api = { publicKey, revision, mutation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ForgeCloudSnapshot = api;
})(typeof window === 'undefined' ? globalThis : window);
