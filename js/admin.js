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

  // パスワード復旧（メール宛リセット）
  id_('link-forgot')?.addEventListener('click', e => { e.preventDefault(); toggleResetPanel_(true); });
  id_('link-back-login')?.addEventListener('click', e => { e.preventDefault(); toggleResetPanel_(false); });
  id_('btn-reset-send')?.addEventListener('click', handleResetSend_);
  id_('btn-reset-confirm')?.addEventListener('click', handleResetConfirm_);

  // Logout (イベント一覧ページ)
  id_('btn-logout')?.addEventListener('click', handleLogout_);

  // 新規イベント
  id_('btn-new-event')?.addEventListener('click', () => showModal_('modal-create'));
  id_('modal-close')?.addEventListener('click', () => hideModal_('modal-create'));
  id_('btn-create-event')?.addEventListener('click', handleCreateEvent_);

  // ダッシュボード操作
  id_('btn-reload')?.addEventListener('click', () => loadAll_());
  id_('btn-save-event-info')?.addEventListener('click', handleSaveEventInfo_);
  id_('btn-save-config')?.addEventListener('click', () => saveConfig_('btn-save-config', 'save-feedback'));
  id_('btn-save-form-config')?.addEventListener('click', () => saveConfig_('btn-save-form-config', 'form-save-feedback'));
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

  // 企業URL一括発行
  id_('btn-nfc-csv')?.addEventListener('click', downloadNfcCsv_);
  id_('btn-company-qr-csv')?.addEventListener('click', downloadCompanyQrCsv_);

  // 事前登録フォームURLコピー
  id_('btn-copy-prereg-url')?.addEventListener('click', () => {
    const txt = id_('prereg-form-url')?.textContent;
    if (txt && !txt.startsWith('（')) copyText_(txt);
  });

  // 出場校エントリーフォームURLコピー
  id_('btn-copy-school-entry-url')?.addEventListener('click', () => {
    const txt = id_('school-entry-form-url')?.textContent;
    if (txt && !txt.startsWith('（')) copyText_(txt);
  });

  // 事前登録CSVダウンロード（QRパス用・区分別）
  id_('btn-prereg-csv-driver')?.addEventListener('click', () => downloadPreRegCsv_('driver'));
  id_('btn-prereg-csv-spectator')?.addEventListener('click', () => downloadPreRegCsv_('spectator'));
  id_('btn-prereg-csv-all')?.addEventListener('click', () => downloadPreRegCsv_('all'));
  id_('btn-student-qr-csv')?.addEventListener('click', downloadStudentQrCsv_);

  // 出展申込ページ
  id_('btn-entry-reload')?.addEventListener('click', loadCompanyEntries_);
  id_('btn-entry-csv')?.addEventListener('click', downloadEntryCsv_);
  id_('modal-entry-close')?.addEventListener('click', () => { id_('modal-entry').style.display = 'none'; });
  id_('modal-entry-edit-close')?.addEventListener('click', () => { id_('modal-entry-edit').style.display = 'none'; });
  id_('modal-school-entry-close')?.addEventListener('click', () => { id_('modal-school-entry').style.display = 'none'; });
  id_('modal-school-entry')?.addEventListener('click', e => {
    if (e.target.id === 'modal-school-entry') id_('modal-school-entry').style.display = 'none';
  });
  id_('btn-save-entry-edit')?.addEventListener('click', saveEntryEdit_);
  id_('modal-entry-body')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-copy]');
    if (btn) copyText_(btn.dataset.copy);
  });
  id_('btn-copy-entry-url')?.addEventListener('click', () => {
    const txt = id_('entry-form-url')?.textContent;
    if (txt && !txt.startsWith('（') && txt !== '—') copyText_(txt);
  });

  // 企業管理タブ切り替え
  document.querySelectorAll('.co-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.coTab;
      activateCoTab_(tab);
      if (tab === 'register') {
        populateImportSelect_();
        loadCompanies_();
      } else if (tab === 'entries') {
        updateEntryFormUrl_();
        loadCompanyEntries_();
      }
    });
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
    activateCoTab_('register');
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
  } else if (section === 'forms') {
    showPage_('forms');
    loadConfig_(++loadGen_, curEvent_);
    updateWalkInUrl_(); // 当日参加登録URLをフォーム管理ページに表示
  } else if (section === 'universities') {
    showPage_('universities');
    loadUniversities_();
  } else if (section === 'entries') {
    showPage_('companies');
    activateCoTab_('entries');
    updateEntryFormUrl_();
    loadCompanyEntries_();
  } else if (section === 'entry-list') {
    showPage_('entry-list');
    loadEntryList_();
  } else if (section === 'reception') {
    showPage_('reception');
    loadReceptionList_();
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
  ['events', 'dashboard', 'companies', 'students', 'forms', 'universities', 'entry-list', 'reception', 'settings'].forEach(p => {
    const el = id_('page-' + p);
    if (el) el.style.display = p === name ? '' : 'none';
  });
}

function activateCoTab_(tab) {
  document.querySelectorAll('.co-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.coTab === tab);
  });
  document.querySelectorAll('.co-tab-content').forEach(c => c.classList.remove('active'));
  const target = id_('co-tab-' + tab);
  if (target) target.classList.add('active');
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
    // 公開停止(旧: 完了)は done、それ以外(公開中/旧 準備中・開催中)は active
    const stopped = ev.status === '公開停止' || ev.status === '完了';
    const statusClass = stopped ? 'done' : 'active';
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
  const fm = id_('nav-form-card');
  const un = id_('nav-uni-card');
  const en = id_('nav-entry-card');
  const el = id_('nav-entry-list-card');
  const rc = id_('nav-reception-card');
  const backCo        = id_('back-dash-co');
  const backSt        = id_('back-dash-st');
  const backFm        = id_('back-dash-form');
  const backUn        = id_('back-dash-uni');
  const backEntry     = id_('back-dash-entry');
  const backEntryList = id_('back-dash-entry-list');
  const backReception = id_('back-dash-reception');
  if (co) co.href = '#' + curEvent_ + '/companies';
  if (st) st.href = '#' + curEvent_ + '/students';
  if (fm) fm.href = '#' + curEvent_ + '/forms';
  if (un) un.href = '#' + curEvent_ + '/universities';
  if (en) en.href = '#' + curEvent_ + '/entries';
  if (el) el.href = '#' + curEvent_ + '/entry-list';
  if (rc) rc.href = '#' + curEvent_ + '/reception';
  if (backCo)        backCo.href        = '#' + curEvent_;
  if (backSt)        backSt.href        = '#' + curEvent_;
  if (backFm)        backFm.href        = '#' + curEvent_;
  if (backUn)        backUn.href        = '#' + curEvent_;
  if (backEntry)     backEntry.href     = '#' + curEvent_;
  if (backEntryList) backEntryList.href = '#' + curEvent_;
  if (backReception) backReception.href = '#' + curEvent_;
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
  loadWalkIns_(gen, ev);
  updateUniBadge_(gen);
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

