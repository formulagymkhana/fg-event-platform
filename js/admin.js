/**
 * FG Event Platform — 管理パネルロジック
 *
 * 認証: GASスクリプトプロパティ ADMIN_KEY を sessionStorage に保存
 *
 * 必要なGASアクション（api.gsに追加）:
 *   adminGetEvents, adminGetConfig, adminUpdateConfig,
 *   adminCreateEvent, adminGetStats, adminGetStampLog,
 *   adminGetWalkIns, adminGetPrizeLog, adminClearCache,
 *   adminGetCompanies, adminGenerateKeys
 */

// ── State ─────────────────────────────────────────
let adminKey_  = '';
let curEvent_  = '';
let allEvents_ = [];
let walkInCode_ = '';

// ── Init ──────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Wire up static listeners
  id_('btn-login')?.addEventListener('click', handleLogin_);
  id_('login-key')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin_(); });
  id_('btn-logout')?.addEventListener('click', handleLogout_);
  id_('event-select')?.addEventListener('change', handleEventChange_);
  id_('btn-new-event')?.addEventListener('click', () => showModal_('modal-create'));
  id_('modal-close')?.addEventListener('click', () => hideModal_('modal-create'));
  id_('btn-create-event')?.addEventListener('click', handleCreateEvent_);
  id_('btn-save-config')?.addEventListener('click', handleSaveConfig_);
  id_('btn-clear-cache')?.addEventListener('click', handleClearCache_);
  id_('btn-gen-keys')?.addEventListener('click', handleGenerateKeys_);
  id_('btn-copy-url')?.addEventListener('click', handleCopyUrl_);

  document.querySelectorAll('.tab-btn[data-tab]').forEach(b =>
    b.addEventListener('click', () => switchTab_(b.dataset.tab)));
  document.querySelectorAll('.tab-btn[data-subtab]').forEach(b =>
    b.addEventListener('click', () => switchSubTab_(b.dataset.subtab)));

  // Restore session
  const saved = sessionStorage.getItem('fg_admin_key');
  if (saved) {
    adminKey_ = saved;
    loginWithKey_();
  } else {
    showView_('login');
  }
});

// ── Auth ──────────────────────────────────────────
async function handleLogin_() {
  const key = id_('login-key').value.trim();
  if (!key) return;
  adminKey_ = key;
  setLoginLoading_(true);
  clearLoginErr_();
  const ok = await loginWithKey_();
  if (!ok) {
    adminKey_ = '';
    setLoginLoading_(false);
  }
}

async function loginWithKey_() {
  const res = await adminCall_('adminGetEvents', {});
  if (res.ok) {
    sessionStorage.setItem('fg_admin_key', adminKey_);
    allEvents_   = res.data.events    || [];
    walkInCode_  = res.data.walkInCode || '';
    populateEventSel_();
    showView_('app');
    return true;
  }
  showLoginErr_(res.message || '認証に失敗しました。キーを確認してください。');
  return false;
}

function handleLogout_() {
  sessionStorage.removeItem('fg_admin_key');
  adminKey_ = curEvent_ = '';
  allEvents_ = [];
  showView_('login');
  id_('login-key').value = '';
}

// ── Admin API ─────────────────────────────────────
async function adminCall_(action, params) {
  const url = new URL(FG_CONFIG.API_BASE_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('adminKey', adminKey_);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(url.toString(), { redirect: 'follow', signal: ctrl.signal });
    clearTimeout(timer);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') return { ok: false, error: 'timeout', message: 'タイムアウト' };
    return { ok: false, error: 'network_error', message: '通信エラー' };
  }
}

// ── Event selector ────────────────────────────────
function populateEventSel_() {
  const sel = id_('event-select');
  sel.innerHTML = '<option value="">イベントを選択...</option>';
  allEvents_.forEach(ev => {
    const opt = document.createElement('option');
    opt.value = ev.eventId;
    const icon = ev.status === '準備中' ? '🔵' : ev.status === '完了' ? '⚫' : '🟢';
    opt.textContent = `${icon} ${ev.eventId} — ${ev.name}`;
    sel.appendChild(opt);
  });
}

function handleEventChange_() {
  curEvent_ = id_('event-select').value;
  if (!curEvent_) return;
  updateWalkInUrl_();
  const activeTab = document.querySelector('.tab-btn[data-tab].active')?.dataset.tab || 'overview';
  loadTabData_(activeTab);
}

// ── Tab routing ───────────────────────────────────
function switchTab_(tab) {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-pane[id^="tab-"]').forEach(p =>
    p.classList.toggle('active', p.id === 'tab-' + tab));
  if (curEvent_) loadTabData_(tab);
}

