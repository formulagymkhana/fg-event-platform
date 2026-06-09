/**
 * FG Event Platform — 管理パネルロジック
 *
 * ルーティング: location.hash ベースの SPA
 *   #              → イベント一覧 (page-events)
 *   #eventId       → ダッシュボード (page-dashboard)
 *   #eventId/companies → 企業管理 (page-companies)
 *   #eventId/students  → 学生管理 (page-students)
 */

// ── State ─────────────────────────────────────────
let adminKey_   = '';
let curEvent_   = '';
let allEvents_  = [];
let walkInCode_ = '';
let loadGen_    = 0;   // Race Condition 防止: loadAll_ 呼び出しごとにインクリメント

// ── Init ──────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Login
  id_('btn-login')?.addEventListener('click', handleLogin_);
  id_('login-key')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin_(); });

  // Logout (イベント一覧ページ)
  id_('btn-logout')?.addEventListener('click', handleLogout_);

  // 新規イベント
  id_('btn-new-event')?.addEventListener('click', () => showModal_('modal-create'));
  id_('modal-close')?.addEventListener('click', () => hideModal_('modal-create'));
  id_('btn-create-event')?.addEventListener('click', handleCreateEvent_);

  // ダッシュボード操作
  id_('btn-reload')?.addEventListener('click', () => loadAll_());
  id_('btn-save-config')?.addEventListener('click', handleSaveConfig_);
  id_('btn-clear-cache')?.addEventListener('click', handleClearCache_);
  id_('btn-change-key')?.addEventListener('click', handleChangeKey_);
  id_('btn-copy-url')?.addEventListener('click', handleCopyUrl_);

  // 企業管理ページ
  id_('btn-add-company')?.addEventListener('click', handleAddCompany_);
  id_('btn-gen-keys')?.addEventListener('click', handleGenerateKeys_);

  // Section toggles
  document.querySelectorAll('.section-hd').forEach(hd => {
    hd.addEventListener('click', () => toggleSection_(hd.dataset.section));
  });

  // 準備中ボタン: トースト案内
  document.addEventListener('click', e => {
    if (e.target.hasAttribute('data-wip')) {
      showToast_('この機能は今後実装予定です。現在はスプレッドシート直接編集または GAS 関数で対応してください。');
    }
  });

  // ハッシュルーティング
  window.addEventListener('hashchange', () => { if (adminKey_) route_(); });

  // セッション復元
  const saved = sessionStorage.getItem('fg_admin_key');
  if (saved) { adminKey_ = saved; loginWithKey_(); }
  else showView_('login');
});

// ── Auth ──────────────────────────────────────────
async function handleLogin_() {
  const key = id_('login-key').value.trim();
  if (!key) return;
  adminKey_ = key;
  const btn = id_('btn-login');
  btn.disabled = true;
  btn.textContent = '確認中...';
  clearLoginErr_();
  const ok = await loginWithKey_();
  if (!ok) { adminKey_ = ''; btn.disabled = false; btn.textContent = 'ログイン'; }
}

async function loginWithKey_() {
  const res = await adminCall_('adminGetEvents', {});
  if (res.ok) {
    sessionStorage.setItem('fg_admin_key', adminKey_);
    allEvents_  = res.data.events    || [];
    walkInCode_ = res.data.walkInCode || '';
    showView_('app');
    route_();          // ハッシュに応じてページを表示
    updateStepBadges_();
    return true;
  }
  showLoginErr_(res.message || '認証に失敗しました');
  return false;
}

function handleLogout_() {
  sessionStorage.removeItem('fg_admin_key');
  adminKey_ = curEvent_ = '';
  allEvents_ = [];
  history.replaceState(null, '', location.pathname); // ハッシュをクリア
  showView_('login');
  id_('login-key').value = '';
  const btn = id_('btn-login');
  if (btn) { btn.disabled = false; btn.textContent = 'ログイン'; }
}