// マイカードURL（学生自身がQRを確認するページ / 登録完了メールに記載するリンクと同じ）
function mypassUrl_(cardToken) {
  const ev = curEvent_ ? `&event=${encodeURIComponent(curEvent_)}` : '';
  return new URL(`mypass.html?token=${encodeURIComponent(cardToken)}${ev}`, location.href).toString();
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
  const head = ['学生ID', '参加区分', '苗字', '氏名', 'ふりがな', 'トークン', 'QR用URL'];
  const lines = [head.join(',')].concat(filtered.map(r => [
    r[ci.sid] || '',
    passCategory_(r[ci.cat] || '', r[ci.dc] || ''),
    (r[ci.name] || '').split(/\s+/)[0],
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
  // 食券集計
  const L = d.lunch || {};
  const co = L.company || {}, st = L.student || {};
  setText_('lunch-co-sat',    co.sat  ?? '—');
  setText_('lunch-co-sun',    co.sun  ?? '—');
  setText_('lunch-stu-sat',   st.sat  ?? '—');
  setText_('lunch-stu-sun',   st.sun  ?? '—');
  setText_('lunch-total-sat', (co.sat || 0) + (st.sat || 0) || '—');
  setText_('lunch-total-sun', (co.sun || 0) + (st.sun || 0) || '—');
  setText_('lunch-stu-sat2',  st.sat  ?? '—');
  setText_('lunch-stu-sun2',  st.sun  ?? '—');
  setText_('lunch-co-sat2',   co.sat  ?? '—');
  setText_('lunch-co-sun2',   co.sun  ?? '—');
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
  setVal_('cfg-preRegMailSubject', cfg.preRegMailSubject || PREREG_MAIL_SUBJECT_DEFAULT);
  setVal_('cfg-preRegMailBody',    cfg.preRegMailBody    || PREREG_MAIL_BODY_DEFAULT);
  setVal_('cfg-walkInMailSubject', cfg.walkInMailSubject || WALKIN_MAIL_SUBJECT_DEFAULT);
  setVal_('cfg-walkInMailBody',    cfg.walkInMailBody    || WALKIN_MAIL_BODY_DEFAULT);
  setVal_('cfg-formOpenAt',         toDtLocal_(cfg.formOpenAt));
  setVal_('cfg-deadlineDriver',     toDtLocal_(cfg.deadlineDriver));
  setVal_('cfg-deadlineWomenDriver',toDtLocal_(cfg.deadlineWomenDriver));
  setVal_('cfg-deadlineReserve',    toDtLocal_(cfg.deadlineReserve));
  setVal_('cfg-deadlineMechanic',   toDtLocal_(cfg.deadlineMechanic));
  setVal_('cfg-schoolEntryFormOpenAt', toDtLocal_(cfg.schoolEntryFormOpenAt));
  setVal_('cfg-schoolEntryDeadline',   toDtLocal_(cfg.schoolEntryDeadline));
  updatePreRegFormUrl_();
  updateSchoolEntryFormUrl_();
  updateFormBadge_(cfg);
}

/** フォーム管理ナビカードのバッジ: 公開状態を表示（設定読込済みデータから判定・軽量） */
function updateFormBadge_(cfg) {
  const open = cfg.formOpenAt ? new Date(cfg.formOpenAt) : null;
  const now  = new Date();
  if (!open) {
    setBadge_('badge-form', 'todo', '未設定');
  } else if (now >= open) {
    setBadge_('badge-form', 'done', '✓ 公開中');
  } else {
    setBadge_('badge-form', 'init', `${open.getMonth() + 1}/${open.getDate()} 公開`);
  }
}

// 確認メールの既定文面（CONFIG未設定時に表示・保存されるテンプレ）
const PREREG_MAIL_SUBJECT_DEFAULT = '【{eventName}】学生参加 事前登録を受け付けました';
const PREREG_MAIL_BODY_DEFAULT =
  '{name} 様\n\n' +
  '{eventName} の学生参加 事前登録を受け付けました。\n\n' +
  '当日は受付でご本人確認のうえ、入場パスをお渡しします。\n' +
  '登録内容に変更がある場合は事務局までご連絡ください。\n\n' +
  '── FORMULA GYMKHANA 事務局';

// 当日参加 受付メールの既定文面（GAS sendWalkInPassMail_ のフォールバックと一致させる）
const WALKIN_MAIL_SUBJECT_DEFAULT = '【{eventName}】当日参加 受付完了（あなたのMY PASS）';
const WALKIN_MAIL_BODY_DEFAULT =
  '{name} 様\n\n' +
  '{eventName} の当日参加登録を受け付けました。スタンプラリーにご参加いただけます。\n\n' +
  '▼あなたのMY PASS（氏名・QRコード）\n' +
  '{passUrl}\n\n' +
  '・このページをブックマーク／ホーム画面に追加しておくと、いつでも開けます。\n' +
  '・企業ブースの方には、このページのQRコードを見せてください。\n' +
  '・スタンプの進捗が消えてしまった場合も、このページから元に戻せます。\n\n' +
  '── FORMULA GYMKHANA 事務局';

async function saveConfig_(btnId, fbId) {
  if (!curEvent_) return;
  const btn = id_(btnId);
  const fb  = id_(fbId);
  btn.disabled = true; fb.className = 'save-fb'; fb.textContent = '';

  const toIso_ = v => v ? fromDtLocal_(v) : '';
  const map = {
    prizeUnitSize:        getVal_('cfg-prizeUnitSize'),
    maxPrizes:            getVal_('cfg-maxPrizes'),
    preRegMailSubject:    getVal_('cfg-preRegMailSubject'),
    preRegMailBody:       getVal_('cfg-preRegMailBody'),
    walkInMailSubject:    getVal_('cfg-walkInMailSubject'),
    walkInMailBody:       getVal_('cfg-walkInMailBody'),
    formOpenAt:           toIso_(getVal_('cfg-formOpenAt')),
    deadlineDriver:       toIso_(getVal_('cfg-deadlineDriver')),
    deadlineWomenDriver:  toIso_(getVal_('cfg-deadlineWomenDriver')),
    deadlineReserve:      toIso_(getVal_('cfg-deadlineReserve')),
    deadlineMechanic:     toIso_(getVal_('cfg-deadlineMechanic')),
    schoolEntryFormOpenAt: toIso_(getVal_('cfg-schoolEntryFormOpenAt')),
    schoolEntryDeadline:   toIso_(getVal_('cfg-schoolEntryDeadline')),
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
  downloadCsv_(lines.join('\r\n'), `学生QR_URL_${curEvent_}_${new Date().toISOString().slice(0,10)}.csv`);
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


/** 企業QR URL（再閲覧用）を CSV 出力 */
async function downloadCompanyQrCsv_() {
  if (!curEvent_) { showToast_('イベントが選択されていません'); return; }
  const res = await adminCall_('adminGetCompanies', { event: curEvent_ });
  if (!res.ok) { showToast_('企業の取得に失敗しました'); return; }
  const list = (res.data.companies || []).filter(c => c.viewKey);
  if (!list.length) { showToast_('閲覧キー発行済みの企業がありません'); return; }
  const esc = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head  = ['ブース名（企業名）', '再閲覧QR用URL', 'viewKey', '企業ID'];
  const lines = [head.join(',')].concat(list.map(c =>
    [c.name, companyQrUrl_(c.viewKey), c.viewKey, c.companyId].map(esc).join(',')));
  downloadCsv_(lines.join('\r\n'), `企業再閲覧QR_URL_${curEvent_}_${new Date().toISOString().slice(0, 10)}.csv`);
  showToast_(`✓ ${list.length}社の再閲覧QR URLを出力しました`);
}

/** 企業QRをPNG(1200×1200)でダウンロード */
function downloadCompanyQrPng_(url, name) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
  document.body.appendChild(wrap);
  new QRCode(wrap, {
    text: url,
    width: 1200,
    height: 1200,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
  const canvas = wrap.querySelector('canvas');
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `企業QR_${name}.png`;
  a.click();
  document.body.removeChild(wrap);
}

/** 企業QR(登録＋来訪者一覧)のURL: company.html?viewkey=<viewKey>&event=<eventId> */
function companyQrUrl_(viewKey) {
  const ev = curEvent_ ? `&event=${encodeURIComponent(curEvent_)}` : '';
  return new URL(`company.html?viewkey=${encodeURIComponent(viewKey)}${ev}`, location.href).toString();
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
        <a class="url-val" href="${esc_(nfcUrl_(c.stampKey))}" target="_blank">${esc_(nfcUrl_(c.stampKey))}</a>
        <button class="copy-btn" data-copy="${esc_(nfcUrl_(c.stampKey))}">コピー</button>
      </div>` : ''}
      ${c.viewKey ? `
      <div class="url-row">
        <span class="url-lbl">企業QR・再閲覧URL</span>
        <a class="url-val" href="${esc_(companyQrUrl_(c.viewKey))}" target="_blank">${esc_(companyQrUrl_(c.viewKey))}</a>
        <button class="copy-btn" data-copy="${esc_(companyQrUrl_(c.viewKey))}">コピー</button>
        <button class="copy-btn" data-qr-url="${esc_(companyQrUrl_(c.viewKey))}" data-qr-name="${esc_(c.name)}">QR</button>
      </div>` : ''}
      <div class="logo-row">
        <span class="logo-lbl">ロゴURL</span>
        <input class="logo-url-input" type="url" placeholder="https://… または logos/xxx.png"
          data-logo-id="${esc_(c.companyId)}" value="${esc_(c.logoUrl || '')}">
        <div class="logo-preview">${c.logoUrl ? `<img src="${esc_(c.logoUrl)}" alt="">` : '?'}</div>
        <button class="copy-btn logo-save-btn" data-logo-save="${esc_(c.companyId)}">保存</button>
        <input type="file" accept="image/*" class="logo-file-input" style="display:none"
          data-logo-id="${esc_(c.companyId)}">
        <button class="copy-btn logo-upload-btn" data-logo-upload="${esc_(c.companyId)}">↑ファイル</button>
      </div>
    </div>`;
  }).join('');
  container.querySelectorAll('.copy-btn[data-copy]').forEach(b =>
    b.addEventListener('click', () => copyText_(b.dataset.copy)));
  container.querySelectorAll('.copy-btn[data-qr-url]').forEach(b =>
    b.addEventListener('click', () => downloadCompanyQrPng_(b.dataset.qrUrl, b.dataset.qrName)));
  container.querySelectorAll('.del-btn[data-del-company]').forEach(b =>
    b.addEventListener('click', () => handleDeleteCompany_(b.dataset.delCompany)));
  container.querySelectorAll('.logo-url-input').forEach(inp =>
    inp.addEventListener('input', () => {
      const pv = inp.closest('.logo-row').querySelector('.logo-preview');
      const url = inp.value.trim();
      if (url) { pv.textContent = ''; pv.appendChild(makeLogoImg_(url)); }
      else     { pv.textContent = '?'; }
    }));
  // 初期表示のロゴ画像にも error フォールバックを付与（CSPでinline onerrorは不可）
  container.querySelectorAll('.logo-preview img').forEach(attachLogoFallback_);
  container.querySelectorAll('.logo-save-btn[data-logo-save]').forEach(b =>
    b.addEventListener('click', () => handleSaveLogo_(b)));
  container.querySelectorAll('.logo-upload-btn[data-logo-upload]').forEach(b =>
    b.addEventListener('click', () =>
      b.closest('.logo-row').querySelector('.logo-file-input')?.click()));
  container.querySelectorAll('.logo-file-input').forEach(inp =>
    inp.addEventListener('change', () => { if (inp.files[0]) handleUploadLogo_(inp); }));
  container.querySelectorAll('input[data-rally]').forEach(cb =>
    cb.addEventListener('change', () => handleToggleStampRally_(cb)));
  updateStepBadges_();
}

// ロゴ画像のエラー時フォールバック（読み込み失敗で「?」表示）。CSP対策でJS付与。
function attachLogoFallback_(img) {
  img.addEventListener('error', () => { img.parentNode.textContent = '?'; });
}
function makeLogoImg_(url) {
  const img = document.createElement('img');
  img.src = url; img.alt = '';
  attachLogoFallback_(img);
  return img;
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

async function handleUploadLogo_(fileInput) {
  if (!curEvent_) return;
  const companyId = fileInput.dataset.logoId;
  const file      = fileInput.files[0];
  const row       = fileInput.closest('.logo-row');
  const btn       = row.querySelector('.logo-upload-btn');
  const orig      = btn.textContent;
  btn.disabled    = true; btn.textContent = '送信中...';

  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const res = await adminCall_('adminUploadCompanyLogo', {
    event: curEvent_, companyId,
    base64, mimeType: file.type || 'image/png',
  });

  btn.disabled = false;
  if (res.ok) {
    btn.textContent = '✓';
    const urlInput = row.querySelector('.logo-url-input');
    if (urlInput) urlInput.value = res.data.url;
    const pv = row.querySelector('.logo-preview');
    if (pv) { pv.textContent = ''; pv.appendChild(makeLogoImg_(res.data.url)); }
    showToast_('✓ ロゴをアップロードしました');
  } else {
    btn.textContent = 'エラー';
    showToast_('⚠ アップロード失敗: ' + (res.message || ''));
  }
  setTimeout(() => { btn.textContent = orig; }, 2000);
  fileInput.value = '';
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
              <div style="font-size:10px;color:var(--gray);margin-top:2px">${esc_(s.school)} · ${esc_(s.category || '—')} · ${esc_(s.year || '—')}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button class="copy-btn stu-edit-btn" data-sid="${esc_(s.studentId)}" style="font-size:10px;padding:2px 8px">編集</button>
              <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;
                background:${s.regType === '事前' ? '#F3F4F6' : '#DBEAFE'};
                color:${s.regType === '事前' ? '#6B7280' : '#1E40AF'}">
                ${s.regType === '事前' ? '事前登録' : '当日'}
              </span>
            </div>
          </div>
          ${s.cardToken ? `
          <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
            <span style="font-size:9px;color:var(--gray);flex-shrink:0;width:52px">MY PASS</span>
            <a href="${esc_(mypassUrl_(s.cardToken))}" target="_blank" class="stu-card-link">${esc_(mypassUrl_(s.cardToken))}</a>
            <button class="copy-btn" data-copy="${esc_(mypassUrl_(s.cardToken))}" style="flex-shrink:0;font-size:10px;padding:2px 8px">コピー</button>
            ${s.regType !== '事前' ? `
            <button class="copy-btn" data-resend="${esc_(s.cardToken)}" style="flex-shrink:0;font-size:10px;padding:2px 8px">メール再送信</button>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
            <span style="font-size:9px;color:var(--gray);flex-shrink:0;width:52px">学生カード</span>
            <a href="${esc_(cardPassUrl_(s.cardToken))}" target="_blank" class="stu-card-link">${esc_(cardPassUrl_(s.cardToken))}</a>
            <button class="copy-btn" data-copy="${esc_(cardPassUrl_(s.cardToken))}" style="flex-shrink:0;font-size:10px;padding:2px 8px">コピー</button>
          </div>` : ''}
          <div class="stu-edit-form" data-sid="${esc_(s.studentId)}" style="display:none;margin-top:8px;padding:10px;background:var(--fg-bg);border-radius:8px;border:1px solid var(--border)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
              <div><label style="font-size:10px;color:var(--gray);display:block;margin-bottom:2px">氏名</label>
                <input class="f-input" style="padding:6px 8px;font-size:12px;margin:0" data-field="name" value="${esc_(s.name)}"></div>
              <div><label style="font-size:10px;color:var(--gray);display:block;margin-bottom:2px">ふりがな</label>
                <input class="f-input" style="padding:6px 8px;font-size:12px;margin:0" data-field="furigana" value="${esc_(s.furigana)}"></div>
              <div><label style="font-size:10px;color:var(--gray);display:block;margin-bottom:2px">大学名</label>
                <input class="f-input" style="padding:6px 8px;font-size:12px;margin:0" data-field="school" value="${esc_(s.school)}"></div>
              <div><label style="font-size:10px;color:var(--gray);display:block;margin-bottom:2px">属性</label>
                <input class="f-input" style="padding:6px 8px;font-size:12px;margin:0" data-field="category" value="${esc_(s.category || '')}"></div>
              <div style="grid-column:1/-1"><label style="font-size:10px;color:var(--gray);display:block;margin-bottom:2px">メールアドレス</label>
                <input class="f-input" style="padding:6px 8px;font-size:12px;margin:0" type="email" data-field="email" value="${esc_(s.email || '')}"></div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="copy-btn stu-save-btn" data-sid="${esc_(s.studentId)}" style="font-size:11px;padding:4px 12px;background:var(--fg-blue);color:#fff;border:none;border-radius:6px">保存</button>
              <button class="copy-btn stu-cancel-btn" data-sid="${esc_(s.studentId)}" style="font-size:11px;padding:4px 10px">キャンセル</button>
            </div>
          </div>
        </div>`).join('')}
    </div>`;
  wrap.querySelectorAll('.copy-btn[data-copy]').forEach(b =>
    b.addEventListener('click', () => copyText_(b.dataset.copy)));
  wrap.querySelectorAll('.copy-btn[data-resend]').forEach(b =>
    b.addEventListener('click', () => handleResendWalkInMail_(b)));
  wrap.querySelectorAll('.stu-edit-btn').forEach(b =>
    b.addEventListener('click', () => {
      const form = wrap.querySelector(`.stu-edit-form[data-sid="${b.dataset.sid}"]`);
      form.style.display = form.style.display === 'none' ? '' : 'none';
    }));
  wrap.querySelectorAll('.stu-cancel-btn').forEach(b =>
    b.addEventListener('click', () => {
      wrap.querySelector(`.stu-edit-form[data-sid="${b.dataset.sid}"]`).style.display = 'none';
    }));
  wrap.querySelectorAll('.stu-save-btn').forEach(b =>
    b.addEventListener('click', () => handleSaveStudentEdit_(b, wrap)));
}

/** 学生情報をGASで全シート横断書き換え */
async function handleSaveStudentEdit_(btn, wrap) {
  const sid  = btn.dataset.sid;
  const form = wrap.querySelector(`.stu-edit-form[data-sid="${sid}"]`);
  const payload = { event: curEvent_, studentId: sid };
  form.querySelectorAll('input[data-field]').forEach(inp => {
    payload[inp.dataset.field] = inp.value.trim();
  });
  btn.disabled = true; btn.textContent = '保存中…';
  const res = await adminCall_('adminUpdateStudent', payload);
  btn.disabled = false; btn.textContent = '保存';
  if (!res.ok) { showToast_(res.message || '保存に失敗しました'); return; }
  const u = res.data.updated;
  showToast_(`✓ 更新完了（学生マスター:${u.students} 事前登録:${u.preReg} スタンプログ:${u.stampLog} 景品:${u.prizeLog}）`);
  form.style.display = 'none';
  loadStudents_(++loadGen_, curEvent_);
}

// 当日参加者へ個人ページ(氏名+QR)のリンクをメール再送信する
async function handleResendWalkInMail_(btn) {
  if (!curEvent_) return;
  const token = btn.dataset.resend;
  if (!token) return;
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '送信中…';
  const res = await adminCall_('adminResendWalkInMail', {
    event: curEvent_,
    token,
    appBase: new URL('.', location.href).href,
  });
  btn.disabled = false; btn.textContent = orig;
  if (res.ok) {
    showToast_(`✓ メールを再送信しました（${res.data && res.data.email ? res.data.email : ''}）`);
  } else {
    showToast_('⚠ 再送信に失敗: ' + (res.message || res.error || ''));
  }
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

function updateEntryFormUrl_() {
  const el = id_('entry-form-url');
  if (!el) return;
  if (!curEvent_) { el.textContent = '（イベント未選択）'; return; }
  const base = location.origin + location.pathname.replace(/[^/]+$/, 'company-entry.html');
  const url = `${base}?event=${encodeURIComponent(curEvent_)}`;
  el.innerHTML = `<a href="${url}" target="_blank" class="url-anchor">${url}</a>`;
}

function updatePreRegFormUrl_() {
  const el = id_('prereg-form-url');
  if (!el) return;
  if (!curEvent_) { el.textContent = '（イベント未選択）'; return; }
  const base = location.origin + location.pathname.replace(/[^/]+$/, 'register-pre.html');
  const url = `${base}?event=${encodeURIComponent(curEvent_)}`;
  el.innerHTML = `<a href="${url}" target="_blank" class="url-anchor">${url}</a>`;
}

function updateSchoolEntryFormUrl_() {
  const el = id_('school-entry-form-url');
  if (!el) return;
  if (!curEvent_) { el.textContent = '（イベント未選択）'; return; }
  const base = location.origin + location.pathname.replace(/[^/]+$/, 'register-school.html');
  const url = `${base}?event=${encodeURIComponent(curEvent_)}`;
  el.innerHTML = `<a href="${url}" target="_blank" class="url-anchor">${url}</a>`;
}

function updateWalkInUrl_() {
  const el = id_('walkin-url');
  if (!el) return;
  // 当日受付コードは撤廃済み（開放）。素の register.html を当日の受付URLとして表示する。
  const url = location.origin + location.pathname.replace(/[^/]+$/, 'register.html');
  el.innerHTML = `<a href="${url}" target="_blank" class="url-anchor">${url}</a>`;
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

// ── パスワード復旧（メール宛リセット） ──────────────
// 認証不要の公開アクション。コード/新キーはURLに載せないため POST で送信。
async function publicPost_(action, params) {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res   = await fetch(FG_CONFIG.API_BASE_URL, {
      method: 'POST',
      body: JSON.stringify({ action, ...params }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') return { ok: false, error: 'timeout', message: 'タイムアウト' };
    return { ok: false, error: 'network_error', message: '通信エラー' };
  }
}

function toggleResetPanel_(show) {
  id_('login-panel').style.display = show ? 'none' : '';
  id_('reset-panel').style.display = show ? '' : 'none';
  id_('reset-err')?.classList.remove('show');
}

async function handleResetSend_() {
  const btn = id_('btn-reset-send');
  btn.disabled = true; btn.textContent = '送信中...';
  // サーバは（メール未設定でも情報を漏らさないため）常に成功を返す
  await publicPost_('adminRequestReset', {});
  btn.disabled = false; btn.textContent = '復旧コードを再送信';
  const note = id_('reset-sent-note');
  if (note) note.style.display = '';
}

async function handleResetConfirm_() {
  const code   = getVal_('reset-code').trim().toUpperCase();
  const newKey = getVal_('reset-newkey').trim();
  const err    = id_('reset-err');
  err.classList.remove('show');

  if (!code || !newKey) {
    err.textContent = 'コードと新しいキーを入力してください';
    err.classList.add('show'); return;
  }

  const btn = id_('btn-reset-confirm');
  btn.disabled = true; btn.textContent = '再設定中...';
  const res = await publicPost_('adminConfirmReset', { code, newKey });
  btn.disabled = false; btn.textContent = 'パスワードを再設定';

  if (res.ok) {
    // 再設定成功 → ログイン画面に戻し、新キーで入れる状態にする
    toggleResetPanel_(false);
    setVal_('reset-code', ''); setVal_('reset-newkey', '');
    id_('reset-sent-note').style.display = 'none';
    setVal_('login-key', newKey);
    showLoginErr_('✓ パスワードを再設定しました。このキーでログインしてください。');
    id_('login-err')?.classList.add('show');
  } else {
    err.textContent = '⚠ ' + (res.message || '再設定に失敗しました');
    err.classList.add('show');
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
  if (sel) sel.value = (ev.status === '公開停止' || ev.status === '完了') ? '公開停止' : '公開中';

  // CONFIGからstampStartAt/stampEndAt/exchangeDeadlineを取得して datetime 入力を埋める
  const cfgRes = await adminCall_('adminGetConfig', { event: curEvent_ });
  const cfg = cfgRes.ok ? (cfgRes.data.config || {}) : {};
  setVal_('edit-start-datetime',    toDtLocal_(cfg.stampStartAt)    || dateToDtLocal_(ev.startDate));
  setVal_('edit-end-datetime',      toDtLocal_(cfg.stampEndAt)      || dateToDtLocal_(ev.endDate));
  setVal_('edit-exchange-deadline', toDtLocal_(cfg.exchangeDeadline));
  setVal_('cfg-publicDeadline',     toDtLocal_(cfg.publicDeadline));
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
  const publicDeadline   = getVal_('cfg-publicDeadline');
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
    // 空欄＝終了日+2ヶ月（GAS側 isPastDeadline_ が下限適用）。値があれば延長として保存。
    const pdValue = publicDeadline ? fromDtLocal_(publicDeadline) : '';
    await adminCall_('adminUpdateConfig', { event: curEvent_, key: 'publicDeadline', value: pdValue });
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
// adminKey をURLに含めないよう POST JSON で送信する。
// GAS の doPost は postData.contents を JSON パースして parameter にマージする。
async function adminCall_(action, params) {
  const body = JSON.stringify({ action, adminKey: adminKey_, ...params });
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res   = await fetch(FG_CONFIG.API_BASE_URL, {
      method: 'POST',
      body,
      redirect: 'follow',
      signal: ctrl.signal,
    });
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
}

function setBadge_(eid, type, label) {
  const el = id_(eid); if (!el) return;
  // base class: nav-card-count または step-badge を維持
  const base = el.classList.contains('nav-card-count') ? 'nav-card-count' : 'step-badge';
  el.className = base + ' ' + type;
  el.textContent = label;
}

// ── 大学マスター（要確認レビュー）─────────────────
// ポケベルコード化: 1桁目=行(あ=1…ら=9,わ=0)、2桁目=段(あいうえお=1〜5)。
// 連番(下2桁)は確定時にGAS側が既存コードを見て採番する。
const POKEBELL_ = {
  あ:'11',い:'12',う:'13',え:'14',お:'15',
  か:'21',き:'22',く:'23',け:'24',こ:'25',
  さ:'31',し:'32',す:'33',せ:'34',そ:'35',
  た:'41',ち:'42',つ:'43',て:'44',と:'45',
  な:'51',に:'52',ぬ:'53',ね:'54',の:'55',
  は:'61',ひ:'62',ふ:'63',へ:'64',ほ:'65',
  ま:'71',み:'72',む:'73',め:'74',も:'75',
  や:'81',ゆ:'83',よ:'85',
  ら:'91',り:'92',る:'93',れ:'94',ろ:'95',
  わ:'01',を:'05',ん:'00',
};
// 濁音・半濁音・小書き → 清音ベースに正規化（同志社=ど→と と同じ扱い）
const KANA_BASE_ = (() => {
  const m = { ぁ:'あ',ぃ:'い',ぅ:'う',ぇ:'え',ぉ:'お',っ:'つ',ゃ:'や',ゅ:'ゆ',ょ:'よ',ゎ:'わ' };
  'がぎぐげござじずぜぞだぢづでどばびぶべぼ'.split('').forEach(c =>
    m[c] = String.fromCharCode(c.charCodeAt(0) - 1));
  'ぱぴぷぺぽ'.split('').forEach(c =>
    m[c] = String.fromCharCode(c.charCodeAt(0) - 2));
  return m;
})();
/** 読みの頭文字 → ポケベルコード上2桁。判定不能なら '' */
function pokebellPrefix_(reading) {
  if (!reading) return '';
  let c = reading.trim().charAt(0);
  if (c >= 'ァ' && c <= 'ヶ') c = String.fromCharCode(c.charCodeAt(0) - 0x60); // カタカナ→ひらがな
  c = KANA_BASE_[c] || c;
  return POKEBELL_[c] || '';
}

/** 大学マスターナビカードのバッジ: 要確認の校数 */
async function updateUniBadge_(gen) {
  const res = await adminCall_('adminGetPendingUniversities', { event: curEvent_ });
  if (gen !== loadGen_) return;
  if (!res.ok) { setBadge_('badge-uni', 'init', '—'); return; }
  const n = (res.data.universities || []).length;
  setBadge_('badge-uni', n > 0 ? 'todo' : 'done', n > 0 ? `要確認 ${n}` : '✓ 完了');
}

/** 大学管理ページ: 参加大学一覧＋承認待ちを独立にロード
 *  （承認待ちは未デプロイ時にタイムアウトしうるので、一覧の描画をブロックしない） */
function loadUniversities_() {
  const gen = ++loadGen_;
  // 参加大学一覧（学生集計）
  (async () => {
    const res = studentData_.length
      ? { ok: true, data: { students: studentData_ } }
      : await adminCall_('adminGetStudents', { event: curEvent_ });
    if (gen !== loadGen_) return;
    renderUniList_(res);
  })();
  // 承認待ち
  (async () => {
    const res = await adminCall_('adminGetPendingUniversities', { event: curEvent_ });
    if (gen !== loadGen_) return;
    renderUniPending_(res);
  })();
  // 出場大学（出場校エントリー提出済み）
  (async () => {
    const res = await adminCall_('adminGetSchoolEntries', { event: curEvent_ });
    if (gen !== loadGen_) return;
    renderSchoolEntries_(res);
  })();
}

let schoolEntries_ = [];

function renderSchoolEntries_(res) {
  const wrap = id_('school-entries-wrap');
  const cnt  = id_('school-entries-count');
  if (!wrap) return;
  if (!res.ok) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--fg-warning);text-align:center;padding:16px 0">読み込みに失敗しました</p>';
    return;
  }
  schoolEntries_ = res.data.entries || [];
  if (cnt) cnt.textContent = `${schoolEntries_.length}校`;
  if (!schoolEntries_.length) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--gray);text-align:center;padding:16px 0">まだ提出されていません</p>';
    return;
  }
  wrap.innerHTML = schoolEntries_.map((e, i) => {
    const school = esc_(e['学校名'] || '—');
    const rep    = esc_(e['代表者氏名'] || '—');
    const carPass = esc_(e['車両入場証枚数'] || '—');
    const perm   = e['学校許可取得'] === 'はい';
    const upd    = Number(e['更新回数'] || 1);
    const permChip = perm
      ? '<span class="entry-chip booth-yes">許可取得済</span>'
      : '<span class="entry-chip demo-maybe">許可未取得</span>';
    const updChip = upd > 1
      ? `<span class="entry-chip lunch-sun">更新${upd}回</span>`
      : '';
    return `
      <div class="entry-card" data-school-idx="${i}">
        <div class="entry-card-top">
          <span class="entry-card-name">${school}</span>
        </div>
        <div class="entry-card-contact">${rep} / ${esc_(e['代表者電話'] || '—')}</div>
        <div class="entry-card-chips">
          <span class="entry-chip car-yes">車両入場証: ${carPass}</span>
          ${permChip}
          ${updChip}
        </div>
      </div>`;
  }).join('');
  wrap.querySelectorAll('.entry-card').forEach(card => {
    card.addEventListener('click', () => showSchoolEntryDetail_(schoolEntries_[+card.dataset.schoolIdx]));
  });
}

function showSchoolEntryDetail_(e) {
  if (!e) return;
  const body = id_('modal-school-entry-body');
  const grp = (label, val) =>
    `<div style="margin-bottom:14px"><div style="font-size:11px;color:var(--gray);font-weight:600;margin-bottom:3px">${label}</div><div style="font-size:14px;color:var(--navy);word-break:break-all">${val || '—'}</div></div>`;
  const link = url =>
    url ? `<a href="${esc_(url)}" target="_blank" style="color:var(--fg-blue);text-decoration:underline;font-size:13px">開く</a>` : '—';
  const historyBlock = (e['承諾書履歴'] || '').trim();
  id_('modal-school-entry-title').textContent = e['学校名'] || '出場校エントリー';
  body.innerHTML = [
    grp('提出日時', esc_(e['提出日時'] || '')),
    grp('更新回数', esc_(e['更新回数'] || '1')),
    grp('学校名', esc_(e['学校名'] || '')),
    grp('代表者氏名', esc_(e['代表者氏名'] || '')),
    grp('代表者電話', esc_(e['代表者電話'] || '')),
    grp('代表者メール', esc_(e['代表者メール'] || '')),
    grp('発送先 名義', esc_(e['発送先_名義'] || '')),
    grp('発送先 郵便番号', esc_(e['発送先_郵便番号'] || '')),
    grp('発送先 住所', esc_(e['発送先_住所'] || '')),
    grp('発送先 電話', esc_(e['発送先_電話'] || '')),
    grp('車両入場証枚数', esc_(e['車両入場証枚数'] || '')),
    grp('学校許可取得', esc_(e['学校許可取得'] || '')),
    grp('承諾書', link(e['承諾書URL'])),
    historyBlock ? grp('承諾書（過去分）', `<div style="font-size:12px;white-space:pre-wrap;background:var(--gray-light);padding:8px 10px;border-radius:6px">${esc_(historyBlock)}</div>`) : '',
    e['事務局への連絡事項'] ? grp('事務局への連絡事項', `<div style="white-space:pre-wrap">${esc_(e['事務局への連絡事項'])}</div>`) : '',
  ].join('');
  id_('modal-school-entry').style.display = 'flex';
}

/** 参加大学一覧をレンダリング */
function renderUniList_(res) {
  const wrap = id_('uni-list-wrap');
  if (!wrap) return;
  if (!res.ok) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--fg-warning);text-align:center;padding:16px 0">読み込みに失敗しました</p>';
    return;
  }
  const students = res.data.students || [];
  // 大学ごとに集計
  const uniMap = new Map(); // name → { driver, spectator, walkin, total }
  students.forEach(s => {
    const name = s.school || '不明';
    if (!uniMap.has(name)) uniMap.set(name, { driver: 0, spectator: 0, walkin: 0, total: 0 });
    const r = uniMap.get(name);
    r.total++;
    if (String(s.category || '').includes('ドライバー')) r.driver++;
    else if (s.category === '見学・応援学生') r.spectator++;
    else if (s.regType === '当日') r.walkin++;
    else r.spectator++; // その他事前 → 見学枠でまとめる
  });
  const sorted = [...uniMap.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], 'ja-JP', { sensitivity: 'base' }));
  setText_('uni-list-count', `${sorted.length}校`);
  if (!sorted.length) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--gray);text-align:center;padding:16px 0">登録学生がいません</p>';
    return;
  }
  // 数値セル: 0 は薄い半角ハイフン、実数は少し大きめで視認性を上げる
  const numCell = (n, bold) => {
    const style = `text-align:right;font-size:14px${bold ? ';font-weight:700' : ''}`;
    const val = n ? n : '<span style="color:var(--gray);font-size:12px">-</span>';
    return `<td style="${style}">${val}</td>`;
  };
  wrap.innerHTML =
    `<table class="data-tbl" style="width:100%">
      <thead><tr>
        <th>大学名</th>
        <th style="text-align:right">ドライバー</th>
        <th style="text-align:right">見学/応援</th>
        <th style="text-align:right">当日一般</th>
        <th style="text-align:right">合計</th>
      </tr></thead>
      <tbody>` +
    sorted.map(([name, r]) =>
      `<tr>
        <td>${esc_(name)}</td>
        ${numCell(r.driver)}
        ${numCell(r.spectator)}
        ${numCell(r.walkin)}
        ${numCell(r.total, true)}
      </tr>`).join('') +
    `</tbody></table>`;
}

/** 承認待ち一覧をレンダリング */
function renderUniPending_(res) {
  const wrap = id_('uni-pending-wrap');
  if (!wrap) return;
  if (!res.ok) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--gray);text-align:center;padding:16px 0">（GAS未デプロイ時は利用不可）</p>';
    setText_('uni-pending-count', '');
    return;
  }
  const list = res.data.universities || [];
  setText_('uni-pending-count', list.length ? `${list.length}件` : '');
  if (!list.length) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--gray);text-align:center;padding:16px 0">承認待ちの大学はありません</p>';
    return;
  }
  wrap.innerHTML = list.map(u => `
    <div class="uni-row" data-name="${esc_(u.name)}">
      <div class="uni-name">${esc_(u.name)}<span class="uni-tmp">仮 ${esc_(u.code)}</span></div>
      <div class="uni-ctrl">
        <input class="uni-reading" maxlength="2" placeholder="読み" autocomplete="off">
        <span class="uni-prev">—</span>
        <button class="sm-btn uni-confirm">確定</button>
      </div>
    </div>`).join('');
  wrap.querySelectorAll('.uni-row').forEach(row => {
    const inp  = row.querySelector('.uni-reading');
    const prev = row.querySelector('.uni-prev');
    inp.addEventListener('input', () => {
      const p = pokebellPrefix_(inp.value);
      prev.textContent = p ? `${p}xx` : '—';
    });
    row.querySelector('.uni-confirm').addEventListener('click', () => confirmUniversity_(row));
  });
}

/** 読みを送ってコードを確定（連番採番はGAS側） */
async function confirmUniversity_(row) {
  const name    = row.dataset.name;
  const reading = row.querySelector('.uni-reading').value.trim();
  if (!pokebellPrefix_(reading)) { showToast_('読みの頭文字をひらがなで入力してください'); return; }
  const btn = row.querySelector('.uni-confirm');
  btn.disabled = true; btn.textContent = '…';
  const res = await adminCall_('adminConfirmUniversity', { event: curEvent_, name, reading });
  if (!res.ok) {
    btn.disabled = false; btn.textContent = '確定';
    showToast_(res.message || '確定に失敗しました');
    return;
  }
  row.querySelector('.uni-ctrl').innerHTML = `<span class="uni-done">✓ ${esc_(res.data.code)}</span>`;
  const rw = res.data.rewritten || 0;
  showToast_(`✓ ${name} → ${res.data.code}` + (rw ? `（学生ID ${rw}件を更新）` : ''));
  updateUniBadge_(loadGen_);
}

// ── 出展申込 ──────────────────────────────────────
let companyEntries_ = [];

async function loadCompanyEntries_() {
  if (!curEvent_) return;
  id_('entry-loading').style.display = '';
  id_('entry-summary').style.display  = 'none';
  id_('entry-section').style.display  = 'none';

  const res = await adminCall_('adminGetCompanyEntries', { event: curEvent_ });
  id_('entry-loading').style.display = 'none';

  if (!res.ok) { showToast_('出展申込の読み込みに失敗しました'); return; }

  companyEntries_ = res.data.entries || [];
  renderEntries_(companyEntries_);

  // ダッシュボードバッジ更新
  const badge = id_('badge-entry');
  if (badge) {
    const n = companyEntries_.length;
    badge.textContent = n + '件';
    badge.className   = 'nav-card-count ' + (n > 0 ? 'todo' : 'init');
  }
  // タブカウント更新
  const tabCount = id_('co-tab-entry-count');
  if (tabCount) tabCount.textContent = companyEntries_.length ? ' (' + companyEntries_.length + ')' : '';
}

function renderEntries_(entries) {
  const sumN = k => entries.reduce((s, e) => s + (Number(e[k]) || 0), 0);

  id_('entry-summary').style.display = entries.length ? '' : 'none';
  id_('entry-section').style.display = '';
  setText_('entry-list-count', entries.length + '件');

  if (entries.length) {
    setText_('es-total', entries.length);
    setText_('es-booth', entries.filter(e => e['ブース区画'] === 'あり').length);
    setText_('es-car',   sumN('展示車両数'));
    setText_('es-demo',  entries.filter(e => e['デモ走行'] === 'あり').length);
    setText_('es-ppass', sumN('人パス'));
    setText_('es-cpass', sumN('車両パス'));
    setText_('es-lsat',  sumN('昼食土'));
    setText_('es-lsun',  sumN('昼食日'));
  }

  const list = id_('entry-card-list');
  if (!list) return;

  if (!entries.length) {
    list.innerHTML = '<p class="empty-msg">出展申込はまだありません</p>';
    return;
  }

  const demoChip = v => {
    if (v === 'あり') return '<span class="entry-chip demo-yes">デモあり</span>';
    if (v === '未定') return '<span class="entry-chip demo-maybe">デモ未定</span>';
    return '<span class="entry-chip demo-no">デモなし</span>';
  };

  const carChip = (n) => {
    const v = Number(n) || 0;
    return v > 0
      ? `<span class="entry-chip car-yes">展示 ${v}台</span>`
      : '<span class="entry-chip car-no">展示なし</span>';
  };

  list.innerHTML = entries.map((e, i) => {
    const boothClass = e['ブース区画'] === 'あり' ? 'entry-chip booth-yes' : 'entry-chip';
    const pp = Number(e['人パス']) || 0;
    const cp = Number(e['車両パス']) || 0;
    const ls = Number(e['昼食土']) || 0;
    const ll = Number(e['昼食日']) || 0;
    return `
      <div class="entry-card" data-idx="${i}">
        <div class="entry-card-top">
          <span class="entry-card-name">${esc_(e['社名略称'] || e['企業名正式'] || '—')}</span>
        </div>
        <div class="entry-card-contact">${esc_(e['担当者名'] || '—')} / ${esc_(e['電話番号'] || '—')}</div>
        <div class="entry-card-chips">
          <span class="${boothClass}">ブース: ${e['ブース区画'] || '—'}</span>
          ${carChip(e['展示車両数'])}
          ${demoChip(e['デモ走行'])}
          <span class="entry-chip${pp ? ' booth-yes' : ''}">人P:${pp}</span>
          <span class="entry-chip${cp ? ' booth-yes' : ''}">車P:${cp}</span>
          <span class="entry-chip lunch-sat">土食:${ls}</span>
          <span class="entry-chip lunch-sun">日食:${ll}</span>
        </div>
        <div class="entry-card-actions">
          <button class="entry-edit-btn" data-edit-idx="${i}">✏ 編集</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.entry-card').forEach(card => {
    card.addEventListener('click', () => showEntryDetail_(companyEntries_[+card.dataset.idx]));
  });
  list.querySelectorAll('.entry-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openEntryEdit_(+btn.dataset.editIdx); });
  });
}

let editEntryIdx_ = -1;
function openEntryEdit_(idx) {
  const e = companyEntries_[idx];
  if (!e) return;
  editEntryIdx_ = idx;
  id_('modal-entry-edit-title').textContent = (e['社名略称'] || e['企業名正式'] || '') + ' 編集';
  id_('edit-entry-cars').value  = Number(e['展示車両数']) || 0;
  id_('edit-entry-ppass').value = Number(e['人パス']) || 0;
  id_('edit-entry-cpass').value = Number(e['車両パス']) || 0;
  id_('edit-entry-lsat').value  = Number(e['昼食土']) || 0;
  id_('edit-entry-lsun').value  = Number(e['昼食日']) || 0;
  id_('edit-entry-demo').value  = e['デモ走行'] || 'なし';
  id_('save-entry-edit-fb').textContent = '';
  id_('modal-entry-edit').style.display = 'flex';
}

async function saveEntryEdit_() {
  if (editEntryIdx_ < 0) return;
  const e = companyEntries_[editEntryIdx_];
  const fb = id_('save-entry-edit-fb');
  fb.textContent = '保存中…';
  const res = await adminCall_('adminUpdateEntry', {
    event: curEvent_,
    company: e['企業名正式'] || e['社名略称'],
    updates: {
      展示車両数: Number(id_('edit-entry-cars').value) || 0,
      人パス:     Number(id_('edit-entry-ppass').value) || 0,
      車両パス:   Number(id_('edit-entry-cpass').value) || 0,
      昼食土:     Number(id_('edit-entry-lsat').value) || 0,
      昼食日:     Number(id_('edit-entry-lsun').value) || 0,
      デモ走行:   id_('edit-entry-demo').value,
    },
  });
  if (res.ok) {
    fb.textContent = '✓ 保存しました';
    id_('modal-entry-edit').style.display = 'none';
    loadCompanyEntries_();
  } else {
    fb.textContent = '✗ ' + (res.error || '保存失敗');
  }
}

function showEntryDetail_(e) {
  const drow = (lbl, val, copyVal) => {
    if (val === undefined || val === null || val === '') return '';
    const copy = copyVal ? ` <button class="detail-copy" data-copy="${esc_(String(copyVal))}">コピー</button>` : '';
    return `<div class="detail-row"><span class="detail-lbl">${esc_(lbl)}</span><span class="detail-val">${esc_(String(val))}${copy}</span></div>`;
  };
  const grp = (title, rows) => `<div class="detail-group"><div class="detail-group-title">${title}</div>${rows}</div>`;

  id_('modal-entry-title').textContent = (e['社名略称'] || e['企業名正式'] || '') + ' 申込詳細';
  id_('modal-entry-body').innerHTML = [
    grp('企業情報', [
      drow('正式名称', e['企業名正式']),
      drow('社名略称', e['社名略称']),
      drow('代表者名', e['代表者名']),
      drow('担当者名', e['担当者名']),
    ].join('')),
    grp('連絡先', [
      drow('代表電話', e['電話番号'], e['電話番号']),
      drow('担当者電話', e['担当者電話'], e['担当者電話']),
      drow('メール', e['メールアドレス'], e['メールアドレス']),
    ].join('')),
    grp('送付先住所', [
      drow('郵便番号', e['郵便番号']),
      drow('住所', (e['都道府県'] || '') + (e['住所'] || '')),
    ].join('')),
    grp('出展内容', [
      drow('出展内容', e['出展内容']),
      drow('ブース区画', e['ブース区画']),
      drow('展示車両数', (Number(e['展示車両数']) || 0) + '台'),
      drow('デモ走行', e['デモ走行']),
      drow('デモ走行詳細', e['デモ走行詳細']),
    ].join('')),
    grp('パス・昼食', [
      drow('人パス', (Number(e['人パス']) || 0) + '枚'),
      drow('車両パス', (Number(e['車両パス']) || 0) + '枚'),
      drow('昼食（土）', (Number(e['昼食土']) || 0) + '食'),
      drow('昼食（日）', (Number(e['昼食日']) || 0) + '食'),
      drow('備考', e['備考']),
    ].join('')),
    grp('申込情報', [
      drow('申込日時', e['申込日時']),
      drow('状態', e['状態']),
    ].join('')),
    e['変更履歴'] ? grp('変更履歴', `<div style="font-size:12px;color:var(--gray);white-space:pre-line;line-height:1.8">${esc_(e['変更履歴'])}</div>`) : '',
  ].join('');
  id_('modal-entry').style.display = '';
}

function downloadEntryCsv_() {
  if (!companyEntries_.length) { showToast_('申込データがありません'); return; }
  const cols = ['申込日時','社名略称','企業名正式','代表者名','担当者名','電話番号','担当者電話','メールアドレス','郵便番号','都道府県','住所','出展内容','ブース区画','展示車両数','デモ走行','デモ走行詳細','人パス','車両パス','昼食土','昼食日','備考','状態'];
  const header = cols.join(',');
  const rows   = companyEntries_.map(e => cols.map(c => '"' + String(e[c] ?? '').replace(/"/g, '""') + '"').join(','));
  const csv    = '﻿' + [header, ...rows].join('\r\n');
  const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a      = document.createElement('a');
  a.href       = URL.createObjectURL(blob);
  a.download   = '出展申込_' + curEvent_ + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ============================================================
// エントリーリスト / 受付リスト / 応援学生 / 出走順リスト
// ============================================================

// 属性 → クラスコード（PRE_CLASS_CODES と同じ）
const CATEGORY_TO_CLASS_ = {
  'Aドライバー': 'A', 'Bドライバー': 'B', 'Cドライバー': 'C',
  'ドライバー登録メカニック': 'A', // FGクラス扱い
  '女子クラスドライバー': 'W',
  '補欠ドライバー': 'S', 'メカニック': 'S', '応援学生': 'S',
  '一般参加学生': 'V',
};

let preRegAll_        = [];   // 事前登録全件
let schoolOrder_      = [];   // 大学の並び順（大学名の配列）
let womenPairings_    = [];   // 女子ペアリング [{ a: studentId, b: studentId }]
let entryListLoading_ = false;

async function loadEntryList_() {
  if (entryListLoading_) return;
  entryListLoading_ = true;
  const gen = ++loadGen_;
  bindListPageEvents_();

  const [preRes, cfgRes] = await Promise.all([
    adminCall_('adminGetPreRegistrations', { event: curEvent_ }),
    adminCall_('adminGetConfig',           { event: curEvent_ }),
  ]);
  entryListLoading_ = false;
  if (gen !== loadGen_) return;
  if (!preRes.ok) { showListErr_('entry-list-wrap', preRes); return; }

  preRegAll_ = preRegRowsToObjects_(preRes.data);
  const cfg  = (cfgRes.ok && cfgRes.data && cfgRes.data.config) ? cfgRes.data.config : {};

  schoolOrder_   = parseJsonOr_(cfg.schoolRunningOrder, []);
  womenPairings_ = parseJsonOr_(cfg.womenPairings, []);

  // 現存する大学（Aドライバーがいる大学）を抽出、保存済み順序＋新規大学を後ろに
  const menSchools = computeMenSchools_(preRegAll_);
  schoolOrder_ = [
    ...schoolOrder_.filter(s => menSchools.includes(s)),
    ...menSchools.filter(s => !schoolOrder_.includes(s)),
  ];

  // 女子ペアリング: 保存済みが女子ドライバーの範囲外なら削除
  const womenIds = new Set(preRegAll_
    .filter(r => classOf_(r) === 'W')
    .map(r => r.studentId));
  womenPairings_ = womenPairings_.map(p => ({
    a: womenIds.has(p.a) ? p.a : '',
    b: womenIds.has(p.b) ? p.b : '',
  }));

  renderSchoolOrder_();
  renderWomenPairs_();
  renderEntryList_();
}

async function loadReceptionList_() {
  const gen = ++loadGen_;
  bindListPageEvents_();

  const [preRes, cfgRes] = await Promise.all([
    adminCall_('adminGetPreRegistrations', { event: curEvent_ }),
    adminCall_('adminGetConfig',           { event: curEvent_ }),
  ]);
  if (gen !== loadGen_) return;
  if (!preRes.ok) { showListErr_('reception-list-wrap', preRes); return; }

  preRegAll_ = preRegRowsToObjects_(preRes.data);
  const cfg  = (cfgRes.ok && cfgRes.data && cfgRes.data.config) ? cfgRes.data.config : {};
  schoolOrder_   = parseJsonOr_(cfg.schoolRunningOrder, []);
  womenPairings_ = parseJsonOr_(cfg.womenPairings, []);
  const menSchools = computeMenSchools_(preRegAll_);
  schoolOrder_ = [
    ...schoolOrder_.filter(s => menSchools.includes(s)),
    ...menSchools.filter(s => !schoolOrder_.includes(s)),
  ];

  renderReceptionList_();
  renderSupportList_();
  renderOrderList_();
}

function bindListPageEvents_() {
  // 一度だけバインド
  if (bindListPageEvents_._done) return;
  bindListPageEvents_._done = true;
  document.querySelectorAll('#page-entry-list .tab-btn, #page-reception .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.closest('[id^="page-"]');
      page.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      page.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const t = id_('tab-' + btn.dataset.tab);
      if (t) t.classList.add('active');
    });
  });
  id_('btn-save-order')?.addEventListener('click', saveSchoolOrder_);
  id_('btn-add-women-pair')?.addEventListener('click', () => {
    womenPairings_.push({ a: '', b: '' });
    renderWomenPairs_();
  });
  id_('btn-entry-list-csv')?.addEventListener('click', () => downloadEntryListCsv_());
  id_('btn-entry-list-print')?.addEventListener('click', () => window.print());
  id_('btn-reception-csv')?.addEventListener('click', () => downloadReceptionCsv_());
  id_('btn-reception-print')?.addEventListener('click', () => window.print());
  id_('btn-support-csv')?.addEventListener('click', () => downloadSupportCsv_());
  id_('btn-support-print')?.addEventListener('click', () => window.print());
  id_('btn-order-csv')?.addEventListener('click', () => downloadOrderCsv_());
  id_('btn-order-print')?.addEventListener('click', () => window.print());
}

function parseJsonOr_(s, def) {
  try { const v = JSON.parse(s || ''); return v || def; } catch (e) { return def; }
}

// adminGetPreRegistrations は {headers, rows} で返る。オブジェクトに変換。
function preRegRowsToObjects_(d) {
  if (!d) return [];
  const H = d.headers || [];
  const R = d.rows || [];
  return R.map(row => {
    const o = { studentId: '', school: '', category: '' };
    H.forEach((h, i) => { o[h] = row[i]; });
    o.studentId = String(o.studentId || '');
    o.school    = String(o['大学名'] || '');
    o.category  = String(o['属性'] || o['参加区分'] || '');
    return o;
  }).filter(r => r.studentId);
}

function classOf_(r) {
  // studentId の 6文字目（0-indexed:5）に区分コードが埋め込まれている
  // (year1桁 + 大学コード4桁 + 区分1文字 + 連番2桁)
  const sid = String(r.studentId || '');
  if (sid.length >= 6) {
    const c = sid.charAt(5);
    if ('ABCWSV'.indexOf(c) >= 0) return c;
  }
  return 'V';
}

function computeMenSchools_(all) {
  // Aドライバーが登録されている大学のリスト（重複除去、大学マスター順を近似的に維持）
  const seen = new Set();
  const out = [];
  all.forEach(r => {
    if (classOf_(r) === 'A') {
      const s = String(r['大学名'] || r.school || '').trim();
      if (s && !seen.has(s)) { seen.add(s); out.push(s); }
    }
  });
  return out;
}

function showListErr_(wrapId, res) {
  const el = id_(wrapId);
  if (el) el.innerHTML = `<p style="color:var(--fg-error);font-size:12px;text-align:center;padding:16px 0">読み込みに失敗しました: ${esc_(res.error || res.message || 'unknown')}</p>`;
}

// ── 出走大学リスト（並び順編集） ────────────
function renderSchoolOrder_() {
  const wrap = id_('school-order-wrap');
  if (!wrap) return;
  if (!schoolOrder_.length) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--gray);text-align:center;padding:16px 0">Aドライバーの事前登録がまだありません</p>';
    return;
  }
  const total = schoolOrder_.length;
  wrap.innerHTML = schoolOrder_.map((s, i) => {
    const men = preRegAll_.filter(r =>
      String(r['大学名'] || '').trim() === s &&
      ['A', 'B', 'C'].includes(classOf_(r))).length;
    return `
      <div class="school-order-item">
        <span class="school-order-idx">${i + 1}</span>
        <span class="school-order-name">${esc_(s)}<span class="school-count-badge">${men}名</span></span>
        <button class="school-order-btn" data-move="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="school-order-btn" data-move="down" data-i="${i}" ${i === total - 1 ? 'disabled' : ''}>▼</button>
      </div>`;
  }).join('');
  wrap.querySelectorAll('.school-order-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.i;
      const j = btn.dataset.move === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= schoolOrder_.length) return;
      [schoolOrder_[i], schoolOrder_[j]] = [schoolOrder_[j], schoolOrder_[i]];
      renderSchoolOrder_();
    });
  });
}