function switchSubTab_(subtab) {
  document.querySelectorAll('.tab-btn[data-subtab]').forEach(b =>
    b.classList.toggle('active', b.dataset.subtab === subtab));
  document.querySelectorAll('.tab-pane[id^="subtab-"]').forEach(p =>
    p.classList.toggle('active', p.id === 'subtab-' + subtab));
}

function loadTabData_(tab) {
  if (!curEvent_) return;
  if (tab === 'overview') loadOverview_();
  else if (tab === 'config') loadConfig_();
  else if (tab === 'data')   loadData_();
  else if (tab === 'keys')   loadKeys_();
}

// ── Overview ──────────────────────────────────────
async function loadOverview_() {
  show_('overview-content', false);
  show_('overview-loading', true);
  const res = await adminCall_('adminGetStats', { event: curEvent_ });
  show_('overview-loading', false);
  if (!res.ok) { showToast_('統計取得失敗: ' + (res.message || '')); return; }
  const d = res.data;
  setText_('stat-students',     d.studentCount    ?? '—');
  setText_('stat-participants', d.participantCount ?? '—');
  setText_('stat-stamps',       d.stampCount       ?? '—');
  setText_('stat-prizes',       d.prizeCount       ?? '—');

  const ev = allEvents_.find(e => e.eventId === curEvent_);
  if (ev) {
    id_('event-info-body').innerHTML = `
      <table style="font-size:13px;width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:var(--gray);width:90px">ID</td><td><code>${ev.eventId}</code></td></tr>
        <tr><td style="padding:6px 0;color:var(--gray)">名称</td><td>${ev.name}</td></tr>
        <tr><td style="padding:6px 0;color:var(--gray)">開催日</td><td>${fmtDate_(ev.startDate)} 〜 ${fmtDate_(ev.endDate)}</td></tr>
        <tr><td style="padding:6px 0;color:var(--gray)">状態</td>
          <td><span class="badge ${statusCls_(ev.status)}">${ev.status || '—'}</span></td></tr>
      </table>`;
  }
  show_('overview-content', true);
}

// ── Config ────────────────────────────────────────
async function loadConfig_() {
  show_('config-content', false);
  show_('config-loading', true);
  const res = await adminCall_('adminGetConfig', { event: curEvent_ });
  show_('config-loading', false);
  if (!res.ok) { showToast_('設定取得失敗: ' + (res.message || '')); return; }
  const cfg = res.data.config || {};
  setVal_('cfg-prizeThreshold',  cfg.prizeThreshold  || 15);
  setVal_('cfg-prizeCount',      cfg.prizeCount       || 3);
  setVal_('cfg-stampStartAt',    toDtLocal_(cfg.stampStartAt));
  setVal_('cfg-stampEndAt',      toDtLocal_(cfg.stampEndAt));
  setVal_('cfg-exchangeDeadline',toDtLocal_(cfg.exchangeDeadline));
  setVal_('cfg-publicDeadline',  toDtLocal_(cfg.publicDeadline));
  show_('config-content', true);
}

async function handleSaveConfig_() {
  if (!curEvent_) return;
  const btn = id_('btn-save-config');
  const fb  = id_('save-feedback');
  btn.disabled = true;
  fb.className = 'save-fb';
  fb.textContent = '';

  const updates = {
    prizeThreshold:    getVal_('cfg-prizeThreshold'),
    prizeCount:        getVal_('cfg-prizeCount'),
    stampStartAt:      fromDtLocal_(getVal_('cfg-stampStartAt')),
    stampEndAt:        fromDtLocal_(getVal_('cfg-stampEndAt')),
    exchangeDeadline:  fromDtLocal_(getVal_('cfg-exchangeDeadline')),
    publicDeadline:    fromDtLocal_(getVal_('cfg-publicDeadline')),
  };

  let failed = false;
  for (const [key, value] of Object.entries(updates)) {
    const res = await adminCall_('adminUpdateConfig', { event: curEvent_, key, value });
    if (!res.ok) { failed = true; break; }
  }

  btn.disabled = false;
  if (!failed) {
    fb.textContent = '✓ 保存しました';
    fb.className = 'save-fb ok';
    setTimeout(() => { fb.className = 'save-fb'; }, 3000);
  } else {
    fb.textContent = '⚠ 保存に失敗しました';
    fb.className = 'save-fb err';
  }
}