// ── Hash routing ──────────────────────────────────
function route_() {
  const hash = location.hash.replace(/^#/, '');

  if (!hash) {
    renderEventList_();
    showPage_('events');
    return;
  }

  if (hash === 'settings') {
    showPage_('settings');
    // API URL を情報欄に表示
    setText_('info-api-url', FG_CONFIG.API_BASE_URL);
    return;
  }

  const [eventId, section] = hash.split('/');
  curEvent_ = eventId;
  updateNavLinks_();

  if (section === 'companies') {
    showPage_('companies');
    loadCompanies_();
  } else if (section === 'students') {
    showPage_('students');
    // 学生数を stat-students から student-count-step3 に反映
    const n = id_('stat-students')?.textContent;
    setText_('student-count-step3', (n && n !== '—') ? n : '—');
    // stats が未取得なら読み込む
    if (!n || n === '—') loadStats_(++loadGen_, curEvent_);
  } else {
    showPage_('dashboard');
    const ev = allEvents_.find(e => e.eventId === curEvent_);
    setText_('dash-ev-name', ev ? (ev.name || ev.eventId) : curEvent_);
    updateWalkInUrl_();
    loadAll_();
  }
}

function showPage_(name) {
  ['events', 'dashboard', 'companies', 'students', 'settings'].forEach(p => {
    const el = id_('page-' + p);
    if (el) el.style.display = p === name ? '' : 'none';
  });
}

/** イベント一覧をカード形式でレンダリング */
function renderEventList_() {
  const list = id_('event-card-list');
  if (!list) return;
  if (!allEvents_.length) {
    list.innerHTML = '<p class="empty-msg">イベントがありません。下のボタンで作成してください。</p>';
    return;
  }
  list.innerHTML = allEvents_.map(ev => {
    const statusClass = ev.status === '完了' ? 'done' : ev.status === '準備中' ? 'wip' : 'active';
    return `
      <a class="event-card" href="#${esc_(ev.eventId)}">
        <div class="ev-card-name">${esc_(ev.name || ev.eventId)}</div>
        <div class="ev-card-sub">${fmtD_(ev.startDate)} 〜 ${fmtD_(ev.endDate)}</div>
        <div class="ev-card-row">
          <span class="ev-card-id">${esc_(ev.eventId)}</span>
          <span class="ev-card-status ${statusClass}">${esc_(ev.status || '—')}</span>
        </div>
      </a>`;
  }).join('');
}

/** ダッシュボード上のナビカードと戻るリンクの href を更新 */
function updateNavLinks_() {
  const co = id_('nav-co-card');
  const st = id_('nav-st-card');
  const backCo = id_('back-dash-co');
  const backSt = id_('back-dash-st');
  if (co) co.href = '#' + curEvent_ + '/companies';
  if (st) st.href = '#' + curEvent_ + '/students';
  if (backCo) backCo.href = '#' + curEvent_;
  if (backSt) backSt.href = '#' + curEvent_;
}

// ── Load all data ─────────────────────────────────
async function loadAll_() {
  if (!curEvent_) return;
  const gen = ++loadGen_;
  const ev  = curEvent_;
  loadStats_(gen, ev);
  loadStampLog_(gen, ev);
  loadWalkIns_(gen, ev);
  loadPrizeLog_(gen, ev);
  loadConfig_(gen, ev);
  loadCompanies_(gen, ev);
}

// ── Stats ─────────────────────────────────────────
async function loadStats_(gen, ev) {
  setText_('stat-students', '…');
  setText_('stat-walkins',  '…');
  setText_('stat-stamps',   '…');
  setText_('stat-prizes',   '…');
  const res = await adminCall_('adminGetStats', { event: ev });
  if (gen !== loadGen_) return;
  if (!res.ok) return;
  const d = res.data;
  setText_('stat-students', d.studentCount ?? '—');
  setText_('stat-walkins',  d.walkInCount  ?? '—');
  setText_('stat-stamps',   d.stampCount   ?? '—');
  setText_('stat-prizes',   d.prizeCount   ?? '—');
  updateStepBadges_();
}

// ── Stamp log ─────────────────────────────────────
async function loadStampLog_(gen, ev) {
  const res = await adminCall_('adminGetStampLog', { event: ev });
  if (gen !== loadGen_) return;
  if (!res.ok) return;
  const log = res.data.log || [];
  setText_('stamp-count', `(${res.data.total || 0}件 / 最新${log.length}件)`);
  id_('stamp-tbody').innerHTML = log.length
    ? log.map(r => `<tr><td>${r.time}</td><td>${esc_(r.name)}</td><td>${esc_(r.school)}</td><td>${esc_(r.company)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty-msg">データなし</td></tr>';
}

// ── Walk-ins ──────────────────────────────────────
async function loadWalkIns_(gen, ev) {
  const res = await adminCall_('adminGetWalkIns', { event: ev });
  if (gen !== loadGen_) return;
  if (!res.ok) return;
  const list = res.data.walkins || [];
  setText_('walkin-count', `(${list.length}名)`);
  id_('walkin-tbody').innerHTML = list.length
    ? list.map(r => `<tr><td>${esc_(r.name)}</td><td>${esc_(r.school)}</td><td>${esc_(r.year)}</td><td>${esc_(r.email)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty-msg">データなし</td></tr>';
}

// ── Prize log ─────────────────────────────────────
async function loadPrizeLog_(gen, ev) {
  const res = await adminCall_('adminGetPrizeLog', { event: ev });
  if (gen !== loadGen_) return;
  if (!res.ok) return;
  const log = res.data.log || [];
  setText_('prize-count', `(${log.length}件)`);
  id_('prize-tbody').innerHTML = log.length
    ? log.map(r => `<tr><td>${r.time}</td><td>${esc_(r.name)}</td><td>${r.stampCount}</td><td>${esc_(r.staff || '—')}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty-msg">データなし</td></tr>';
}

// ── Config ────────────────────────────────────────
async function loadConfig_(gen, ev) {
  const res = await adminCall_('adminGetConfig', { event: ev });
  if (gen !== loadGen_) return;
  if (!res.ok) return;
  const cfg = res.data.config || {};
  setVal_('cfg-prizeThreshold',   cfg.prizeThreshold  || 15);
  setVal_('cfg-prizeCount',       cfg.prizeCount       || 3);
  setVal_('cfg-stampStartAt',     toDtLocal_(cfg.stampStartAt));
  setVal_('cfg-stampEndAt',       toDtLocal_(cfg.stampEndAt));
  setVal_('cfg-exchangeDeadline', toDtLocal_(cfg.exchangeDeadline));
  setVal_('cfg-publicDeadline',   toDtLocal_(cfg.publicDeadline));
}

async function handleSaveConfig_() {
  if (!curEvent_) return;
  const btn = id_('btn-save-config');
  const fb  = id_('save-feedback');
  btn.disabled = true; fb.className = 'save-fb'; fb.textContent = '';

  const map = {
    prizeThreshold:   getVal_('cfg-prizeThreshold'),
    prizeCount:       getVal_('cfg-prizeCount'),
    stampStartAt:     fromDtLocal_(getVal_('cfg-stampStartAt')),
    stampEndAt:       fromDtLocal_(getVal_('cfg-stampEndAt')),
    exchangeDeadline: fromDtLocal_(getVal_('cfg-exchangeDeadline')),
    publicDeadline:   fromDtLocal_(getVal_('cfg-publicDeadline')),
  };

  let failed = false;
  for (const [key, value] of Object.entries(map)) {
    const r = await adminCall_('adminUpdateConfig', { event: curEvent_, key, value });
    if (!r.ok) { failed = true; break; }
  }

  btn.disabled = false;
  fb.textContent = failed ? '⚠ 保存失敗' : '✓ 保存しました';
  fb.className   = 'save-fb ' + (failed ? 'err' : 'ok');
  setTimeout(() => { fb.className = 'save-fb'; }, 3000);
}

// ── Companies ─────────────────────────────────────
async function loadCompanies_(gen = null, ev = null) {
  ev = ev ?? curEvent_;
  updateWalkInUrl_();
  const res = await adminCall_('adminGetCompanies', { event: ev });
  if (gen !== null && gen !== loadGen_) return;
  if (!res.ok) return;
  const list = res.data.companies || [];
  const container = id_('company-list');
  if (!list.length) {
    container.innerHTML = '<p class="empty-msg">企業が未登録です。上のフォームから追加してください。</p>';
    updateStepBadges_();
    return;
  }
  container.innerHTML = list.map(c => `
    <div class="company-item">
      <button class="del-btn" data-del-company="${esc_(c.companyId)}" title="削除">×</button>
      <div class="company-name">${esc_(c.name)} <span style="font-size:10px;color:var(--gray)">${esc_(c.companyId)}</span></div>
      <div class="key-row">
        <span class="key-lbl">スタンプキー</span>
        <span class="key-val">${c.stampKey || '未発行'}</span>
        ${c.stampKey ? `<button class="copy-btn" data-copy="${esc_(c.stampKey)}">コピー</button>` : ''}
      </div>
      <div class="key-row">
        <span class="key-lbl">閲覧キー</span>
        <span class="key-val">${c.viewKey || '未発行'}</span>
        ${c.viewKey ? `<button class="copy-btn" data-copy="${esc_(c.viewKey)}">コピー</button>` : ''}
      </div>
    </div>`).join('');
  container.querySelectorAll('.copy-btn[data-copy]').forEach(b =>
    b.addEventListener('click', () => copyText_(b.dataset.copy)));
  container.querySelectorAll('.del-btn[data-del-company]').forEach(b =>
    b.addEventListener('click', () => handleDeleteCompany_(b.dataset.delCompany)));
  updateStepBadges_();
}

async function handleAddCompany_() {
  if (!curEvent_) return;
  const name      = id_('new-co-name').value.trim();
  const companyId = id_('new-co-id').value.trim();
  const errEl     = id_('add-co-err');
  errEl.style.display = 'none';

  if (!name) {
    errEl.textContent = '企業名を入力してください';
    errEl.style.display = 'block'; return;
  }

  const btn = id_('btn-add-company');
  btn.disabled = true; btn.textContent = '追加中...';

  const res = await adminCall_('adminAddCompany', { event: curEvent_, name, companyId: companyId || undefined });
  btn.disabled = false; btn.textContent = '追加';

  if (res.ok) {
    id_('new-co-name').value = '';
    id_('new-co-id').value   = '';
    showToast_('✓ 追加しました: ' + name);
    loadCompanies_();
  } else {
    const msg = res.error === 'company_id_exists' ? 'その企業IDはすでに存在します' : (res.message || '追加に失敗しました');
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
}

async function handleDeleteCompany_(companyId) {
  if (!curEvent_ || !companyId) return;
  if (!window.confirm(`「${companyId}」を削除しますか？\nキー発行済みの場合、スタンプ・閲覧が使えなくなります。`)) return;

  const res = await adminCall_('adminDeleteCompany', { event: curEvent_, companyId });
  if (res.ok) {
    showToast_('✓ 削除しました: ' + companyId);
    loadCompanies_();
  } else {
    showToast_('⚠ 削除失敗: ' + (res.message || ''));
  }
}

async function handleGenerateKeys_() {
  if (!curEvent_) return;
  const btn = id_('btn-gen-keys');
  btn.disabled = true; btn.textContent = '発行中...';
  const res = await adminCall_('adminGenerateKeys', { event: curEvent_ });
  btn.disabled = false; btn.textContent = '🔑 未発行キーを一括発行';
  if (res.ok) { showToast_('✓ キーを発行しました'); loadCompanies_(); }
  else showToast_('⚠ 失敗: ' + (res.message || ''));
}

function updateWalkInUrl_() {
  const el = id_('walkin-url');
  if (!el) return;
  if (walkInCode_) {
    const base = location.origin + location.pathname.replace(/[^/]+$/, 'register.html');
    el.textContent = `${base}?code=${walkInCode_}`;
  } else {
    el.textContent = '（WALK_IN_CODEがGASに未設定）';
  }
}

function handleCopyUrl_() {
  const txt = id_('walkin-url').textContent;
  if (!txt || txt.startsWith('（')) return;
  copyText_(txt);
}

// ── Admin key change ──────────────────────────────
async function handleChangeKey_() {
  const newKey = getVal_('new-admin-key').trim();
  const fb     = id_('key-feedback');
  fb.className = 'save-fb'; fb.textContent = '';

  if (!newKey) {
    fb.textContent = '新しいキーを入力してください';
    fb.className = 'save-fb err'; return;
  }
  if (newKey === adminKey_) {
    fb.textContent = '現在と同じキーです';
    fb.className = 'save-fb err'; return;
  }

  const confirmed = window.confirm(
    '管理者キーを変更します。\n\n' +
    '新しいキー: ' + newKey + '\n\n' +
    '変更後は全員このキーでログインし直す必要があります。\n' +
    'このキーは控えましたか？よろしいですか？'
  );
  if (!confirmed) {
    fb.textContent = 'キャンセルしました';
    fb.className = 'save-fb err';
    setTimeout(() => { fb.className = 'save-fb'; }, 2000);
    return;
  }

  const btn = id_('btn-change-key');
  btn.disabled = true; btn.textContent = '変更中...';

  const res = await adminCall_('adminUpdateKey', { newKey });
  btn.disabled = false; btn.textContent = 'キーを変更';

  if (res.ok) {
    sessionStorage.removeItem('fg_admin_key');
    fb.textContent = '✓ 変更しました。新しいキーで再ログインしてください。';
    fb.className = 'save-fb ok';
    setTimeout(() => {
      adminKey_ = '';
      showView_('login');
      id_('login-key').value = '';
      const btn2 = id_('btn-login');
      if (btn2) { btn2.disabled = false; btn2.textContent = 'ログイン'; }
    }, 2000);
  } else {
    fb.textContent = '⚠ 失敗: ' + (res.message || '');
    fb.className = 'save-fb err';
  }
}

// ── Cache clear ───────────────────────────────────
async function handleClearCache_() {
  const btn = id_('btn-clear-cache');
  btn.disabled = true; btn.textContent = 'クリア中...';
  const res = await adminCall_('adminClearCache', {});
  btn.disabled = false; btn.textContent = '⚠ キャッシュクリア';
  showToast_(res.ok ? '✓ キャッシュをクリアしました' : '⚠ 失敗: ' + (res.message || ''));
}

// ── Create Event ──────────────────────────────────
async function handleCreateEvent_() {
  const eventId   = getVal_('new-event-id').trim();
  const eventName = getVal_('new-event-name').trim();
  const startDate = getVal_('new-start-date');
  const endDate   = getVal_('new-end-date');
  const errEl = id_('create-err');
  errEl.style.display = 'none';

  if (!eventId || !eventName || !startDate || !endDate) {
    errEl.textContent = 'すべての項目を入力してください';
    errEl.style.display = 'block'; return;
  }
  if (!/^[a-z0-9_]+$/.test(eventId)) {
    errEl.textContent = 'IDは小文字英数字とアンダースコアのみ';
    errEl.style.display = 'block'; return;
  }
  const btn = id_('btn-create-event');
  btn.disabled = true; btn.textContent = '作成中...';

  const res = await adminCall_('adminCreateEvent', {
    eventId, eventName,
    startDate: startDate.replace(/-/g, '/'),
    endDate:   endDate.replace(/-/g, '/'),
  });
  btn.disabled = false; btn.textContent = '作成する';

  if (res.ok) {
    hideModal_('modal-create');
    showToast_('✓ イベントを作成しました: ' + eventId);
    // イベントリストを再取得してダッシュボードへ
    const evRes = await adminCall_('adminGetEvents', {});
    if (evRes.ok) {
      allEvents_  = evRes.data.events    || [];
      walkInCode_ = evRes.data.walkInCode || '';
    }
    location.hash = '#' + eventId;  // ダッシュボードへ遷移
  } else {
    errEl.textContent = res.message || '作成に失敗しました';
    errEl.style.display = 'block';
  }
}

// ── Section toggle ────────────────────────────────
function toggleSection_(name) {
  const body   = id_('body-' + name);
  const toggle = id_('toggle-' + name);
  if (!body) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (toggle) toggle.classList.toggle('open', !isOpen);
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
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res   = await fetch(url.toString(), { redirect: 'follow', signal: ctrl.signal });
    clearTimeout(timer);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') return { ok: false, error: 'timeout', message: 'タイムアウト' };
    return { ok: false, error: 'network_error', message: '通信エラー' };
  }
}

// ── UI helpers ────────────────────────────────────
function showView_(v) {
  id_('view-login').style.display = v === 'login' ? '' : 'none';
  id_('view-app').style.display   = v === 'app'   ? '' : 'none';
}
function showModal_(mid) { const el = id_(mid); if (el) el.style.display = 'flex'; }
function hideModal_(mid) { const el = id_(mid); if (el) el.style.display = 'none'; }
function id_(eid)         { return document.getElementById(eid); }
function setText_(eid, t) { const el = id_(eid); if (el) el.textContent = String(t); }
function setVal_(eid, v)  { const el = id_(eid); if (el) el.value = v ?? ''; }
function getVal_(eid)     { const el = id_(eid); return el ? el.value : ''; }

function showLoginErr_(msg) {
  const el = id_('login-err');
  if (el) { el.textContent = msg; el.classList.add('show'); }
}
function clearLoginErr_() {
  id_('login-err')?.classList.remove('show');
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
function toDtLocal_(val) {
  if (!val) return '';
  const m = String(val).trim().match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})[\s T](\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : '';
}
function fromDtLocal_(val) {
  if (!val) return '';
  return val.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/, '$1/$2/$3 $4:$5');
}
function fmtD_(val) {
  return val ? String(val).replace(/-/g, '/') : '—';
}
function esc_(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── 準備ステップ バッジ更新 ─────────────────────────
function updateStepBadges_() {
  // Step 2（企業管理ナビカード）: 企業登録数
  const companyCount = id_('company-list')?.querySelectorAll('.company-item').length || 0;
  const step2Done    = companyCount > 0;
  setBadge_('badge-step2', step2Done ? 'done' : 'todo',
    step2Done ? `✓ ${companyCount}社` : '未登録');

  // Step 3（学生管理ナビカード）: 登録学生数
  const studentCount = parseInt(id_('stat-students')?.textContent, 10) || 0;
  const step3Done    = studentCount > 0;
  setBadge_('badge-step3', step3Done ? 'done' : 'todo',
    step3Done ? `✓ ${studentCount}名` : '未登録');
  setText_('student-count-step3', studentCount || '—');

  // Step 4（URL発行アコーディオン）
  const anyKeyIssued = [...(id_('company-list')?.querySelectorAll('.key-val') || [])]
    .some(el => el.textContent.trim() !== '未発行');
  const step4Done = !!(walkInCode_) && anyKeyIssued;
  setBadge_('badge-step4', step4Done ? 'done' : 'todo',
    step4Done ? '✓ 完了' : '未完了');
}

function setBadge_(eid, type, label) {
  const el = id_(eid); if (!el) return;
  // base class: nav-card-count または step-badge を維持
  const base = el.classList.contains('nav-card-count') ? 'nav-card-count' : 'step-badge';
  el.className = base + ' ' + type;
  el.textContent = label;
}