// ── 女子ペアリング編集 ────────────
function renderWomenPairs_() {
  const wrap = id_('women-pairs-wrap');
  if (!wrap) return;
  const womenDrivers = preRegAll_
    .filter(r => classOf_(r) === 'W')
    .sort((a, b) => String(a['大学名'] || '').localeCompare(String(b['大学名'] || ''), 'ja'));

  if (!womenDrivers.length) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--gray);text-align:center;padding:8px 0">女子クラスドライバーの事前登録がまだありません</p>';
    return;
  }

  // ペアが空なら女子ドライバー数から自動生成（2名でペア）
  if (!womenPairings_.length) {
    for (let i = 0; i < womenDrivers.length; i += 2) {
      womenPairings_.push({
        a: womenDrivers[i] ? womenDrivers[i].studentId : '',
        b: womenDrivers[i + 1] ? womenDrivers[i + 1].studentId : '',
      });
    }
  }

  const opt = (sel) => {
    let html = '<option value="">選択</option>';
    womenDrivers.forEach(w => {
      const label = `${w['大学名'] || ''} / ${w['氏名'] || ''}`;
      const s = w.studentId === sel ? ' selected' : '';
      html += `<option value="${esc_(w.studentId)}"${s}>${esc_(label)}</option>`;
    });
    return html;
  };

  wrap.innerHTML =
    `<div class="women-pair-row header"><span></span><span>Aヒート</span><span>Bヒート</span><span></span></div>` +
    womenPairings_.map((p, i) => `
      <div class="women-pair-row">
        <span class="women-pair-label">ペア${i + 1}</span>
        <div class="women-pair-slot"><span class="heat-lbl">A</span><select data-pair="${i}" data-heat="a">${opt(p.a)}</select></div>
        <div class="women-pair-slot"><span class="heat-lbl">B</span><select data-pair="${i}" data-heat="b">${opt(p.b)}</select></div>
        <button class="women-pair-del" data-del="${i}" title="ペアを削除">×</button>
      </div>`).join('');

  wrap.querySelectorAll('select').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = +sel.dataset.pair;
      womenPairings_[i][sel.dataset.heat] = sel.value;
    });
  });
  wrap.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      womenPairings_.splice(+btn.dataset.del, 1);
      renderWomenPairs_();
    });
  });
}

