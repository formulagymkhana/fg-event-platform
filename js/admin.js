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
  id_('btn-save-event-info')?.addEventListener('click', handleSaveEventInfo_);
  id_('btn-save-config')?.addEventListener('click', handleSaveConfig_);
  id_('btn-clear-cache')?.addEventListener('click', handleClearCache_);
  id_('btn-change-key')?.addEventListener('click', handleChangeKey_);
  id_('btn-copy-url')?.addEventListener('click', handleCopyUrl_);

  // 企業管理ページ
  id_('btn-add-company')?.addEventListener('click', handleAddCompany_);
  id_('btn-gen-keys')?.addEventListener('click', handleGenerateKeys_);
  id_('btn-import-companies')?.addEventListener('click', handleImportCompanies_);

  // Section toggles
  document.querySelectorAll('.section-hd').forEach(hd => {
    hd.addEventListener('click', () => toggleSection_(hd.dataset.section));
  });

  // イベント削除（ダッシュボード設定内）
  id_('btn-delete-event')?.addEventListener('click', () => handleDeleteEvent_(curEvent_));

  // 企業NFC URL発行
  id_('btn-nfc-csv')?.addEventListener('click', downloadNfcCsv_);

  // 事前登録CSVダウンロード（QRパス用・区分別）
  id_('btn-prereg-csv-driver')?.addEventListener('click', () => downloadPreRegCsv_('driver'));
  id_('btn-prereg-csv-spectator')?.addEventListener('click', () => downloadPreRegCsv_('spectator'));
  id_('btn-prereg-csv-all')?.addEventListener('click', () => downloadPreRegCsv_('all'));
  id_('btn-student-qr-csv')?.addEventListener('click', downloadStudentQrCsv_);

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
    populateImportSelect_();
    loadCompanies_();
  } else if (section === 'students') {
    showPage_('students');
    const n = id_('stat-students')?.textContent;
    setText_('student-count-step3', (n && n !== '—') ? n : '—');
    if (!n || n === '—') loadStats_(++loadGen_, curEvent_);
    const gen = ++loadGen_;
    loadStudents_(gen, curEvent_);
    loadPreRegistrations_(gen, curEvent_);
  } else {
    showPage_('dashboard');
    const ev = allEvents_.find(e => e.eventId === curEvent_);
    setText_('dash-ev-name', ev ? (ev.name || ev.eventId) : curEvent_);
    updateWalkInUrl_();
    loadEventInfo_();
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
  loadPrizeLog_(gen, ev);
  loadConfig_(gen, ev);
  loadCompanies_(gen, ev);
}

// ── 事前登録一覧 ──────────────────────────────────
let preRegData_ = { headers: [], rows: [] };
async function loadPreRegistrations_(gen, ev) {
  const res = await adminCall_('adminGetPreRegistrations', { event: ev });
  if (gen !== loadGen_) return;
  if (!res.ok) return;
  preRegData_ = { headers: res.data.headers || [], rows: res.data.rows || [] };

  const H = preRegData_.headers;
  const col = n => H.indexOf(n);
  const tbody = id_('prereg-tbody');
  if (!tbody) return;
  if (!preRegData_.rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">事前登録はまだありません</td></tr>';
    return;
  }
  const ci = { cat: col('参加区分'), name: col('氏名'), school: col('大学名'), email: col('メールアドレス') };
  tbody.innerHTML = preRegData_.rows.map(r => `<tr>
    <td>${esc_(r[ci.cat] || '')}</td>
    <td>${esc_(r[ci.name] || '')}</td>
    <td>${esc_(r[ci.school] || '')}</td>
    <td>${esc_(r[ci.email] || '')}</td>
  </tr>`).join('');
}

// 参加区分の表示ラベル（QRパス用：Aドライバー / 女子クラスドライバー / 応援学生 等）
function passCategory_(category, driverClass) {
  if (category === '出場選手(FGクラスドライバー)')       return driverClass || 'Aドライバー';
  if (category === '出場選手(女子クラスドライバー)')     return '女子クラスドライバー';
  if (category === '補欠ドライバー')                     return '補欠ドライバー';
  if (category === '見学・応援学生(メカニック登録含む)') return '応援学生';
  return category || '';
}

