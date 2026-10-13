/* Action Immobiliere: authenticated account activation. No admin key; no dossier writes. */
'use strict';
(() => {
  const API = 'https://nqzriajxhkiujlnldayx.supabase.co/auth/v1';
  const PUBLIC_KEY = 'sb_publishable_y2unaxdazpqayrIq6kGSjw_trmoUiwJ';
  const CALLBACK = 'https://elisamartinuzzi29200-coder.github.io/Estimations-Action-Immo/connexion.html';
  const SESSION_KEY = 'ai-estimations-auth-check-v1';
  const COOL_KEY = 'ai-estimations-email-cooldown-v1';
  const TEAM = new Set(['m.elisa@action-immo.com','c.cousquer@action-immo.com','v.julie@action-immo.com','s.jeremy@action-immo.com','coraline.actionimmo@gmail.com','amelia.actionimmo@gmail.com']);
  const $ = id => document.getElementById(id);
  let session = null, mode = 'login', busy = false, cooldownUntil = 0;
  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const notice = (text, error = false) => {
    $('message').textContent = text;
    $('message').className = 'message' + (error ? ' error' : '');
    $('message').hidden = !text;
  };
  function render(next) {
    mode = next;
    $('checking').hidden = true;
    ['login','recovery','password'].forEach(name => $(name + '-form').hidden = name !== mode);
    $('connected').hidden = mode !== 'connected';
    $('page-title').textContent = ({login:'Votre acc\u00e8s personnel',recovery:'Choisir mon mot de passe',password:'Un nouveau mot de passe',connected:'Votre acc\u00e8s est pr\u00eat'})[mode];
    $('intro').textContent = ({login:'Connectez-vous avec votre adresse professionnelle et votre mot de passe.',recovery:'Activez votre compte existant. Une seule demande suffit.',password:'Vous choisissez votre mot de passe ici, jamais dans une conversation.',connected:'Vous pouvez utiliser ce compte sur vos appareils.'})[mode];
    updateCooldown();
  }
  function saveSession() {
    // Tokens only, in this tab. Passwords and client dossiers are never stored here.
    try { if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); else sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* Memory-only if storage is disabled. */ }
  }
  function setCooldown(seconds) {
    cooldownUntil = Date.now() + Math.max(60, Math.min(Number(seconds) || 3600, 86400)) * 1000;
    try { localStorage.setItem(COOL_KEY, String(cooldownUntil)); } catch (_) {}
    updateCooldown();
  }
  function updateCooldown() {
    const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    $('request-link').disabled = busy || seconds > 0;
    $('cooldown').textContent = seconds ? 'Nouvel envoi possible dans ' + Math.ceil(seconds / 60) + ' min. Ne multipliez pas les demandes depuis Supabase.' : '';
  }
  function readableError(err) {
    const c = err && err.code;
    if (err && err.status === 429) return 'La limite d\u2019envoi ou de tentatives est atteinte. Attendez le d\u00e9lai indiqu\u00e9 ; les envois ne sont pas relanc\u00e9s automatiquement.';
    if (['otp_expired','otp_disabled'].includes(c)) return 'Ce lien est expir\u00e9 ou a d\u00e9j\u00e0 \u00e9t\u00e9 utilis\u00e9. Demandez un seul nouveau lien depuis cette page.';
    if (c === 'invalid_credentials') return 'Adresse ou mot de passe incorrect. Pour un compte invit\u00e9 sans mot de passe, utilisez \u00ab Activer mon acc\u00e8s \u00bb.';
    if (c === 'email_not_confirmed') return 'Votre adresse doit encore \u00eatre confirm\u00e9e. Utilisez un lien d\u2019activation valide.';
    if (c === 'email_provider_disabled') return 'La connexion par e-mail est d\u00e9sactiv\u00e9e dans Supabase. Activez Email dans Authentication, sans ouvrir les inscriptions publiques.';
    if (c === 'email_address_not_authorized') return 'Le service e-mail de Supabase n\u2019autorise pas cette adresse. Un service SMTP doit \u00eatre configur\u00e9 pour l\u2019\u00e9quipe.';
    if (['weak_password','same_password'].includes(c)) return 'Choisissez un mot de passe diff\u00e9rent et plus robuste, conforme aux r\u00e8gles de votre projet.';
    if (c === 'captcha_failed') return 'Supabase demande une v\u00e9rification anti-robot. Cette protection doit \u00eatre raccord\u00e9e \u00e0 la page avant de continuer.';
    if (c === 'team_only') return 'Cet acc\u00e8s est r\u00e9serv\u00e9 aux six adresses autoris\u00e9es d\u2019Action Immobili\u00e8re.';
    if (c === 'session_expired') return 'La session a expir\u00e9. Connectez-vous \u00e0 nouveau ou utilisez un nouveau lien.';
    if (c === 'unsupported_link') return 'Ce lien n\u2019est pas compatible avec cette page. Demandez un lien depuis \u00ab Activer mon acc\u00e8s \u00bb.';
    if (c === 'network') return 'Connexion au service impossible. V\u00e9rifiez Internet, puis r\u00e9essayez. Aucun dossier local n\u2019a \u00e9t\u00e9 modifi\u00e9.';
    if (c === 'timeout') return 'Le service ne r\u00e9pond pas assez vite. Aucun nouvel envoi automatique n\u2019a \u00e9t\u00e9 lanc\u00e9.';
    return 'Le service a refus\u00e9 cette action' + (c && /^[a-z0-9_]+$/.test(c) ? ' (' + c + ')' : '') + '. Aucun dossier local n\u2019a \u00e9t\u00e9 modifi\u00e9.';
  }
  async function api(path, {method = 'GET', body, token} = {}) {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 20000);
    try {
      const headers = {apikey: PUBLIC_KEY, 'Content-Type':'application/json'};
      if (token) headers.Authorization = 'Bearer ' + token;
      const res = await fetch(API + path, {method, headers, body:body === undefined ? undefined : JSON.stringify(body), signal:abort.signal, credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store'});
      const type = res.headers.get('content-type') || '';
      const payload = type.includes('json') ? await res.json() : {};
      if (!res.ok) {
        const error = new Error('auth-request-failed');
        error.status = res.status;
        error.code = payload.error_code || (typeof payload.error === 'string' ? payload.error : '');
        error.retryAfter = res.headers.get('retry-after');
        throw error;
      }
      return payload;
    } catch (error) {
      if (error.name === 'AbortError') throw {code:'timeout'};
      if (!error.status && !error.code) throw {code:'network'};
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async function verifiedSession(tokens, mustSetPassword) {
    if (!tokens || typeof tokens.access_token !== 'string' || !tokens.access_token) throw {code:'session_expired'};
    const user = await api('/user', {token:tokens.access_token});
    if (!user || !user.id || !user.email_confirmed_at) throw {code:'email_not_confirmed'};
    if (!TEAM.has(normalizeEmail(user.email))) throw {code:'team_only'};
    const lifetime = Number(tokens.expires_in) || 3600;
    session = {access_token:tokens.access_token, expires_at:Number(tokens.expires_at) || Math.floor(Date.now()/1000) + lifetime, email:normalizeEmail(user.email), mustSetPassword:!!mustSetPassword};
    saveSession();
    $('password-account').textContent = session.email;
    $('connected-account').textContent = session.email;
    render(session.mustSetPassword ? 'password' : 'connected');
  }
  async function action(fn) {
    if (busy) return;
    busy = true;
    document.querySelectorAll('button').forEach(el => el.disabled = true);
    try { await fn(); } catch (error) {
      if (error.status === 429 && mode === 'recovery') setCooldown(error.retryAfter || 3600);
      notice(readableError(error), true);
    } finally {
      busy = false;
      document.querySelectorAll('button').forEach(el => el.disabled = false);
      updateCooldown();
    }
  }
  $('login-form').addEventListener('submit', event => {
    event.preventDefault();
    action(async () => {
      const email = normalizeEmail($('login-email').value);
      if (!TEAM.has(email)) throw {code:'team_only'};
      notice('Connexion en cours\u2026');
      try {
        const tokens = await api('/token?grant_type=password', {method:'POST',body:{email,password:$('login-password').value}});
        await verifiedSession(tokens, false);
        notice('Connexion confirm\u00e9e. Vos dossiers locaux sont inchang\u00e9s.');
      } finally { $('login-password').value = ''; }
    });
  });
  $('show-recovery').addEventListener('click', () => {
    $('recovery-email').value = $('login-email').value;
    notice(''); render('recovery'); $('recovery-email').focus();
  });
  document.querySelectorAll('[data-back]').forEach(el => el.addEventListener('click', () => {notice('');render('login');}));
  $('recovery-form').addEventListener('submit', event => {
    event.preventDefault();
    if (Date.now() < cooldownUntil) return;
    action(async () => {
      const email = normalizeEmail($('recovery-email').value);
      if (!TEAM.has(email)) throw {code:'team_only'};
      notice('Demande de lien en cours\u2026');
      await api('/recover?redirect_to=' + encodeURIComponent(CALLBACK), {method:'POST',body:{email}});
      setCooldown(60);
      notice('Demande accept\u00e9e. Si ce compte existe et si l\u2019envoi est autoris\u00e9, un e-mail va vous parvenir. Ouvrez uniquement le plus r\u00e9cent. Il doit revenir sur cette page, jamais sur localhost.');
    });
  });
  $('password-form').addEventListener('submit', event => {
    event.preventDefault();
    if ($('new-password').value !== $('confirm-password').value) {notice('Les deux mots de passe ne sont pas identiques.',true);return;}
    if ($('new-password').value.length < 12) {notice('Le mot de passe doit contenir au moins 12 caract\u00e8res.',true);return;}
    action(async () => {
      if (!session || session.expires_at * 1000 <= Date.now()) {session=null;saveSession();render('login');throw {code:'session_expired'};}
      notice('Enregistrement du mot de passe\u2026');
      try {
        await api('/user', {method:'PUT',token:session.access_token,body:{password:$('new-password').value}});
        session.mustSetPassword = false; saveSession(); render('connected');
        notice('Votre mot de passe est enregistr\u00e9. Vous pouvez maintenant vous connecter avec votre e-mail et ce mot de passe.');
      } finally { $('new-password').value='';$('confirm-password').value=''; }
    });
  });
  $('change-password').addEventListener('click', () => {
    if (!session) return;
    session.mustSetPassword = true;saveSession();notice('');render('password');
  });
  $('sign-out').addEventListener('click', () => action(async () => {
    const token=session && session.access_token;
    session=null;saveSession();render('login');
    try { if (token) await api('/logout?scope=local',{method:'POST',token});notice('D\u00e9connect\u00e9 de cette page. Les dossiers locaux sont conserv\u00e9s.'); }
    catch (_) {notice('Session effac\u00e9e de cet onglet. Le serveur n\u2019a pas confirm\u00e9 la d\u00e9connexion ; aucune session n\u2019est conserv\u00e9e ici.',true);}
  }));
  async function boot() {
    try { cooldownUntil=Number(localStorage.getItem(COOL_KEY)) || 0; } catch (_) {}
    const hash = new URLSearchParams(location.hash.slice(1));
    const query = new URLSearchParams(location.search);
    const hasLink = hash.has('access_token') || hash.has('error') || query.has('token_hash') || query.has('code') || query.has('error');
    // Remove credentials from the visible address and history before other requests.
    if (hasLink) { history.replaceState(null, '', location.pathname);session=null;saveSession(); }
    try {
      if (hash.has('error') || query.has('error')) throw {code:hash.get('error_code') || query.get('error_code') || 'otp_expired'};
      if (hash.has('access_token')) {
        await verifiedSession({access_token:hash.get('access_token'),expires_at:hash.get('expires_at'),expires_in:hash.get('expires_in')},['recovery','invite'].includes(hash.get('type')));
      } else if (query.has('token_hash')) {
        const type=query.get('type');
        if (!['recovery','invite','email','magiclink'].includes(type)) throw {code:'unsupported_link'};
        const tokens=await api('/verify',{method:'POST',body:{token_hash:query.get('token_hash'),type}});
        await verifiedSession(tokens,['recovery','invite'].includes(type));
      } else if (query.has('code')) {
        throw {code:'unsupported_link'};
      } else {
        let stored=null;
        try {stored=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');} catch (_) {}
        if (stored && stored.expires_at*1000>Date.now()) await verifiedSession(stored,stored.mustSetPassword);
        else { session=null;saveSession();render('login'); }
      }
    } catch (error) {session=null;saveSession();render('login');notice(readableError(error),true);}
  }
  setInterval(updateCooldown, 1000);
  boot();
})();