async function saveSchoolOrder_() {
  const btn = id_('btn-save-order');
  const fb  = id_('save-order-fb');
  btn.disabled = true; fb.className = 'save-fb'; fb.textContent = '';

  const r1 = await adminCall_('adminUpdateConfig', {
    event: curEvent_, key: 'schoolRunningOrder', value: JSON.stringify(schoolOrder_),
  });
  const r2 = await adminCall_('adminUpdateConfig', {
    event: curEvent_, key: 'womenPairings', value: JSON.stringify(womenPairings_),
  });

  btn.disabled = false;
  if (r1.ok && r2.ok) {
    fb.textContent = '✓ 保存しました';
    fb.className = 'save-fb ok';
    renderEntryList_(); // 表示側も更新
  } else {
    fb.textContent = '保存に失敗しました';
    fb.className = 'save-fb err';
  }
}

// ── 走行順の計算 ────────────
// 男子A: 1..N / 女子A: N+1..N+M / 男子B: N+M+1..2N+M / 女子B: 2N+M+1..2N+2M / 男子C: 2N+2M+1..3N+2M
function computeRunningOrder_() {
  const N = schoolOrder_.length;
  const M = womenPairings_.length;
  const byId = {};  // studentId → 走行順
  const menBySchoolAndClass = new Map();

  preRegAll_.forEach(r => {
    const cls = classOf_(r);
    const school = String(r['大学名'] || '').trim();
    if (['A', 'B', 'C'].includes(cls)) {
      const key = school + '|' + cls;
      if (!menBySchoolAndClass.has(key)) menBySchoolAndClass.set(key, r);
    }
  });

  schoolOrder_.forEach((school, i) => {
    ['A', 'B', 'C'].forEach((cls, cIdx) => {
      const r = menBySchoolAndClass.get(school + '|' + cls);
      if (!r) return;
      let order = 0;
      if (cls === 'A') order = i + 1;
      else if (cls === 'B') order = N + M + i + 1;
      else order = 2 * N + 2 * M + i + 1;
      byId[r.studentId] = order;
    });
  });

  womenPairings_.forEach((p, i) => {
    if (p.a) byId[p.a] = N + i + 1;
    if (p.b) byId[p.b] = 2 * N + M + i + 1;
  });

  return byId;
}