// ドライバー系か（FG/女子/補欠）。見学・応援は false。
function isDriverCategory_(category) {
  return category === '出場選手(FGクラスドライバー)'
      || category === '出場選手(女子クラスドライバー)'
      || category === '補欠ドライバー';
}

// QR名刺URL（パス印刷用）
function cardPassUrl_(cardToken) {
  const ev = curEvent_ ? `&event=${encodeURIComponent(curEvent_)}` : '';
  return new URL(`card.html?token=${encodeURIComponent(cardToken)}${ev}`, location.href).toString();
}

// QRパス作成用CSV（A列から：学生ID/参加区分/氏名/ふりがな/トークン/QR用URL）
// kind: 'driver' | 'spectator' | 'all'
function downloadPreRegCsv_(kind) {
  const { headers, rows } = preRegData_;
  if (!headers.length) { showToast_('事前登録データがありません'); return; }
  const c = n => headers.indexOf(n);
  const ci = {
    sid: c('studentId'), cat: c('参加区分'), dc: c('ドライバー登録区分'),
    name: c('氏名'), kana: c('ふりがな'), token: c('cardToken'),
  };

  const filtered = rows.filter(r => {
    const cat = r[ci.cat] || '';
    if (kind === 'driver')    return isDriverCategory_(cat);
    if (kind === 'spectator') return !isDriverCategory_(cat);
    return true;
  });
  if (!filtered.length) { showToast_('該当する事前登録がありません'); return; }

  const esc = v => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = ['学生ID', '参加区分', '氏名', 'ふりがな', 'トークン', 'QR用URL'];
  const lines = [head.join(',')].concat(filtered.map(r => [
    r[ci.sid] || '',
    passCategory_(r[ci.cat] || '', r[ci.dc] || ''),
    r[ci.name] || '',
    r[ci.kana] || '',
    r[ci.token] || '',
    r[ci.token] ? cardPassUrl_(r[ci.token]) : '',
  ].map(esc).join(',')));

  const label = kind === 'driver' ? 'ドライバー' : kind === 'spectator' ? '応援見学' : '全員';
  const csv   = '﻿' + lines.join('\r\n'); // BOM付きでExcel文字化け回避
  const blob  = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url;
  a.download = `QRパス_${label}_${curEvent_}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ── Stats ─────────────────────────────────────────
async function loadStats_(gen, ev) {
  ['stat-preregistered','stat-walkins','stat-stamp-participants','stat-prizes'].forEach(id => setText_(id, '…'));
  const res = await adminCall_('adminGetStats', { event: ev });
  if (gen !== loadGen_) return;
  if (!res.ok) return;
  const d = res.data;
  setText_('stat-preregistered',      d.preRegisteredCount  ?? '—');
  setText_('stat-walkins',            d.walkInCount         ?? '—');
  setText_('stat-stamp-participants', d.stampParticipants   ?? '—');
  setText_('stat-prizes',             d.prizeCount          ?? '—');
  // 学生管理ページのカード
  const total = (d.preRegisteredCount || 0) + (d.walkInCount || 0);
  setText_('student-count-step3',  total              || '—');
  setText_('student-prereg-step3', d.preRegisteredCount ?? '—');
  setText_('student-walkin-step3', d.walkInCount        ?? '—');
  setText_('student-stamp-step3',  d.stampParticipants  ?? '—');
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
    ? log.map(r => `<tr><td>${r.time}</td><td>${esc_(r.name)}</td><td>${r.stampCount}</td><td>${r.claimedCount ?? 1}</td><td>${esc_(r.staff || '—')}</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty-msg">データなし</td></tr>';
}

// ── Config ────────────────────────────────────────
async function loadConfig_(gen, ev) {
  const res = await adminCall_('adminGetConfig', { event: ev });
  if (gen !== loadGen_) return;
  if (!res.ok) return;
  const cfg = res.data.config || {};
  setVal_('cfg-prizeUnitSize', cfg.prizeUnitSize || cfg.prizeThreshold || 5);
  setVal_('cfg-maxPrizes',    cfg.maxPrizes     || cfg.prizeCount    || 3);
  setVal_('cfg-publicDeadline', toDtLocal_(cfg.publicDeadline));
  setVal_('cfg-preRegMailSubject', cfg.preRegMailSubject || PREREG_MAIL_SUBJECT_DEFAULT);
  setVal_('cfg-preRegMailBody',    cfg.preRegMailBody    || PREREG_MAIL_BODY_DEFAULT);
}