// ── Data ──────────────────────────────────────────
async function loadData_() {
  show_('data-content', false);
  show_('data-loading', true);

  const [sRes, wRes, pRes] = await Promise.all([
    adminCall_('adminGetStampLog', { event: curEvent_ }),
    adminCall_('adminGetWalkIns',  { event: curEvent_ }),
    adminCall_('adminGetPrizeLog', { event: curEvent_ }),
  ]);

  show_('data-loading', false);

  if (sRes.ok) {
    const log = sRes.data.log || [];
    setText_('stamp-log-count', `(${sRes.data.total || 0}件 / 最新${log.length}件表示)`);
    id_('stamp-log-body').innerHTML = log.length
      ? log.map(r => `<tr><td>${r.time}</td><td>${esc_(r.name)}</td><td>${esc_(r.school)}</td><td>${esc_(r.company)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="empty-msg">データなし</td></tr>';
  }

  if (wRes.ok) {
    const list = wRes.data.walkins || [];
    setText_('walkin-count', `(${list.length}名)`);
    id_('walkin-body').innerHTML = list.length
      ? list.map(r => `<tr><td>${esc_(r.name)}</td><td>${esc_(r.school)}</td><td>${esc_(r.year)}</td><td>${esc_(r.email)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="empty-msg">データなし</td></tr>';
  }

  if (pRes.ok) {
    const log = pRes.data.log || [];
    setText_('prize-log-count', `(${log.length}件)`);
    id_('prize-log-body').innerHTML = log.length
      ? log.map(r => `<tr><td>${r.time}</td><td>${esc_(r.name)}</td><td>${r.stampCount}</td><td>${esc_(r.staff || '—')}</td></tr>`).join('')
      : '<tr><td colspan="4" class="empty-msg">データなし</td></tr>';
  }

  show_('data-content', true);
}

// ── Keys ──────────────────────────────────────────
async function loadKeys_() {
  show_('keys-content', false);
  show_('keys-loading', true);
  updateWalkInUrl_();
  const res = await adminCall_('adminGetCompanies', { event: curEvent_ });
  show_('keys-loading', false);

  if (!res.ok) { showToast_('企業データ取得失敗: ' + (res.message || '')); return; }
  const companies = res.data.companies || [];
  const container = id_('company-list');

  if (!companies.length) {
    container.innerHTML = '<p class="empty-msg">企業が登録されていません。<br>スプレッドシートの企業マスターに追加してください。</p>';
  } else {
    container.innerHTML = `<div class="company-list">${companies.map(c => `
      <div class="company-item">
        <div class="company-name">${esc_(c.name)} <span style="font-size:11px;color:var(--gray)">(${esc_(c.companyId)})</span></div>
        <div class="key-row">
          <span class="key-lbl">スタンプキー</span>
          <span class="key-val">${c.stampKey || '（未発行）'}</span>
          ${c.stampKey ? `<button class="copy-btn" data-copy="${esc_(c.stampKey)}">コピー</button>` : ''}
        </div>
        <div class="key-row">
          <span class="key-lbl">閲覧キー</span>
          <span class="key-val">${c.viewKey || '（未発行）'}</span>
          ${c.viewKey ? `<button class="copy-btn" data-copy="${esc_(c.viewKey)}">コピー</button>` : ''}
        </div>
      </div>`).join('')}</div>`;
    // Attach copy listeners (avoids inline onclick + CSP)
    container.querySelectorAll('.copy-btn[data-copy]').forEach(btn =>
      btn.addEventListener('click', () => copyText_(btn.dataset.copy)));
  }

  show_('keys-content', true);
}

async function handleGenerateKeys_() {
  if (!curEvent_) return;
  const btn = id_('btn-gen-keys');
  btn.disabled = true;
  btn.textContent = '発行中...';
  const res = await adminCall_('adminGenerateKeys', { event: curEvent_ });
  btn.disabled = false;
  btn.textContent = '未発行キーを一括発行';
  if (res.ok) { showToast_('✓ キーを発行しました'); loadKeys_(); }
  else showToast_('⚠ 発行失敗: ' + (res.message || ''));
}

function updateWalkInUrl_() {
  const el = id_('walkin-url');
  if (!el) return;
  if (walkInCode_) {
    const base = location.origin + location.pathname.replace(/[^/]+$/, 'register.html');
    el.textContent = `${base}?code=${walkInCode_}`;
  } else {
    el.textContent = '（WALK_IN_CODEがGASに未設定です）';
  }
}

function handleCopyUrl_() {
  const txt = id_('walkin-url').textContent;
  if (!txt || txt.startsWith('（')) return;
  copyText_(txt);
}

// ── Create Event ──────────────────────────────────
async function handleCreateEvent_() {
  const eventId   = getVal_('new-event-id').trim();
  const eventName = getVal_('new-event-name').trim();
  const startDate = getVal_('new-start-date');
  const endDate   = getVal_('new-end-date');
  const errEl     = id_('create-err');
  errEl.style.display = 'none';

  if (!eventId || !eventName || !startDate || !endDate) {
    showCreateErr_('すべての項目を入力してください'); return;
  }
  if (!/^[a-z0-9_]+$/.test(eventId)) {
    showCreateErr_('イベントIDは小文字英数字とアンダースコアのみ使用できます'); return;
  }

  const btn = id_('btn-create-event');
  btn.disabled = true;
  btn.textContent = '作成中...';

  // date input gives "YYYY-MM-DD", GAS expects "YYYY/MM/DD"
  const toSlash = s => s.replace(/-/g, '/');
  const res = await adminCall_('adminCreateEvent', {
    eventId, eventName,
    startDate: toSlash(startDate),
    endDate:   toSlash(endDate),
  });

  btn.disabled = false;
  btn.textContent = '作成する';

  if (res.ok) {
    hideModal_('modal-create');
    showToast_('✓ イベントを作成しました: ' + eventId);
    // Reload event list
    const evRes = await adminCall_('adminGetEvents', {});
    if (evRes.ok) {
      allEvents_  = evRes.data.events || [];
      walkInCode_ = evRes.data.walkInCode || '';
      populateEventSel_();
      id_('event-select').value = eventId;
      curEvent_ = eventId;
      updateWalkInUrl_();
      loadTabData_('overview');
    }
  } else {
    showCreateErr_(res.message || '作成に失敗しました');
  }
}

function showCreateErr_(msg) {
  const el = id_('create-err');
  el.textContent = msg;
  el.style.display = 'block';
  el.classList.add('show');
}

// ── Cache clear ───────────────────────────────────
async function handleClearCache_() {
  const btn = id_('btn-clear-cache');
  btn.disabled = true;
  btn.textContent = 'クリア中...';
  const res = await adminCall_('adminClearCache', {});
  btn.disabled = false;
  btn.textContent = 'キャッシュをクリア';
  showToast_(res.ok ? '✓ キャッシュをクリアしました' : '⚠ 失敗: ' + (res.message || ''));
}

// ── UI helpers ────────────────────────────────────
function showView_(v) {
  id_('view-login').style.display = v === 'login' ? '' : 'none';
  id_('view-app').style.display   = v === 'app'   ? '' : 'none';
}
function showModal_(mid) { const el = id_(mid); if (el) el.style.display = 'flex'; }
function hideModal_(mid) { const el = id_(mid); if (el) el.style.display = 'none'; }
function show_(eid, visible) { const el = id_(eid); if (el) el.style.display = visible ? '' : 'none'; }
function id_(eid)          { return document.getElementById(eid); }
function setText_(eid, t)  { const el = id_(eid); if (el) el.textContent = String(t); }
function setVal_(eid, v)   { const el = id_(eid); if (el) el.value = v ?? ''; }
function getVal_(eid)      { const el = id_(eid); return el ? el.value : ''; }

function setLoginLoading_(on) {
  const btn = id_('btn-login');
  if (!btn) return;
  btn.disabled = on;
  btn.textContent = on ? '確認中...' : 'ログイン';
}
function showLoginErr_(msg) {
  const el = id_('login-err');
  if (el) { el.textContent = msg; el.classList.add('show'); }
  id_('login-key')?.classList.add('error');
}
function clearLoginErr_() {
  id_('login-err')?.classList.remove('show');
  id_('login-key')?.classList.remove('error');
}

let toastTimer_ = null;
function showToast_(msg) {
  const el = id_('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer_) clearTimeout(toastTimer_);
  toastTimer_ = setTimeout(() => el.classList.remove('show'), 2500);
}

function copyText_(text) {
  navigator.clipboard?.writeText(text)
    .then(() => showToast_('✓ コピーしました'))
    .catch(() => showToast_('コピーできませんでした'));
}

// ── Date helpers ──────────────────────────────────
/** "YYYY/MM/DD HH:MM" → "YYYY-MM-DDTHH:MM" (for datetime-local input) */
function toDtLocal_(val) {
  if (!val) return '';
  const s = String(val).trim();
  const m = s.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})[\s T](\d{2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  return '';
}
/** "YYYY-MM-DDTHH:MM" → "YYYY/MM/DD HH:MM" (for GAS) */
function fromDtLocal_(val) {
  if (!val) return '';
  return val.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/, '$1/$2/$3 $4:$5');
}
function fmtDate_(val) {
  if (!val) return '—';
  return String(val).replace(/-/g, '/');
}
function statusCls_(status) {
  if (status === '準備中') return 'badge-prep';
  if (status === '完了')  return 'badge-done';
  return 'badge-active';
}
/** Escape HTML to prevent XSS in table cells */
function esc_(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