// ── エントリーリスト表示 ────────────
function renderEntryList_() {
  const wrap = id_('entry-list-wrap');
  if (!wrap) return;
  const orders = computeRunningOrder_();
  const rows = buildEntryListRows_(orders);

  const men   = rows.filter(r => r.section === 'men');
  const women = rows.filter(r => r.section === 'women');

  const heat = cls => `<span class="cls-${cls}">${cls}</span>`;
  const row = r => `<tr>
    <td>${esc_(r.school)}</td>
    <td class="num">${r.order || ''}</td>
    <td class="center">${heat(r.cls)}</td>
    <td>${esc_(r.name)}</td>
    <td>${esc_(r.furigana)}</td>
    <td>${esc_(r.clubYears)}</td>
  </tr>`;

  const header = `<thead><tr>
    <th>大学名</th><th>走行順</th><th>ヒート</th>
    <th>選手名</th><th>よみがな</th><th>入部何年</th>
  </tr></thead>`;

  wrap.innerHTML = `
    <div class="list-section-title">Formula Gymkhana クラス</div>
    <div class="list-scroll"><table class="list-tbl">${header}<tbody>${men.map(row).join('')}</tbody></table></div>
    ${women.length ? `<div class="list-section-title">Formula Gymkhana 女子クラス</div>
      <div class="list-scroll"><table class="list-tbl">${header}<tbody>${women.map(row).join('')}</tbody></table></div>` : ''}
  `;
}