// 確認メールの既定文面（CONFIG未設定時に表示・保存されるテンプレ）
const PREREG_MAIL_SUBJECT_DEFAULT = '【{eventName}】学生参加 事前登録を受け付けました';
const PREREG_MAIL_BODY_DEFAULT =
  '{name} 様\n\n' +
  '{eventName} の学生参加 事前登録を受け付けました。\n\n' +
  '当日は受付でご本人確認のうえ、入場パスをお渡しします。\n' +
  '登録内容に変更がある場合は事務局までご連絡ください。\n\n' +
  '── FORMULA GYMKHANA 事務局';

async function handleSaveConfig_() {
  if (!curEvent_) return;
  const btn = id_('btn-save-config');
  const fb  = id_('save-feedback');
  btn.disabled = true; fb.className = 'save-fb'; fb.textContent = '';

  const map = {
    prizeUnitSize:    getVal_('cfg-prizeUnitSize'),
    maxPrizes:        getVal_('cfg-maxPrizes'),
    publicDeadline:   fromDtLocal_(getVal_('cfg-publicDeadline')),
    preRegMailSubject: getVal_('cfg-preRegMailSubject'),
    preRegMailBody:    getVal_('cfg-preRegMailBody'),
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

/** 企業NFCタグ用URL: stamp.html?ct=<stampKey>（会期中は当日自動判定でイベント解決） */
function nfcUrl_(stampKey) {
  return new URL(`stamp.html?ct=${encodeURIComponent(stampKey)}`, location.href).toString();
}

/** CSV文字列をBOM付きでダウンロード */
function downloadCsv_(body, filename) {
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** 学生全員のQR用URL CSV（当日参加含む） */
async function downloadStudentQrCsv_() {
  if (!curEvent_) { showToast_('イベントが選択されていません'); return; }
  if (!studentData_.length) { showToast_('学生データがありません（先に学生管理ページを開いてください）'); return; }
  const esc = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head  = ['氏名', 'ふりがな', '大学名', '属性', '登録種別', 'QR用URL'];
  const lines = [head.join(',')].concat(studentData_.map(s => [
    s.name, s.furigana, s.school, s.category || '', s.regType,
    s.cardToken ? cardPassUrl_(s.cardToken) : '',
  ].map(esc).join(',')));
  downloadCsv_('﻿' + lines.join('\r\n'), `学生QR_URL_${curEvent_}_${new Date().toISOString().slice(0,10)}.csv`);
  showToast_(`✓ ${studentData_.length}名のQR用URLを出力しました`);
}

/** 企業NFC URL を CSV 出力（NFC書き込み用途順: ブース名 / NFC用URL / stampKey / 企業ID） */
async function downloadNfcCsv_() {
  if (!curEvent_) { showToast_('イベントが選択されていません'); return; }
  const res = await adminCall_('adminGetCompanies', { event: curEvent_ });
  if (!res.ok) { showToast_('企業の取得に失敗しました'); return; }
  const list = (res.data.companies || []).filter(c => c.stampKey);
  if (!list.length) { showToast_('スタンプキー発行済みの企業がありません'); return; }
  const esc = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head  = ['ブース名（企業名）', 'NFC用URL', 'stampKey', '企業ID'];
  const lines = [head.join(',')].concat(list.map(c =>
    [c.name, nfcUrl_(c.stampKey), c.stampKey, c.companyId].map(esc).join(',')));
  downloadCsv_(lines.join('\r\n'), `企業NFC_URL_${curEvent_}_${new Date().toISOString().slice(0, 10)}.csv`);
  showToast_(`✓ ${list.length}社のNFC URLを出力しました`);
}

/** 企業来訪学生一覧ページ: company.html?key=<viewKey>&event=<eventId> */
function companyPageUrl_(viewKey) {
  const ev = curEvent_ ? `&event=${encodeURIComponent(curEvent_)}` : '';
  return new URL(`company.html?key=${encodeURIComponent(viewKey)}${ev}`, location.href).toString();
}

/** 企業QR(cookie登録用)のURL: card.html?viewkey=<viewKey>&event=<eventId>
 *  eventId を埋めることで、会期外や複数大会でも正しいイベントに解決される。 */
function companyQrUrl_(viewKey) {
  const ev = curEvent_ ? `&event=${encodeURIComponent(curEvent_)}` : '';
  return new URL(`card.html?viewkey=${encodeURIComponent(viewKey)}${ev}`, location.href).toString();
}
async function loadCompanies_(gen = null, ev = null) {
  ev = ev ?? curEvent_;
  updateWalkInUrl_();
  const res = await adminCall_('adminGetCompanies', { event: ev });
  if (gen !== null && gen !== loadGen_) return;
  if (!res.ok) return;
  const list = res.data.companies || [];
  renderCoSummary_(list);
  const container = id_('company-list');
  if (!list.length) {
    container.innerHTML = '<p class="empty-msg">企業が未登録です。上のフォームから追加してください。</p>';
    updateStepBadges_();
    return;
  }
  container.innerHTML = list.map(c => {
    const inRally = c.stampRally !== false;
    return `
    <div class="company-item">
      <button class="del-btn" data-del-company="${esc_(c.companyId)}" title="削除">×</button>
      <div class="company-name">${esc_(c.name)} <span style="font-size:10px;color:var(--gray)">${esc_(c.companyId)}</span></div>
      <div class="key-row">
        <span class="key-lbl">ブース出店</span>
        <label class="rally-switch">
          <input type="checkbox" ${inRally ? 'checked' : ''} data-rally="${esc_(c.companyId)}">
          <span class="rally-track"></span>
          <span class="rally-lbl">${inRally ? '出店中' : '出店なし'}</span>
        </label>
      </div>
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
      ${c.stampKey ? `
      <div class="url-row">
        <span class="url-lbl">NFC用URL（スタンプ）</span>
        <span class="url-val">${esc_(nfcUrl_(c.stampKey))}</span>
        <button class="copy-btn" data-copy="${esc_(nfcUrl_(c.stampKey))}">コピー</button>
      </div>` : ''}
      ${c.viewKey ? `
      <div class="url-row">
        <span class="url-lbl">企業QR用URL（再閲覧設定）</span>
        <span class="url-val">${esc_(companyQrUrl_(c.viewKey))}</span>
        <button class="copy-btn" data-copy="${esc_(companyQrUrl_(c.viewKey))}">コピー</button>
      </div>
      <div class="url-row">
        <span class="url-lbl">来訪学生一覧URL</span>
        <span class="url-val">${esc_(companyPageUrl_(c.viewKey))}</span>
        <button class="copy-btn" data-copy="${esc_(companyPageUrl_(c.viewKey))}">コピー</button>
      </div>` : ''}
      <div class="logo-row">
        <span class="logo-lbl">ロゴURL</span>
        <input class="logo-url-input" type="url" placeholder="https://… または logos/xxx.png"
          data-logo-id="${esc_(c.companyId)}" value="${esc_(c.logoUrl || '')}">
        <div class="logo-preview">${c.logoUrl ? `<img src="${esc_(c.logoUrl)}" alt="" onerror="this.parentNode.textContent='?'">` : '?'}</div>
        <button class="copy-btn logo-save-btn" data-logo-save="${esc_(c.companyId)}">保存</button>
      </div>
    </div>`;
  }).join('');
  container.querySelectorAll('.copy-btn[data-copy]').forEach(b =>
    b.addEventListener('click', () => copyText_(b.dataset.copy)));
  container.querySelectorAll('.del-btn[data-del-company]').forEach(b =>
    b.addEventListener('click', () => handleDeleteCompany_(b.dataset.delCompany)));
  container.querySelectorAll('.logo-url-input').forEach(inp =>
    inp.addEventListener('input', () => {
      const pv = inp.closest('.logo-row').querySelector('.logo-preview');
      const url = inp.value.trim();
      pv.innerHTML = url
        ? `<img src="${esc_(url)}" alt="" onerror="this.parentNode.textContent='?'">`
        : '?';
    }));
  container.querySelectorAll('.logo-save-btn[data-logo-save]').forEach(b =>
    b.addEventListener('click', () => handleSaveLogo_(b)));
  container.querySelectorAll('input[data-rally]').forEach(cb =>
    cb.addEventListener('change', () => handleToggleStampRally_(cb)));
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

async function handleSaveLogo_(btn) {
  if (!curEvent_) return;
  const companyId = btn.dataset.logoSave;
  const input = btn.closest('.logo-row').querySelector('.logo-url-input');
  const logoUrl = input.value.trim();
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '保存中...';
  const res = await adminCall_('adminUpdateCompany', { event: curEvent_, companyId, logoUrl });
  btn.disabled = false;
  btn.textContent = res.ok ? '✓' : 'エラー';
  if (res.ok) showToast_('✓ ロゴURLを保存しました');
  else showToast_('⚠ 保存失敗: ' + (res.message || ''));
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

// ── 企業ダッシュボードサマリー ───────────────────
function renderCoSummary_(list) {
  const card = id_('co-summary-card');
  const grid = id_('co-summary-grid');
  if (!card || !grid) return;
  const total   = list.length;
  const booth   = list.filter(c => c.stampRally !== false).length;
  const noBooth = total - booth;
  const noKey   = list.filter(c => !c.stampKey).length;
  const noLogo  = list.filter(c => !c.logoUrl).length;
  const sc = (val, lbl) =>
    `<div class="stat-card"><div class="stat-val">${val}</div><div class="stat-lbl">${lbl}</div></div>`;
  grid.innerHTML =
    `<div class="stat-grid" style="grid-template-columns:1fr;margin-bottom:0">${sc(total, '参加企業')}</div>` +
    `<div class="stat-grid" style="margin-bottom:0">${sc(booth, 'ブース出店企業')}${sc(noBooth, '出店なし企業')}</div>` +
    `<div class="stat-grid" style="margin-bottom:0">${sc(noKey, 'キー未発行企業')}${sc(noLogo, 'ロゴ未設定企業')}</div>`;
  card.style.display = '';
}

// ── 学生一覧 ─────────────────────────────────────
let studentData_ = [];

async function loadStudents_(gen, ev) {
  const wrap = id_('student-list-wrap');
  if (!wrap || !ev) return;
  wrap.innerHTML = '<p style="font-size:12px;color:var(--gray);text-align:center;padding:20px 0">読み込み中...</p>';
  const res = await adminCall_('adminGetStudents', { event: ev });
  if (gen !== loadGen_) return;
  if (!res.ok) { wrap.innerHTML = '<p style="font-size:12px;color:var(--red);text-align:center;padding:16px">取得失敗</p>'; return; }
  studentData_ = res.data.students || [];
  renderStudentList_();
  // 検索・絞り込みをここで接続（重複登録防止）
  const search = id_('student-search');
  const filter = id_('student-filter-type');
  if (search && !search.dataset.bound) {
    search.dataset.bound = '1';
    search.addEventListener('input', renderStudentList_);
    filter?.addEventListener('change', renderStudentList_);
  }
  // 統計カードを更新
  const pre    = studentData_.filter(s => s.regType === '事前').length;
  const walkin = studentData_.filter(s => s.regType !== '事前').length;
  setText_('student-count-step3',  studentData_.length);
  setText_('student-prereg-step3', pre);
  setText_('student-walkin-step3', walkin);
  // アコーディオンバッジを更新
  setText_('prereg-count', pre + '名');
  setText_('walkin-count', walkin + '名');
}

function renderStudentList_() {
  const wrap   = id_('student-list-wrap');
  const q      = (id_('student-search')?.value || '').trim().toLowerCase();
  const type   = id_('student-filter-type')?.value || '';
  const rows   = studentData_.filter(s => {
    if (type && s.regType !== type) return false;
    if (q && !`${s.name}${s.furigana}${s.school}`.toLowerCase().includes(q)) return false;
    return true;
  });
  if (!rows.length) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--gray);text-align:center;padding:16px 0">該当する学生がいません</p>';
    return;
  }
  wrap.innerHTML = `
    <div style="font-size:10px;color:var(--gray);margin-bottom:6px">${rows.length}名 表示</div>
    <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
      ${rows.map((s, i) => `
        <div style="padding:9px 12px;${i ? 'border-top:1px solid var(--border)' : ''};
          background:${s.regType === '事前' ? '#fff' : '#EFF6FF'}">
          <div style="display:grid;grid-template-columns:1fr auto;align-items:center;margin-bottom:4px">
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--navy)">${esc_(s.name)}
                <span style="font-size:10px;font-weight:400;color:var(--gray);margin-left:4px">${esc_(s.furigana)}</span>
              </div>
              <div style="font-size:10px;color:var(--gray);margin-top:2px">${esc_(s.school)} · ${esc_(s.category || '—')} · ${esc_(s.year ? s.year + '年' : '—')}</div>
            </div>
            <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;
              background:${s.regType === '事前' ? '#F3F4F6' : '#DBEAFE'};
              color:${s.regType === '事前' ? '#6B7280' : '#1E40AF'}">
              ${s.regType === '事前' ? '事前登録' : '当日'}
            </span>
          </div>
          ${s.cardToken ? `
          <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
            <span style="font-size:9px;color:var(--gray);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc_(cardPassUrl_(s.cardToken))}</span>
            <button class="copy-btn" data-copy="${esc_(cardPassUrl_(s.cardToken))}" style="flex-shrink:0;font-size:10px;padding:2px 8px">URLコピー</button>
          </div>` : ''}
        </div>`).join('')}
    </div>`;
  wrap.querySelectorAll('.copy-btn[data-copy]').forEach(b =>
    b.addEventListener('click', () => copyText_(b.dataset.copy)));
}

async function handleToggleStampRally_(cb) {
  if (!curEvent_) return;
  const companyId = cb.dataset.rally;
  const newVal = cb.checked;
  const lbl = cb.closest('.rally-switch').querySelector('.rally-lbl');
  cb.disabled = true;
  const res = await adminCall_('adminUpdateCompany', { event: curEvent_, companyId, stampRally: String(newVal) });
  cb.disabled = false;
  if (res.ok) {
    if (lbl) lbl.textContent = newVal ? '出店中' : '出店なし';
    showToast_(`✓ ${newVal ? 'ブース出店' : '出店なし'}に変更しました`);
  } else {
    cb.checked = !newVal;
    showToast_('⚠ 更新失敗: ' + (res.message || ''));
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

function populateImportSelect_() {
  const sel = id_('import-source-event');
  if (!sel) return;
  sel.innerHTML = '<option value="">イベントを選択...</option>' +
    allEvents_
      .filter(ev => ev.eventId !== curEvent_)
      .map(ev => `<option value="${esc_(ev.eventId)}">${esc_(ev.name || ev.eventId)}</option>`)
      .join('');
  id_('import-co-msg').textContent = '';
}

async function handleImportCompanies_() {
  if (!curEvent_) return;
  const sel = id_('import-source-event');
  const sourceEvent = sel?.value;
  if (!sourceEvent) { id_('import-co-msg').textContent = 'イベントを選択してください'; return; }
  const btn = id_('btn-import-companies');
  btn.disabled = true;
  btn.textContent = '読み込み中...';
  const res = await adminCall_('adminImportCompanies', { event: curEvent_, sourceEvent });
  btn.disabled = false;
  btn.textContent = '読み込む';
  const msg = id_('import-co-msg');
  if (res.ok) {
    msg.style.color = 'var(--green, #1a6640)';
    msg.textContent = `✓ ${res.data.imported}社を引き継ぎました`;
    loadCompanies_();
  } else {
    msg.style.color = 'var(--red, #9a2a2a)';
    msg.textContent = res.error === 'no_source_companies' ? 'コピー元に企業が登録されていません'
      : res.error === 'same_event' ? '同じイベントは選択できません'
      : (res.message || '読み込みに失敗しました');
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

// ── Edit Event Info ───────────────────────────────

async function loadEventInfo_() {
  const ev = allEvents_.find(e => e.eventId === curEvent_);
  if (!ev) return;
  setVal_('edit-event-name', ev.name || '');
  const sel = id_('edit-event-status');
  if (sel) sel.value = ev.status || '準備中';

  // CONFIGからstampStartAt/stampEndAt/exchangeDeadlineを取得して datetime 入力を埋める
  const cfgRes = await adminCall_('adminGetConfig', { event: curEvent_ });
  const cfg = cfgRes.ok ? (cfgRes.data.config || {}) : {};
  setVal_('edit-start-datetime',    toDtLocal_(cfg.stampStartAt)    || dateToDtLocal_(ev.startDate));
  setVal_('edit-end-datetime',      toDtLocal_(cfg.stampEndAt)      || dateToDtLocal_(ev.endDate));
  setVal_('edit-exchange-deadline', toDtLocal_(cfg.exchangeDeadline));
}

// "yyyy/MM/dd" → datetime-local の日付部分のみ (時刻は 00:00)
function dateToDtLocal_(val) {
  if (!val) return '';
  const d = String(val).replace(/\//g, '-').slice(0, 10);
  return d.length === 10 ? d + 'T00:00' : '';
}

async function handleSaveEventInfo_() {
  if (!curEvent_) return;
  const eventName        = getVal_('edit-event-name').trim();
  const startDatetime    = getVal_('edit-start-datetime');
  const endDatetime      = getVal_('edit-end-datetime');
  const exchangeDeadline = getVal_('edit-exchange-deadline');
  const status           = getVal_('edit-event-status');
  const btn = id_('btn-save-event-info');
  const fb  = id_('save-event-fb');
  if (!eventName || !startDatetime || !endDatetime) {
    fb.className = 'save-fb save-fb-err'; fb.textContent = '名前・開始日時・終了日時は必須です'; return;
  }
  btn.disabled = true; fb.className = 'save-fb'; fb.textContent = '';
  // EVENT_LIST には日付のみ渡す（getCurrentEvent の日付比較用）
  const startDate = startDatetime.slice(0, 10).replace(/-/g, '/');
  const endDate   = endDatetime.slice(0, 10).replace(/-/g, '/');
  const res = await adminCall_('adminUpdateEvent', {
    eventId: curEvent_,
    eventName,
    startDate,
    endDate,
    status,
    stampStartAt:     fromDtLocal_(startDatetime),
    stampEndAt:       fromDtLocal_(endDatetime),
    exchangeDeadline: exchangeDeadline ? fromDtLocal_(exchangeDeadline) : fromDtLocal_(endDatetime),
  });
  btn.disabled = false;
  if (res.ok) {
    const ev = allEvents_.find(e => e.eventId === curEvent_);
    if (ev) { ev.name = eventName; ev.startDate = startDate; ev.endDate = endDate; ev.status = status; }
    setText_('dash-ev-name', eventName);
    fb.className = 'save-fb save-fb-ok'; fb.textContent = '✓ 保存しました';
    setTimeout(() => { fb.textContent = ''; }, 3000);
  } else {
    fb.className = 'save-fb save-fb-err'; fb.textContent = '⚠ 失敗: ' + (res.message || res.error || '');
  }
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

// ── Delete Event ──────────────────────────────────
async function handleDeleteEvent_(eventId) {
  if (!eventId) return;
  const ev = allEvents_.find(e => e.eventId === eventId);
  const label = ev ? `「${ev.name || eventId}」(${eventId})` : `「${eventId}」`;
  if (!window.confirm(
    `${label} をマスター一覧から削除しますか？\n\n` +
    '⚠ イベントのスプレッドシート本体は削除されません。\n' +
    '削除後は管理画面から参照できなくなります。'
  )) return;

  const res = await adminCall_('adminDeleteEvent', { eventId });
  if (res.ok) {
    showToast_('✓ 削除しました: ' + eventId);
    // ローカルのリストを更新して再描画
    allEvents_ = allEvents_.filter(e => e.eventId !== eventId);
    renderEventList_();
    // もし削除対象が現在表示中のイベントなら一覧へ戻る
    if (curEvent_ === eventId) {
      curEvent_ = '';
      location.hash = '#';
    }
  } else {
    showToast_('⚠ 削除失敗: ' + (res.message || ''));
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

  // Step 3（学生管理ナビカード）: 登録学生数（事前 + 当日）
  const preReg       = parseInt(id_('stat-preregistered')?.textContent, 10) || 0;
  const walkIn       = parseInt(id_('stat-walkins')?.textContent,       10) || 0;
  const studentCount = preReg + walkIn;
  const step3Done    = studentCount > 0;
  setBadge_('badge-step3', step3Done ? 'done' : 'todo',
    step3Done ? `✓ ${studentCount}名` : '未登録');

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