function buildEntryListRows_(orders) {
  const menBy = new Map();  // school → { A, B, C }
  const rows  = [];

  preRegAll_.forEach(r => {
    const cls = classOf_(r);
    const school = String(r['大学名'] || '').trim();
    if (['A', 'B', 'C'].includes(cls)) {
      if (!menBy.has(school)) menBy.set(school, {});
      menBy.get(school)[cls] = r;
    }
  });

  schoolOrder_.forEach(school => {
    const set = menBy.get(school) || {};
    ['A', 'B', 'C'].forEach(cls => {
      const r = set[cls];
      if (!r) return;
      rows.push({
        section: 'men',
        school, cls,
        order:     orders[r.studentId] || '',
        studentId: r.studentId,
        name:      r['氏名'] || '',
        furigana:  r['ふりがな'] || '',
        clubYears: r['自動車部在籍年数'] || '',
      });
    });
  });

  // 女子ペア
  womenPairings_.forEach(p => {
    ['a', 'b'].forEach(k => {
      if (!p[k]) return;
      const r = preRegAll_.find(x => x.studentId === p[k]);
      if (!r) return;
      rows.push({
        section: 'women',
        school:    String(r['大学名'] || '').trim(),
        cls:       k === 'a' ? 'A' : 'B',
        order:     orders[r.studentId] || '',
        studentId: r.studentId,
        name:      r['氏名'] || '',
        furigana:  r['ふりがな'] || '',
        clubYears: r['自動車部在籍年数'] || '',
      });
    });
  });

  return rows;
}

// ── 受付リスト表示 ────────────
function renderReceptionList_() {
  const wrap = id_('reception-list-wrap');
  if (!wrap) return;
  const orders = computeRunningOrder_();
  const rows = buildEntryListRows_(orders);

  const trs = rows.map(r => `<tr>
    <td>${esc_(r.school)}</td>
    <td class="center cls-${r.cls}">${r.cls}</td>
    <td>${esc_(r.name)}</td>
    <td>${esc_(r.furigana)}</td>
    <td class="center"></td><td class="center"></td>
    <td class="center"></td><td class="center"></td>
    <td></td>
    <td class="num">${esc_(r.studentId)}</td>
  </tr>`).join('');

  wrap.innerHTML = `
    <div class="list-scroll"><table class="list-tbl">
      <thead><tr>
        <th>大学名</th><th>ヒート</th><th>選手名</th><th>よみがな</th>
        <th>受付(土)</th><th>受付(日)</th><th>紹介カード</th><th>リストバンド</th>
        <th>必要書類</th><th>ID</th>
      </tr></thead>
      <tbody>${trs}</tbody>
    </table></div>`;
}

// ── 応援学生受付リスト表示 ────────────
function buildSupportRows_() {
  const rows = preRegAll_.filter(r => classOf_(r) === 'S');
  // 大学順にソート（schoolOrder_ に無い大学は末尾）
  const orderMap = new Map(schoolOrder_.map((s, i) => [s, i]));
  rows.sort((a, b) => {
    const sa = String(a['大学名'] || '').trim();
    const sb = String(b['大学名'] || '').trim();
    const ia = orderMap.has(sa) ? orderMap.get(sa) : 9999;
    const ib = orderMap.has(sb) ? orderMap.get(sb) : 9999;
    if (ia !== ib) return ia - ib;
    return String(a.studentId).localeCompare(String(b.studentId));
  });
  return rows.map(r => {
    const attr    = String(r['属性'] || '');
    const svcCls  = String(r['サービス作業クラス'] || '');
    const backup  = attr === '補欠ドライバー' ? svcCls : '';
    const mech    = attr === '応援学生' && svcCls && !svcCls.includes('実施しない') ? svcCls : '';
    const needDoc = attr === '応援学生' && svcCls && svcCls !== '' && !r['保険証明URL'] ? '※保険確認' : '';
    return {
      school:    String(r['大学名'] || '').trim(),
      name:      r['氏名'] || '',
      furigana:  r['ふりがな'] || '',
      studentId: r.studentId,
      backup, mech,
      lunchSat: r['弁当_土'] || '',
      lunchSun: r['弁当_日'] || '',
      needDoc,
    };
  });
}

function renderSupportList_() {
  const wrap = id_('support-list-wrap');
  if (!wrap) return;
  const rows = buildSupportRows_();
  if (!rows.length) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--gray);text-align:center;padding:16px 0">応援学生の事前登録がありません</p>';
    return;
  }
  const trs = rows.map(r => `<tr>
    <td>${esc_(r.school)}</td>
    <td>${esc_(r.name)}</td>
    <td>${esc_(r.furigana)}</td>
    <td class="center"></td>
    <td class="center">${esc_(r.backup)}</td>
    <td class="center">${esc_(r.mech)}</td>
    <td class="center">${esc_(r.lunchSat)}</td>
    <td class="center">${esc_(r.lunchSun)}</td>
    <td>${esc_(r.needDoc)}</td>
    <td class="num">${esc_(r.studentId)}</td>
  </tr>`).join('');
  wrap.innerHTML = `
    <div class="list-scroll"><table class="list-tbl">
      <thead><tr>
        <th>大学名</th><th>氏名</th><th>よみがな</th>
        <th>受付</th><th>補欠選手登録</th><th>メカニック登録</th>
        <th>土曜昼食</th><th>日曜昼食</th><th>必要書類</th><th>ID</th>
      </tr></thead>
      <tbody>${trs}</tbody>
    </table></div>`;
}

// ── 出走順リスト表示 ────────────
function renderOrderList_() {
  const wrap = id_('order-list-wrap');
  if (!wrap) return;
  const orders = computeRunningOrder_();
  const rows = buildEntryListRows_(orders)
    .filter(r => r.order)
    .sort((a, b) => a.order - b.order);

  const N = schoolOrder_.length;
  const M = womenPairings_.length;
  const heatA = rows.filter(r => r.order <= N + M);
  const heatB = rows.filter(r => r.order > N + M && r.order <= 2 * N + 2 * M);
  const heatC = rows.filter(r => r.order > 2 * N + 2 * M);

  const row = r => `<tr>
    <td>${esc_(r.school)}</td>
    <td class="num">${r.order}</td>
    <td class="center cls-${r.cls}">${r.cls}</td>
    <td>${esc_(r.name)}</td>
    <td>${esc_(r.furigana)}</td>
    <td>${esc_(r.clubYears)}</td>
  </tr>`;
  const header = `<thead><tr>
    <th>学校名</th><th>出走順</th><th>ヒート</th>
    <th>氏名</th><th>ふりがな</th><th>入部何年</th>
  </tr></thead>`;

  const tbl = (label, xs) => xs.length ? `
    <div class="list-section-title">${label}</div>
    <div class="list-scroll"><table class="list-tbl">${header}<tbody>${xs.map(row).join('')}</tbody></table></div>` : '';

  wrap.innerHTML = tbl('第1ヒート', heatA) + tbl('第2ヒート', heatB) + tbl('第3ヒート', heatC);
}

// ── CSV出力 ────────────
function toCsv_(headers, rows) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [headers.map(q).join(',')];
  rows.forEach(r => lines.push(r.map(q).join(',')));
  return '﻿' + lines.join('\r\n');
}
function downloadCsv_(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadEntryListCsv_() {
  const orders = computeRunningOrder_();
  const rows   = buildEntryListRows_(orders);
  const headers = ['大学名', '走行順', 'ヒート', '選手名', 'よみがな', '入部何年', 'クラス', 'studentId'];
  const data = rows.map(r => [
    r.school, r.order, r.cls, r.name, r.furigana, r.clubYears,
    r.section === 'men' ? 'Formula Gymkhana' : 'Formula Gymkhana 女子', r.studentId,
  ]);
  downloadCsv_(`エントリーリスト_${curEvent_}.csv`, toCsv_(headers, data));
}

function downloadReceptionCsv_() {
  const orders = computeRunningOrder_();
  const rows   = buildEntryListRows_(orders);
  const headers = ['大学名', 'ヒート', '選手名', 'よみがな',
    '受付(土曜日)', '受付(日曜日)', '紹介カード', 'リストバンド', '必要書類', 'ID'];
  const data = rows.map(r => [r.school, r.cls, r.name, r.furigana, '', '', '', '', '', r.studentId]);
  downloadCsv_(`受付リスト_${curEvent_}.csv`, toCsv_(headers, data));
}

function downloadSupportCsv_() {
  const rows = buildSupportRows_();
  const headers = ['大学名', '氏名', 'よみがな', '受付', '補欠選手登録', 'メカニック登録',
    '土曜昼食', '日曜昼食', '必要書類', 'ID'];
  const data = rows.map(r => [
    r.school, r.name, r.furigana, '', r.backup, r.mech, r.lunchSat, r.lunchSun, r.needDoc, r.studentId,
  ]);
  downloadCsv_(`応援学生受付リスト_${curEvent_}.csv`, toCsv_(headers, data));
}

function downloadOrderCsv_() {
  const orders = computeRunningOrder_();
  const rows = buildEntryListRows_(orders)
    .filter(r => r.order)
    .sort((a, b) => a.order - b.order);
  const headers = ['学校名', '出走順', 'ヒート', '氏名', 'ふりがな', '入部何年', 'studentId'];
  const data = rows.map(r => [r.school, r.order, r.cls, r.name, r.furigana, r.clubYears, r.studentId]);
  downloadCsv_(`出走順リスト_${curEvent_}.csv`, toCsv_(headers, data));
}
