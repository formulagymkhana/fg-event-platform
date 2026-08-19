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
  id_('btn-prereg-csv-hotel')?.addEventListener('click', downloadHotelListCsv_);
  id_('btn-student-qr-csv')?.addEventListener('click', downloadStudentQrCsv_);

  // 出展申込ページ
  id_('btn-entry-reload')?.addEventListener('click', loadCompanyEntries_);
  id_('btn-entry-csv')?.addEventListener('click', downloadEntryCsv_);
  id_('btn-entry-shipping-csv')?.addEventListener('click', downloadEntryShippingCsv_);

  // 大学管理ページ／出場大学
  id_('btn-school-shipping-csv')?.addEventListener('click', downloadSchoolShippingCsv_);
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

/**
 * イベント別グローバルキャッシュを全て破棄する。
 * イベント切替時に route_ から呼ぶ。ここに列挙し漏れると、そのデータだけ
 * 前イベントの内容が残って画面・CSVに紛れ込む。
 * listDataEvent_ は「preRegAll_/schoolOrder_/womenPairings_ がどのイベントのものか」を
 * 表す印で、空＝未ロード。走行順の保存はこれが一致するときだけ許可する
 * （空配列のまま保存して、保存済みの並び順を消してしまうのを防ぐ）。
 */
function resetEventCaches_() {
  studentData_    = [];
  schoolEntries_  = [];
  companyEntries_ = [];
  allSchoolNames_ = [];
  preRegAll_      = [];
  schoolOrder_    = [];
  womenPairings_  = [];
  listDataEvent_  = '';
  // preRegData_ は QRパス作成用CSV・宿泊希望リストCSV の供給源。
  // 破棄し忘れると、イベントを切り替えた後に前イベントの名簿でCSVが出る。
  preRegData_     = { headers: [], rows: [] };
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
  // ⚠ イベントが変わったら、イベント別のグローバルキャッシュを必ず捨てる。
  //   これらは「成功時に代入されるだけ」でクリアされないため、残したままにすると
  //   別イベントのページで前イベントのデータが表示・CSV出力される。
  //   （例: loadUniversities_ は studentData_ が非空なら再取得せず流用する）
  if (eventId !== curEvent_) resetEventCaches_();
  curEvent_ = eventId;
  updateNavLinks_();

  // ⚠ どのページへ遷移するときも必ず世代を進め、全ローダーへ gen と ev を渡す。
  //   以前はページによって進めたり進めなかったりしたため、世代ガードが効かない経路が残り、
  //   イベントAの読み込み中にBへ切り替えると、遅れて返ったAの応答がBの画面に描画された
  //   （例: A の学生管理 → B の企業管理 では loadGen_ が進まず、A の
  //   loadPreRegistrations_ の応答が preRegData_ を A の内容で埋め、
  //   その後 B のファイル名でQRパスCSVが出力されうる）。
  const gen = ++loadGen_;
  const ev  = curEvent_;

  if (section === 'companies') {
    showPage_('companies');
    activateCoTab_('register');
    populateImportSelect_();
    loadCompanies_(gen, ev);
  } else if (section === 'students') {
    showPage_('students');
    // ⚠ 以前は存在しない要素(stat-students)を参照して再取得をスキップしようとしていたが、
    //   常にundefinedになるため実質常に再取得していた。その上さらにloadGen_を2回進めて
    //   いたため、loadStats_の応答到達時には世代不一致で必ず結果が破棄され、
    //   学生管理へ直接遷移した場合に食券集計等が更新されない不具合があった。
    //   1つの世代番号を共有する、他ページと同じ形に統一する。
    loadStats_(gen, ev);
    loadStudents_(gen, ev);
    loadPreRegistrations_(gen, ev);
  } else if (section === 'forms') {
    showPage_('forms');
    loadConfig_(gen, ev);
    updateWalkInUrl_(); // 当日参加登録URLをフォーム管理ページに表示
    bindListPageEvents_();
  } else if (section === 'universities') {
    showPage_('universities');
    loadUniversities_(gen, ev);
  } else if (section === 'entries') {
    showPage_('companies');
    activateCoTab_('entries');
    updateEntryFormUrl_();
    loadCompanyEntries_(gen, ev);
  } else if (section === 'entry-list') {
    showPage_('entry-list');
    loadEntryList_(gen, ev);
  } else if (section === 'reception') {
    showPage_('reception');
    loadReceptionList_(gen, ev);
  } else {
    showPage_('dashboard');
    const evRow = allEvents_.find(e => e.eventId === ev);
    setText_('dash-ev-name', evRow ? (evRow.name || evRow.eventId) : ev);
    updateWalkInUrl_();
    loadEventInfo_(gen, ev);
    loadAll_(gen, ev);
  }
}

function showPage_(name) {
  ['events', 'dashboard', 'companies', 'students', 'forms', 'universities', 'entry-list', 'reception', 'settings'].forEach(p => {
    const el = id_('page-' + p);
    if (el) el.style.display = p === name ? '' : 'none';
  });
}

function activateCoTab_(tab) {
  document.querySelectorAll('.co-tab-bar').forEach(bar => {
    const btns = [...bar.querySelectorAll('.co-tab-btn')];
    bar.style.setProperty('--tab-count', btns.length);
    btns.forEach((b, i) => {
      const on = b.dataset.coTab === tab;
      b.classList.toggle('active', on);
      if (on) bar.style.setProperty('--tab-idx', i);
    });
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
  const el = id_('nav-entry-list-card');
  const rc = id_('nav-reception-card');
  const backCo        = id_('back-dash-co');
  const backSt        = id_('back-dash-st');
  const backFm        = id_('back-dash-form');
  const backUn        = id_('back-dash-uni');
  const backEntry     = id_('back-dash-entry');
  const backReception = id_('back-dash-reception');
  if (co) co.href = '#' + curEvent_ + '/companies';
  if (st) st.href = '#' + curEvent_ + '/students';
  if (fm) fm.href = '#' + curEvent_ + '/forms';
  if (un) un.href = '#' + curEvent_ + '/universities';
  if (el) el.href = '#' + curEvent_ + '/entry-list';
  if (rc) rc.href = '#' + curEvent_ + '/reception';
  if (backCo)        backCo.href        = '#' + curEvent_;
  if (backSt)        backSt.href        = '#' + curEvent_;
  if (backFm)        backFm.href        = '#' + curEvent_;
  if (backUn)        backUn.href        = '#' + curEvent_;
  if (backEntry)     backEntry.href     = '#' + curEvent_;
  if (backReception) backReception.href = '#' + curEvent_;
}

// ── Load all data ─────────────────────────────────
// gen/ev は route_ から渡す。再読み込みボタン等、単独で呼ぶ場合は省略して新しい世代を起こす。
async function loadAll_(gen = null, ev = null) {
  if (!curEvent_) return;
  if (gen === null) gen = ++loadGen_;
  ev = ev ?? curEvent_;
  loadStats_(gen, ev);
  loadStampLog_(gen, ev);
  loadPrizeLog_(gen, ev);
  loadConfig_(gen, ev);
  loadCompanies_(gen, ev);
  updateUniBadge_(gen);
}

// ── 事前登録一覧 ──────────────────────────────────
let preRegData_ = { headers: [], rows: [] };
async function loadPreRegistrations_(gen, ev) {
  const res = await adminCall_('adminGetPreRegistrations', { event: ev });
  if (gen !== loadGen_) return;
  if (!res.ok) return;
  preRegData_ = { headers: res.data.headers || [], rows: res.data.rows || [] };
  // ⚠ この関数は表示用ではなくデータ供給用。preRegData_ は
  //   downloadPreRegCsv_（QRパス作成用CSV）と downloadHotelListCsv_（宿泊希望リスト）が
  //   参照するため、呼び出しを削ると両CSVが「事前登録データがありません」になる。
  //   一覧表の描画（prereg-tbody）は 2026-06-17 の 049c3ba で admin.html から
  //   要素ごと消えており、描画コードだけが残っていたので 2026-08-17 に削除した。
}

// 参加区分の表示ラベル（QRパス用：Aドライバー / 女子クラスドライバー / 応援学生 等）
function passCategory_(category, driverClass) {
  if (category === '出場選手(FGクラスドライバー)')       return driverClass || 'Aドライバー';
  if (category === '出場選手(女子クラスドライバー)')     return '女子クラスドライバー';
  if (category === '補欠ドライバー')                     return '補欠ドライバー';
  if (category === '見学・応援学生(メカニック登録含む)') return '応援学生';
  return category || '';
}

// 実出場するドライバーか（FGクラス＋女子クラス）。
// ⚠ 補欠ドライバーは含めない。出場が確定していないため、参加大学一覧と同じく
//   応援・見学側で扱う（2026-08-10 変更）。
// ⚠ ここで比較しているのは事前登録シートの「参加区分」列（フォームの送信値そのもの）。
//   学生マスターの「属性」列（Aドライバー / 女子クラスドライバー / 応援学生 等、
//   preAttr_() が変換した後の値）とは別物なので取り違えないこと。
function isCompetingDriverCategory_(category) {
  return category === '出場選手(FGクラスドライバー)'
      || category === '出場選手(女子クラスドライバー)';
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

/**
 * 出走大学順のソートキーを作る。
 * 順序の正は CONFIG の schoolRunningOrder（エントリーリストで並べ替えて保存したもの）。
 *
 * ⚠ グローバルの schoolOrder_ を使わないこと。あれは loadEntryList_ /
 *   loadReceptionList_ でしか代入されないため、学生管理ページから直接CSVを出すと
 *   空配列のままになり「並べ替えたつもりで並んでいない」状態になる。
 *
 * @returns {{orderOf:(school:string)=>number, state:'ok'|'unset'|'failed'}}
 *   state は利用者への通知文の出し分けに使う。実際の並びと通知が食い違わないよう、
 *   「走行順で並んだ」と言えるのは state==='ok' のときだけにする。
 *     ok     … 走行順が1件以上あり、それに従って並べた
 *     unset  … configは取れたが走行順が未設定/壊れている → 実際は大学名順
 *     failed … configを取得できなかった → 実際は大学名順
 */
async function fetchSchoolOrderKey_() {
  const res = await adminGetConfigDeduped_(curEvent_);
  const cfg = (res && res.ok && res.data && res.data.config) ? res.data.config : null;
  if (!cfg) return { orderOf: () => Infinity, state: 'failed' };
  const order = parseJsonOr_(cfg.schoolRunningOrder, []);
  const map   = new Map((Array.isArray(order) ? order : []).map((s, i) => [String(s).trim(), i]));
  // 走行順に載っていない大学（女子のみ・見学のみ等）は末尾へ。同順位は大学名で揃える。
  return {
    orderOf: school => (map.has(school) ? map.get(school) : Infinity),
    state:   map.size ? 'ok' : 'unset',
  };
}

// studentId は「西暦1桁 + 大学コード4桁 + 区分1文字 + 連番2桁」で発番される
// （actionRegisterPreStudent_ / classOf_ と同じ規則）。大学コードは常にこの位置に
// 埋め込まれているため、大学マスターへ問い合わせなくても学生IDから直接取り出せる。
// ⚠ 未確定大学の仮コード（0001〜の連番）は読み仮名と無関係な採番順なので、
//   「大学コード順」は必ずしも五十音順にはならない。それは仕様どおり。
function schoolCodeFromStudentId_(studentId) {
  const s = String(studentId || '');
  return s.length >= 5 ? s.slice(1, 5) : null; // 取れない場合は末尾へ回す
}

// QRパス作成用CSV（A列から：学生ID/参加区分/氏名/ふりがな/トークン/QR用URL）
// kind: 'driver' | 'spectator' | 'all'
// 並び順は kind によって使い分ける:
//   driver             … 出走大学順（CONFIG の schoolRunningOrder）→ 大学名 → 学生ID
//   spectator / all    … 大学コード順（studentId 由来。全大学に必ず割り当てられており、
//                         女子のみ・見学のみの大学が走行順に載っていなくても抜け漏れない）
async function downloadPreRegCsv_(kind) {
  const { headers, rows } = preRegData_;
  if (!headers.length) { showToast_('事前登録データがありません'); return; }
  const c = n => headers.indexOf(n);
  const ci = {
    sid: c('studentId'), cat: c('参加区分'), dc: c('ドライバー登録区分'),
    name: c('氏名'), kana: c('ふりがな'), token: c('cardToken'),
    school: c('大学名'),
  };

  const filtered = rows.filter(r => {
    const cat = r[ci.cat] || '';
    // 補欠ドライバーは spectator 側に入る（isCompetingDriverCategory_ が false のため）
    if (kind === 'driver')    return isCompetingDriverCategory_(cat);
    if (kind === 'spectator') return !isCompetingDriverCategory_(cat);
    return true;
  });
  if (!filtered.length) { showToast_('該当する事前登録がありません'); return; }

  let orderState = 'ok';
  if (kind === 'driver') {
    const orderRes = await fetchSchoolOrderKey_();
    orderState = orderRes.state;
    const { orderOf } = orderRes;
    const schoolOf = r => String((ci.school >= 0 ? r[ci.school] : '') || '').trim();
    filtered.sort((a, b) => {
      const sa = schoolOf(a), sb = schoolOf(b);
      const ia = orderOf(sa), ib = orderOf(sb);
      if (ia !== ib) return ia - ib;                                        // 出走大学順
      if (sa !== sb) return sa.localeCompare(sb, 'ja-JP', { sensitivity: 'base' }); // 走行順外は大学名順
      return String(a[ci.sid] || '').localeCompare(String(b[ci.sid] || '')); // 同一大学内は学生ID順
    });
  } else {
    // 応援・見学・補欠 / 全員 は大学コード順。未確定コード欠落時のみ末尾へ。
    filtered.sort((a, b) => {
      const ca = schoolCodeFromStudentId_(a[ci.sid]);
      const cb = schoolCodeFromStudentId_(b[ci.sid]);
      if (ca !== cb) return (ca ?? '9999').localeCompare(cb ?? '9999');
      return String(a[ci.sid] || '').localeCompare(String(b[ci.sid] || '')); // 同一大学内は学生ID順
    });
  }

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

  const label = kind === 'driver' ? 'ドライバー' : kind === 'spectator' ? '応援見学・補欠' : '全員';
  const csv   = '﻿' + lines.join('\r\n'); // BOM付きでExcel文字化け回避
  const blob  = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url;
  a.download = `QRパス_${label}_${curEvent_}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  // 実際の並びと通知を食い違わせない（走行順で並べられなかったことを黙って握り潰さない）
  const toastMsg = kind === 'driver' ? {
    ok:     `✓ ${filtered.length}名を出走大学順で出力しました`,
    unset:  `△ ${filtered.length}名を大学名順で出力しました（走行順が未設定です。エントリーリストで並べ替えて保存すると出走順になります）`,
    failed: `△ ${filtered.length}名を大学名順で出力しました（走行順を取得できませんでした）`,
  }[orderState] : `✓ ${filtered.length}名を大学コード順で出力しました`;
  showToast_(toastMsg);
}

// 宿泊希望リストCSV（学生ID／大学名／氏名／性別）。宿泊希望=はい の学生のみ。
function downloadHotelListCsv_() {
  const { headers, rows } = preRegData_;
  if (!headers.length) { showToast_('事前登録データがありません'); return; }
  const c = n => headers.indexOf(n);
  const ci = { sid: c('studentId'), school: c('大学名'), name: c('氏名'), gender: c('性別'), hotel: c('宿泊希望') };

  const filtered = rows.filter(r => (r[ci.hotel] || '') === 'はい');
  if (!filtered.length) { showToast_('宿泊希望の学生がいません'); return; }

  const esc = v => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = ['学生ID', '大学名', '氏名', '性別'];
  const lines = [head.join(',')].concat(filtered.map(r => [
    r[ci.sid] || '', r[ci.school] || '', r[ci.name] || '', r[ci.gender] || '',
  ].map(esc).join(',')));

  const csv  = '﻿' + lines.join('\r\n'); // BOM付きでExcel文字化け回避
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `宿泊リスト_${curEvent_}_${new Date().toISOString().slice(0,10)}.csv`;
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
// loadWalkIns_ は削除した（2026-08-17）。描画先の walkin-tbody は 2026-06-16 の
// 学生管理統合（cc173df）で admin.html から消えており、ガードも無いため
// イベント読み込みのたびに adminGetWalkIns を叩いた上で TypeError になっていた。
// 当日登録の件数（walkin-count）は loadStudents_ が studentData_ から算出しており、
// この関数が無くても表示は維持される。

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
  const res = await adminGetConfigDeduped_(ev);
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
  setVal_('cfg-schoolEntryFormOpenAt',  toDtLocal_(cfg.schoolEntryFormOpenAt));
  setVal_('cfg-schoolEntryDeadline',    toDtLocal_(cfg.schoolEntryDeadline));
  setVal_('cfg-docUrlRulebook',         cfg.docUrlRulebook          || '');
  setVal_('cfg-docUrlPledge',           cfg.docUrlPledge            || '');
  setVal_('cfg-schoolEntryApprovalUrl', cfg.schoolEntryApprovalUrl  || '');
  setVal_('cfg-schoolEntryMailSubject',       cfg.schoolEntryMailSubject       || SCHOOL_ENTRY_MAIL_SUBJECT_DEFAULT);
  setVal_('cfg-schoolEntryMailSubjectUpdate', cfg.schoolEntryMailSubjectUpdate || SCHOOL_ENTRY_MAIL_SUBJECT_UPDATE_DEFAULT);
  setVal_('cfg-schoolEntryMailBody',          cfg.schoolEntryMailBody          || SCHOOL_ENTRY_MAIL_BODY_DEFAULT);
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

// 出場校エントリー 確認メールの既定文面（GAS sendSchoolEntryConfirmMail_ のフォールバックと一致させる）
const SCHOOL_ENTRY_MAIL_SUBJECT_DEFAULT        = '【{eventName}】出場校エントリーを受け付けました';
const SCHOOL_ENTRY_MAIL_SUBJECT_UPDATE_DEFAULT = '【{eventName}】出場校エントリーの更新を受け付けました';
const SCHOOL_ENTRY_MAIL_BODY_DEFAULT =
  '{repName} 様\n\n' +
  '{eventName} の出場校エントリー（{school}）を受け付けました。\n\n' +
  '{updateNote}' +
  '入場パスは後日発送いたします。\n\n' +
  '── FORMULA GYMKHANA 事務局';

async function saveConfig_(btnId, fbId) {
  if (!curEvent_) return;
  // ⚠ 宛先イベントは保存開始時に固定する。約20キーを1件ずつ逐次保存するため完了まで
  //   数十秒かかりえて、その間にイベントを切り替えられるとグローバルの curEvent_ が
  //   変わり、残りのキーが別イベントへ書き込まれる（設定が2イベントに分割保存される）。
  const ev  = curEvent_;
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
    docUrlRulebook:        getVal_('cfg-docUrlRulebook'),
    docUrlPledge:          getVal_('cfg-docUrlPledge'),
    schoolEntryApprovalUrl: getVal_('cfg-schoolEntryApprovalUrl'),
    schoolEntryMailSubject:       getVal_('cfg-schoolEntryMailSubject'),
    schoolEntryMailSubjectUpdate: getVal_('cfg-schoolEntryMailSubjectUpdate'),
    schoolEntryMailBody:          getVal_('cfg-schoolEntryMailBody'),
  };

  let failed = false;
  for (const [key, value] of Object.entries(map)) {
    const r = await adminCall_('adminUpdateConfig', { event: ev, key, value });
    if (!r.ok) { failed = true; break; }
  }

  btn.disabled = false;
  // 保存中にイベントを切り替えられていた場合、画面は別イベントを表示している。
  // どのイベントに保存したのかを明示しないと、切替先へ保存できたと誤認される。
  const moved = ev !== curEvent_;
  fb.textContent = failed ? '⚠ 保存失敗' : (moved ? `✓ 保存しました（${ev}）` : '✓ 保存しました');
  fb.className   = 'save-fb ' + (failed ? 'err' : 'ok');
  if (moved && !failed) showToast_(`✓ ${ev} の設定を保存しました（表示中のイベントとは異なります）`);
  setTimeout(() => { fb.className = 'save-fb'; }, 3000);
}

// ── Companies ─────────────────────────────────────

/** 企業NFCタグ用URL: stamp.html?ct=<stampKey>（会期中は当日自動判定でイベント解決） */
function nfcUrl_(stampKey) {
  return new URL(`stamp.html?ct=${encodeURIComponent(stampKey)}`, location.href).toString();
}

/**
 * CSV文字列をBOM付きでダウンロードする唯一のヘルパー。
 *
 * ⚠ 引数順は (ファイル名, 本文)。本文にBOMを含めないこと（この関数が付与する）。
 *   2026-08-10 まで本ファイル内に同名の関数が2つあり（こちらが `(body, filename)`、
 *   CSV出力セクション側が `(filename, csv)` と引数順が逆）、関数宣言の巻き上げで
 *   後者が前者を上書きしていた。その結果、学生QR / 企業NFC / 企業再閲覧QR の
 *   3つのCSVは「ファイル名がCSV本文、中身がファイル名」という状態で出力され、
 *   BOMも失われていた。定義をこの1つに統合したので、増やさないこと。
 */
/**
 * Shift_JIS(CP932) エンコーダ。
 * 運送会社の送り状発行システムは Shift_JIS の CSV しか受け付けないものが多く、
 * UTF-8 のまま渡すと「読み込めません」あるいは取込後に文字化けする
 * （2026-08-17、西濃運輸の企業パス発送CSVで実際に発生）。
 *
 * ⚠ ブラウザ標準の TextEncoder は UTF-8 専用で、Shift_JIS への変換はできない。
 *   一方 TextDecoder は 'shift_jis' に対応しているので、**全バイト組み合わせを一度
 *   デコードして逆引き表を作る**ことで、外部ライブラリなしにエンコードを実現する。
 *   このリポジトリはビルド無し・依存は手動ベンダリングのため、表を持つより軽い。
 *   表は初回呼び出し時に一度だけ構築してキャッシュする（約9,400文字）。
 */
let sjisMap_ = null;
function buildSjisMap_() {
  if (sjisMap_) return sjisMap_;
  const dec = new TextDecoder('shift_jis');
  const map = new Map();
  // 1バイト: ASCII と半角カナ
  for (let b = 0x20; b <= 0x7E; b++) map.set(String.fromCharCode(b), [b]);
  for (let b = 0xA1; b <= 0xDF; b++) {
    const ch = dec.decode(new Uint8Array([b]));
    if (ch && ch !== '\uFFFD') map.set(ch, [b]);
  }
  // 2バイト: リード 0x81-0x9F / 0xE0-0xFC、トレイル 0x40-0x7E / 0x80-0xFC
  const trails = [];
  for (let t = 0x40; t <= 0x7E; t++) trails.push(t);
  for (let t = 0x80; t <= 0xFC; t++) trails.push(t);
  const leads = [];
  for (let l = 0x81; l <= 0x9F; l++) leads.push(l);
  for (let l = 0xE0; l <= 0xFC; l++) leads.push(l);
  for (const lead of leads) {
    const buf = new Uint8Array(trails.length * 2);
    trails.forEach((t, i) => { buf[i * 2] = lead; buf[i * 2 + 1] = t; });
    const chars = [...dec.decode(buf)];
    if (chars.length === trails.length) {
      chars.forEach((ch, i) => {
        if (ch !== '\uFFFD' && !map.has(ch)) map.set(ch, [lead, trails[i]]);
      });
    } else {
      // 1ペア=1文字にならなかった場合のみ、1ペアずつ確認する（保険）
      trails.forEach(t => {
        const ch = dec.decode(new Uint8Array([lead, t]));
        if (ch && ch !== '\uFFFD' && [...ch].length === 1 && !map.has(ch)) map.set(ch, [lead, t]);
      });
    }
  }
  // Mac と Windows で割れやすい記号を、Shift_JIS 側の対応字へ寄せる
  // （波ダッシュ U+301C ↔ 全角チルダ U+FF5E など。放置すると '?' になる）
  const alias = { '\u301C': '\uFF5E', '\u2212': '\uFF0D', '\u2016': '\u2225',
                  '\u00A2': '\uFFE0', '\u00A3': '\uFFE1', '\u00AC': '\uFFE2' };
  for (const from of Object.keys(alias)) {
    const to = alias[from];
    if (!map.has(from) && map.has(to)) map.set(from, map.get(to));
  }
  sjisMap_ = map;
  return map;
}

/** 文字列を Shift_JIS バイト列へ。変換できない文字は '?' にし、一覧を返す。 */
function encodeSjis_(text) {
  const map = buildSjisMap_();
  const out = [];
  const bad = new Set();
  for (const ch of String(text)) {
    if (ch === '\n') { out.push(0x0A); continue; }
    if (ch === '\r') { out.push(0x0D); continue; }
    const b = map.get(ch);
    if (b) out.push(...b);
    else { bad.add(ch); out.push(0x3F); }
  }
  return { bytes: new Uint8Array(out), unsupported: [...bad] };
}

/**
 * Shift_JIS の CSV としてダウンロードする（BOMは付けない）。
 * 変換できない文字があれば呼び出し元へ返し、警告に使わせる。
 */
function downloadCsvSjis_(filename, body) {
  const { bytes, unsupported } = encodeSjis_(body);
  const blob = new Blob([bytes], { type: 'text/csv;charset=shift_jis;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  return unsupported;
}

function downloadCsv_(filename, body) {
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
  downloadCsv_(`学生QR_URL_${curEvent_}_${new Date().toISOString().slice(0,10)}.csv`, lines.join('\r\n'));
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
  downloadCsv_(`企業NFC_URL_${curEvent_}_${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\r\n'));
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
  downloadCsv_(`企業再閲覧QR_URL_${curEvent_}_${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\r\n'));
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
/**
 * 企業の学生一覧 閲覧URL（QR・ラミネート配布用）。
 * ⚠ イベントIDを付けない。ラミネート加工して毎年使い回す運用のため
 *   （2026-08-19 変更。従来は &event= を付けていたので毎回作り直しが必要だった）。
 *   どのイベントを見せるかは GAS の resolveCompanyViewEvent_ が
 *   「開始済みの最新イベント」として解決する。次のイベントが始まった日から
 *   自動的に切り替わるため、閲覧期限を手で調整する必要もない。
 *   NFC用URL（nfcUrl_）が元々イベントIDを持たないのと同じ理由・同じ扱い。
 */
function companyQrUrl_(viewKey) {
  return new URL(`company.html?viewkey=${encodeURIComponent(viewKey)}`, location.href).toString();
}
async function loadCompanies_(gen = null, ev = null) {
  // ⚠ 以前は gen 省略時に世代チェックを丸ごと飛ばしていた（gen !== null && …）。
  //   route_ から引数なしで呼ばれていたため、イベントAの応答がBの画面へ描画された。
  //   省略時は新しい世代を起こし、必ず照合する。
  if (gen === null) gen = ++loadGen_;
  ev = ev ?? curEvent_;
  updateWalkInUrl_();
  const res = await adminCall_('adminGetCompanies', { event: ev });
  if (gen !== loadGen_) return;
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
  // ⚠ 宛先イベントは開始時に固定。下の FileReader が await を挟むため、
  //   その間にイベントを切り替えられると別イベントの企業へアップロードされる。
  const ev        = curEvent_;
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
    event: ev, companyId,
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
  // 大学・属性を変えた場合は studentId が振り直される（名札QRは再発行不要＝そのまま使える）
  const renote = res.data.renumbered
    ? `\n学生IDを ${sid} → ${res.data.studentId} に振り直しました（名札QRはそのまま使えます）`
    : '';
  showToast_(`✓ 更新完了（学生マスター:${u.students} 事前登録:${u.preReg} スタンプログ:${u.stampLog} 景品:${u.prizeLog}）${renote}`);
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

async function loadEventInfo_(gen = null, eventId = null) {
  if (gen === null) gen = ++loadGen_;
  eventId = eventId ?? curEvent_;
  const ev = allEvents_.find(e => e.eventId === eventId);
  if (!ev) return;
  setVal_('edit-event-name', ev.name || '');
  const sel = id_('edit-event-status');
  if (sel) sel.value = (ev.status === '公開停止' || ev.status === '完了') ? '公開停止' : '公開中';

  // CONFIGからstampStartAt/stampEndAt/exchangeDeadlineを取得して datetime 入力を埋める
  const cfgRes = await adminGetConfigDeduped_(eventId);
  // ⚠ 世代照合が無いと、イベントAの設定がBの編集フォームに流し込まれ、
  //   そのまま保存するとAの日時がBへ書き込まれる（handleSaveEventInfo_ は
  //   宛先を curEvent_ = B に固定するため、値だけAという食い違いになる）。
  if (gen !== loadGen_) return;
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
  // ⚠ 宛先イベントは開始時に固定（saveConfig_ と同じ理由）。
  //   ここは adminUpdateEvent → adminUpdateConfig の2段で、後段が await 後に走るため
  //   publicDeadline だけ別イベントへ書かれうる。
  const ev = curEvent_;
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
  // EVENT_LIST には日付のみ渡す（getCurrentEvent の日付比較用）
  const startDate = startDatetime.slice(0, 10).replace(/-/g, '/');
  const endDate   = endDatetime.slice(0, 10).replace(/-/g, '/');

  // 日付を変更した結果、他の公開中イベントと期間が重ならないか確認する。
  // 「公開停止」に変更する場合は競合しなくなるので確認しない。
  if (status !== '公開停止') {
    if (!confirmOverlap_(findOverlappingEvents_(startDate, endDate, ev), '保存')) return;
  }

  btn.disabled = true; fb.className = 'save-fb'; fb.textContent = '';
  const res = await adminCall_('adminUpdateEvent', {
    eventId: ev,
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
    // ⚠ 公開期限の保存結果を必ず検査する。以前は結果を捨てていたため、
    //   ここだけ失敗しても「✓ 保存しました」と出て、画面表示と実データが食い違った。
    const pdRes = await adminCall_('adminUpdateConfig', { event: ev, key: 'publicDeadline', value: pdValue });
    const evRow = allEvents_.find(e => e.eventId === ev);
    if (evRow) { evRow.name = eventName; evRow.startDate = startDate; evRow.endDate = endDate; evRow.status = status; }
    // 表示中のイベントが変わっていたら、ダッシュボードの見出しを書き換えてはいけない
    // （別イベントの名前で上書きしてしまう）
    if (ev === curEvent_) setText_('dash-ev-name', eventName);
    const evNote = ev === curEvent_ ? '' : `（${ev}）`;
    if (!pdRes.ok) {
      // イベント情報自体は保存済み。公開期限だけが未保存であることを明示する
      fb.className = 'save-fb save-fb-err';
      fb.textContent = `⚠ 公開期限の保存に失敗しました${evNote}: ` + (pdRes.message || pdRes.error || '');
      return;
    }
    fb.className = 'save-fb save-fb-ok';
    fb.textContent = `✓ 保存しました${evNote}`;
    setTimeout(() => { fb.textContent = ''; }, 3000);
  } else {
    fb.className = 'save-fb save-fb-err'; fb.textContent = '⚠ 失敗: ' + (res.message || res.error || '');
  }
}

// ── Create Event ──────────────────────────────────
/**
 * 開催期間が重なる「公開中」イベントを探す（作成・更新時のガード）。
 *
 * ⚠ なぜ必要か: getCurrentEvent（GAS）は該当行を find＝最初の1件で取る。
 *   開催日が重なる公開中イベントが2つあると、シートで先の行（＝先に作った古い方）が
 *   黙って選ばれ、当日参加登録が意図しないイベントに入ったり、
 *   スタンプ取得が invalid_student_token で弾かれたりする。
 *   GAS 側は eventId の重複しか見ていないため、ここで人間に確認させる。
 *
 * @param {string} startStr 'YYYY-MM-DD' または 'YYYY/MM/DD'
 * @param {string} endStr   同上
 * @param {string} excludeId 判定から除外するeventId（更新時は自分自身）
 * @returns {Array} 重なっているイベントの配列
 */
function findOverlappingEvents_(startStr, endStr, excludeId) {
  const toDay = v => {
    if (!v) return null;
    const d = new Date(String(v).replace(/-/g, '/'));
    if (isNaN(d)) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const s = toDay(startStr), e = toDay(endStr);
  if (!s || !e) return [];
  return allEvents_.filter(ev => {
    if (excludeId && String(ev.eventId) === String(excludeId)) return false;
    // 公開停止・完了は getCurrentEvent の対象外なので競合しない
    if (ev.status === '公開停止' || ev.status === '完了') return false;
    const es = toDay(ev.startDate), ee = toDay(ev.endDate);
    if (!es || !ee) return false;
    return s <= ee && es <= e;   // 期間が1日でも重なるか
  });
}

/** 重複が見つかったときの確認ダイアログ。続行するなら true。 */
function confirmOverlap_(overlaps, actionLabel) {
  if (!overlaps.length) return true;
  const list = overlaps
    .map(ev => `・${ev.name || ev.eventId}（${ev.eventId}） ${fmtD_(ev.startDate)}〜${fmtD_(ev.endDate)}`)
    .join('\n');
  return window.confirm(
    `開催期間が重なる「公開中」のイベントがあります。\n\n${list}\n\n` +
    '期間が重なっていると、当日参加登録やスタンプ取得で\n' +
    '**どちらのイベントが使われるかが日付だけでは決まりません**。\n' +
    '（先に作成した方が優先され、もう一方は使えなくなります）\n\n' +
    '意図した重複でなければ、日付を修正するか、\n' +
    '使わない方のイベントを「公開停止」にしてください。\n\n' +
    `このまま${actionLabel}しますか？`
  );
}

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
  // 開催日が重なる公開中イベントがあれば確認する（GAS側はeventIdの重複しか見ていない）
  if (!confirmOverlap_(findOverlappingEvents_(startDate, endDate, null), '作成')) return;

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

// adminGetConfig専用の重複排除。ダッシュボード表示時、loadEventInfo_とloadAll_(→loadConfig_)が
// ほぼ同時に同じイベントのCONFIGを取得しているため、直近の通信を短時間だけ使い回す。
// 呼び出し側の処理内容・世代管理(loadGen_)には一切手を入れず、通信そのものだけを共有する。
let _configCall_ = null; // { event, promise, ts }
function adminGetConfigDeduped_(event) {
  const now = Date.now();
  if (_configCall_ && _configCall_.event === event && (now - _configCall_.ts) < 2000) {
    return _configCall_.promise;
  }
  const promise = adminCall_('adminGetConfig', { event });
  _configCall_ = { event, promise, ts: now };
  return promise;
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
function loadUniversities_(gen = null, ev = null) {
  if (gen === null) gen = ++loadGen_;
  ev = ev ?? curEvent_;
  // 参加大学一覧（学生集計）
  (async () => {
    const res = studentData_.length
      ? { ok: true, data: { students: studentData_ } }
      : await adminCall_('adminGetStudents', { event: ev });
    if (gen !== loadGen_) return;
    renderUniList_(res);
  })();
  // 承認待ち（統合先の選択肢に使うため、大学マスターの全名称も併せて取得）
  // ⚠ 大学名一覧は FG_API.getSchoolList() ではなく adminCall_ で取ること。
  //   admin.html は js/api.js を読み込んでいない唯一のページのため、FG_API を
  //   参照すると ReferenceError で IIFE ごと落ち、renderUniPending_ に到達せず
  //   「読み込み中...」のまま固まる（2026-08-10 に発覚）。
  (async () => {
    try {
      const [res, listRes] = await Promise.all([
        adminCall_('adminGetPendingUniversities', { event: ev }),
        adminCall_('getSchoolList', {}),
      ]);
      if (gen !== loadGen_) return;
      // ⚠ 大学マスター一覧の取得失敗を「統合先が0件」と同じ扱いにしてはいけない。
      //   統合先プルダウンが空になり、スタッフが「統合できる既存大学は無い」と誤認して
      //   表記ゆれの大学を新規確定してしまう（＝学生IDが全シートで書き換わる）。
      //   成否を renderUniPending_ に渡し、失敗時は操作UIごと出さない。
      const listOk = !!(listRes && listRes.ok && listRes.data);
      allSchoolNames_ = listOk ? (listRes.data.schools || []) : [];
      renderUniPending_(res, listOk);
    } catch (e) {
      if (gen !== loadGen_) return;
      const wrap = id_('uni-pending-wrap');
      if (wrap) wrap.innerHTML = '<p style="font-size:12px;color:var(--fg-warning);text-align:center;padding:16px 0">読み込みに失敗しました</p>';
      setText_('uni-pending-count', '');
    }
  })();
  // 出場大学（出場校エントリー提出済み）
  (async () => {
    const res = await adminCall_('adminGetSchoolEntries', { event: ev });
    if (gen !== loadGen_) return;
    renderSchoolEntries_(res);
  })();
}

let schoolEntries_  = [];
let allSchoolNames_ = [];   // 大学マスターの全大学名（統合先プルダウン用）

function renderSchoolEntries_(res) {
  const wrap = id_('school-entries-wrap');
  const cnt  = id_('school-entries-count');
  if (!wrap) return;
  if (!res.ok) {
    // 取得失敗時に前回の内容を残すと、画面はエラーなのに発送CSVだけ
    // 前イベント（または古い取得結果）の内容が出力される
    schoolEntries_ = [];
    if (cnt) cnt.textContent = '';
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

/**
 * 出場校（大学）向けパス発送CSV（ゆうパック・手作業印刷用）。
 * ⚠ 印刷ツール未確定（2026-08-10 時点）のため、特定サービスの取込フォーマットには
 *   合わせていない。汎用的な列名にしてあり、ツールが決まったら列名・列順を
 *   合わせ直すこと（downloadEntryShippingCsv_ の西濃運輸雛形と同じ位置づけ）。
 * ⚠ 出場校エントリーは学校名で重複判定し上書きする設計（CLAUDE.md §4）だが、
 *   **通常の提出経路で重複しないだけで、重複行は発生しうる。**
 *   大学統合（GAS reconcileSchoolEntry_）は、統合元・統合先の両方が提出済みの場合に
 *   どちらを残すかを自動判定せず、意図的に重複行を残してスタッフの手動判断に委ねる。
 *   統合直後にトーストで警告は出るが、放置されたまま出力すると同一校へ二重発送になる。
 *   企業版（findShippingIssues_）と同じく重複も検出し、警告に含める。
 * ⚠ 発送先の必須4項目（発送先_名義/郵便番号/住所/電話）は
 *   actionRegisterSchoolEntry_ 側で申込時に必須検証済みのため、通常の提出経路では
 *   欠損しない。欠損しうるのはシートの手編集のみ（downloadEntryShippingCsv_ と同じ理由）。
 */
function downloadSchoolShippingCsv_() {
  if (!schoolEntries_.length) { showToast_('出場校エントリーがありません'); return; }

  const required = ['発送先_名義', '発送先_郵便番号', '発送先_住所', '発送先_電話'];
  const issues = [];
  const norm = v => String(v || '').trim().replace(/\s+/g, ' ');
  const seenSchool = new Set();
  schoolEntries_.forEach(e => {
    const label = norm(e['学校名']) || '(学校名なし)';
    const missing = required.filter(k => !norm(e[k]));
    if (missing.length) issues.push(`【欠損】${label}: ${missing.join(' / ')}`);
    // 大学統合で生じた重複行の検出（二重発送の防止）
    const key = norm(e['学校名']);
    if (key) {
      if (seenSchool.has(key)) issues.push(`【重複】学校名「${key}」が複数行あります（大学統合後の未整理の可能性）`);
      else seenSchool.add(key);
    }
  });
  if (issues.length) {
    const shown = issues.slice(0, 10).join('\n');
    const more  = issues.length > 10 ? `\n…他 ${issues.length - 10}件` : '';
    const proceed = window.confirm(
      `発送先データに問題が見つかりました（${issues.length}件 / 全${schoolEntries_.length}校）。\n\n` +
      `${shown}${more}\n\n` +
      '【欠損】は発送先の項目が空のまま出力されます（取込エラー・誤配送の原因）。\n' +
      '【重複】はそのまま出力すると同一校へ二重発送になります。\n' +
      'シート上で修正してから出力し直すことを推奨します。\n\n' +
      'このまま出力しますか？'
    );
    if (!proceed) { showToast_('出力を中止しました'); return; }
  }

  const cols = ['学校名', '郵便番号', '住所', '宛名', '電話番号', '内容品'];
  const rows = schoolEntries_.map(e => {
    const name = String(e['発送先_名義'] || '').trim();
    return [
      e['学校名'] || '',
      e['発送先_郵便番号'] || '',
      e['発送先_住所'] || '',
      name ? name + '様' : '',
      e['発送先_電話'] || '',
      'FGパス類',
    ];
  });
  downloadCsv_('出場校パス発送_' + curEvent_ + '.csv', toCsv_(cols, rows));
  showToast_(issues.length
    ? `△ ${schoolEntries_.length}校を出力しました（未解決の問題 ${issues.length}件）`
    : `✓ ${schoolEntries_.length}校の発送先を出力しました`);
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
    // ⚠ s.category は adminGetStudents が返す STUDENTS シートの「属性」列であり、
    //   フォームの「参加区分」ではない。GAS の preAttr_() が変換した後の値が入る。
    //   実際に入りうる値:
    //     Aドライバー / Bドライバー / Cドライバー … 出場選手(FGクラス)。driverClass がそのまま入る
    //     女子クラスドライバー                  … 出場選手(女子クラス)
    //     補欠ドライバー
    //     メカニック / 応援学生                 … 見学・応援学生
    //     一般参加学生                          … 当日登録
    //   register-pre.html の radio 値（出場選手(FGクラスドライバー) 等）と混同しないこと。
    //
    // ドライバー列は実出場者（A/B/Cドライバー＋女子クラスドライバー）のみを数え、
    // 補欠ドライバーは出場が確定していないため見学/応援側で数える（2026-08-10 変更）。
    // 補欠を先に判定してから includes('ドライバー') に落とすことで、
    // 将来ドライバー系の属性が増えても自動的にドライバー列へ入る。
    const cat = String(s.category || '');
    if (cat === '補欠ドライバー') r.spectator++;
    else if (cat.includes('ドライバー')) r.driver++;
    else if (s.regType === '当日') r.walkin++;
    else r.spectator++; // メカニック・応援学生 とその他事前 → 見学枠でまとめる
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
        <th style="text-align:right">見学/応援・補欠</th>
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

/**
 * 承認待ち一覧をレンダリング。
 * @param {object}  res          adminGetPendingUniversities の応答
 * @param {boolean} schoolListOk 大学マスター一覧(getSchoolList)を取得できたか。
 *   false のときは統合先を判断できないため、確定・統合の操作UIを一切出さない。
 */
function renderUniPending_(res, schoolListOk) {
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
  // 大学マスターを取得できていないなら、統合先の候補を出せない＝正しい判断ができない。
  // 空のプルダウンを見せて「統合先なし」と誤認させるより、操作させないほうが安全。
  if (!schoolListOk) {
    wrap.innerHTML =
      '<p style="font-size:12px;color:var(--fg-warning);text-align:center;padding:16px 0;line-height:1.7">' +
      `承認待ちが ${list.length}件 ありますが、大学マスターの一覧を取得できませんでした。<br>` +
      '<strong>統合先を判断できないため、確定・統合の操作を停止しています。</strong><br>' +
      'ページを再読み込みしてください。改善しない場合は通信状況をご確認ください。</p>';
    return;
  }
  // 統合先の候補＝大学マスターのうち、承認待ちでない（＝確定済みの）大学のみ
  const pendingNames = new Set(list.map(u => u.name));
  const mergeTargets = allSchoolNames_.filter(n => !pendingNames.has(n));

  // resuming: コードは確定済みだが学生ID反映のスイープが未完了の大学。
  // 読み仮名入力は不要（コードは既に確定済み）、統合UIも出さない
  // （統合機能は確定済みソースをsource_already_confirmedで拒否するため、
  //   ここで無効化しておかないと実行段階で必ず失敗するUIになってしまう）。
  wrap.innerHTML = list.map(u => {
    const resuming = !!u.resuming;
    const tagText  = resuming ? `確定 ${esc_(u.code)}（反映中）` : `仮 ${esc_(u.code)}`;
    const ctrl = resuming
      ? `<div class="uni-ctrl">
           <button class="sm-btn uni-confirm">続きを実行</button>
         </div>`
      : `<div class="uni-ctrl">
           <input class="uni-reading" maxlength="2" placeholder="読み" autocomplete="off">
           <span class="uni-prev">—</span>
           <button class="sm-btn uni-confirm">確定</button>
         </div>`;
    // 統合先が0件の場合は空のプルダウンを出さない。
    // 「選べない」のか「候補が無い」のかを文言で明示する。
    const merge = resuming ? '' : (mergeTargets.length ? `
      <div class="uni-merge">
        <span class="uni-merge-lbl">既存の大学に統合</span>
        <select class="uni-merge-sel">
          <option value="">統合先を選択</option>
          ${mergeTargets.map(n => `<option value="${esc_(n)}">${esc_(n)}</option>`).join('')}
        </select>
        <button class="sm-btn uni-merge-btn">統合</button>
      </div>` : `
      <div class="uni-merge">
        <span class="uni-merge-lbl" style="color:var(--gray)">統合先にできる確定済みの大学がまだありません</span>
      </div>`);
    return `
    <div class="uni-row" data-name="${esc_(u.name)}" data-resuming="${resuming}">
      <div class="uni-name">${esc_(u.name)}<span class="uni-tmp">${tagText}</span></div>
      ${ctrl}${merge}
    </div>`;
  }).join('');
  wrap.querySelectorAll('.uni-row').forEach(row => {
    const inp  = row.querySelector('.uni-reading');
    const prev = row.querySelector('.uni-prev');
    if (inp && prev) {
      inp.addEventListener('input', () => {
        const p = pokebellPrefix_(inp.value);
        prev.textContent = p ? `${p}xx` : '—';
      });
    }
    row.querySelector('.uni-confirm').addEventListener('click', () => confirmUniversity_(row));
    const mergeBtn = row.querySelector('.uni-merge-btn');
    if (mergeBtn) mergeBtn.addEventListener('click', () => mergeUniversity_(row));
  });
}

/** 表記ゆれの大学を既存の確定済み大学へ統合（統合先はスタッフが手動選択） */
async function mergeUniversity_(row) {
  const name   = row.dataset.name;
  const target = row.querySelector('.uni-merge-sel').value;
  if (!target) { showToast_('統合先の大学を選択してください'); return; }

  const btn = row.querySelector('.uni-merge-btn');
  btn.disabled = true; btn.textContent = '確認中…';

  // 1段階目: 件数だけ確認（書き込みなし・専用アクション。
  // 旧GASに未反映の場合はここで unknown_action として安全に失敗する）
  const dry = await adminCall_('adminPreviewUniversityMerge', { name, target });
  if (!dry.ok) {
    btn.disabled = false; btn.textContent = '統合';
    showToast_(dry.message || '確認に失敗しました');
    return;
  }
  const dd = dry.data || {};
  const confirmMsg = dd.students > 0
    ? `「${name}」を「${target}」に統合します。\n\n` +
      `・対象: 学生 ${dd.students}名（${dd.events}イベント）\n` +
      '・学生IDは統合先の大学コード配下で新規に振り直されます\n' +
      '・出場校エントリーが両方に提出済みの場合、名称だけ揃えます（重複行は消しません。要手動確認）\n' +
      '・この操作は元に戻せません\n\n実行しますか？'
    : `「${name}」に該当する学生が見つかりませんでした（対象0名）。\n` +
      'それでも大学マスターから統合元を削除しますか？';
  if (!window.confirm(confirmMsg)) {
    btn.disabled = false; btn.textContent = '統合';
    return;
  }

  // 2段階目: 実行（途中で失敗しても、同じ組み合わせで再度「統合」を押せば
  // サーバー側が自動的に前回の続きから再開する）
  btn.textContent = '…';
  const res = await adminCall_('adminMergeUniversity', { name, target });
  if (!res.ok) {
    btn.disabled = false; btn.textContent = '統合';
    showToast_(res.message || '統合に失敗しました');
    return;
  }
  const d = res.data || {};
  if (d.needsReview) {
    btn.disabled = false; btn.textContent = '統合（再開）';
    showToast_(`⚠ 一部のイベントで接続に失敗し中断しました（学生 ${d.students || 0}名 / ${d.events || 0}イベントは完了）。\n` +
      'もう一度「統合」を押すと続きから再開します。解決しない場合は大学統合履歴シートをご確認ください。');
    return;
  }
  const dupNote = d.schoolEntryDup ? '\n⚠ 出場校エントリーに重複行があります。大学管理→出場大学でご確認ください' : '';
  showToast_(`✓ ${name} → ${target}（学生 ${d.students || 0}名 / ${d.events || 0}イベントを更新）${dupNote}`);
  loadUniversities_();
  updateUniBadge_(loadGen_);
}

/** 読みを送ってコードを確定（連番採番はGAS側）。resuming行は読み仮名不要で続きから再開する。 */
async function confirmUniversity_(row) {
  const name     = row.dataset.name;
  const resuming = row.dataset.resuming === 'true';
  let reading = '';
  if (!resuming) {
    reading = row.querySelector('.uni-reading').value.trim();
    const prefix = pokebellPrefix_(reading);
    if (!prefix) { showToast_('読みの頭文字をひらがなで入力してください'); return; }
    // 新規確定は学生IDを全イベントで書き換える不可逆操作。統合側(mergeUniversity_)には
    // 確認ダイアログがあるのに確定側だけ即実行だったため、表記ゆれの見落としと
    // 読みの入力ミスを押下前に一度止める。resuming（コード確定済みの再開）は対象外。
    const proceed = window.confirm(
      `「${name}」を読み「${reading}」（コード ${prefix}xx）で新規の大学として確定します。\n\n` +
      '次の2点を確認してください。\n' +
      '・既存の大学の表記ゆれ（別表記）ではないこと\n' +
      '　→ 表記ゆれなら「確定」ではなく「既存の大学に統合」を使ってください\n' +
      '・読みの頭文字が正しいこと（コードの先頭2桁がこれで決まります）\n\n' +
      'この大学の学生IDが全イベントで新しいコードに書き換わります。\n' +
      '元に戻すには統合をやり直す必要があり手間がかかります。\n\n' +
      '確定しますか？'
    );
    if (!proceed) return;
  }
  const btn = row.querySelector('.uni-confirm');
  btn.disabled = true; btn.textContent = '…';
  const res = await adminCall_('adminConfirmUniversity', { event: curEvent_, name, reading });
  if (!res.ok) {
    btn.disabled = false; btn.textContent = resuming ? '続きを実行' : '確定';
    showToast_(res.message || '確定に失敗しました');
    return;
  }
  const d  = res.data || {};
  const rw = d.rewritten || 0;
  if (d.needsReview) {
    btn.disabled = false; btn.textContent = '続きを実行';
    showToast_(`⚠ 一部のイベントで接続に失敗し中断しました（学生ID ${rw}件は反映済み）。\n` +
      'もう一度「続きを実行」を押すと続きから再開します。');
    loadUniversities_();
    return;
  }
  showToast_(`✓ ${name} → ${d.code}` + (rw ? `（学生ID ${rw}件を更新）` : ''));
  loadUniversities_();
  updateUniBadge_(loadGen_);
}

// ── 出展申込 ──────────────────────────────────────
let companyEntries_ = [];

async function loadCompanyEntries_(gen = null, ev = null) {
  if (!curEvent_) return;
  // 世代ガードが無く、イベントAの応答がBの申込一覧として描画されていた
  if (gen === null) gen = ++loadGen_;
  ev = ev ?? curEvent_;
  id_('entry-loading').style.display = '';
  id_('entry-summary').style.display  = 'none';
  id_('entry-section').style.display  = 'none';

  const res = await adminCall_('adminGetCompanyEntries', { event: ev });
  if (gen !== loadGen_) return;
  id_('entry-loading').style.display = 'none';

  if (!res.ok) { showToast_('ブース出展/パス申込の読み込みに失敗しました'); return; }

  companyEntries_ = res.data.entries || [];
  renderEntries_(companyEntries_);

  // ⚠ ダッシュボードの badge-entry 更新は削除した（2026-08-17）。
  //   admin.html に badge-entry は存在せず（企業出展申込のナビカード自体が無い）、
  //   ガードされて何もしていなかった。似た名前の badge-entry-list は
  //   「エントリーリスト」＝学生の走行順リスト用で意味が異なるため、
  //   ここへ企業申込件数を流し込んではいけない。
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
    list.innerHTML = '<p class="empty-msg">ブース出展/パス申込はまだありません</p>';
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
  id_('edit-entry-dept').value  = e['部署名'] || '';
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
      // 部署名はGAS側 actionAdminUpdateEntry_ の allowed に既に含まれている（再デプロイ不要）。
      // 部署名列が無い古いシートでは GAS 側が黙ってスキップする（エラーにはならない）。
      部署名:     id_('edit-entry-dept').value.trim(),
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
      drow('部署名', e['部署名']),
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
  const cols = ['申込日時','社名略称','企業名正式','代表者名','担当者名','電話番号','担当者電話','メールアドレス','郵便番号','都道府県','住所','部署名','出展内容','ブース区画','展示車両数','デモ走行','デモ走行詳細','人パス','車両パス','昼食土','昼食日','備考','状態'];
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

// 発送に必須の項目 → [申込シートの列名, CSVでの出力先列名]。
// 部署名は「お届け先住所2」に入るが任意項目（申込フォームでも必須ではない）ため検査しない。
const SHIPPING_REQUIRED_ = [
  ['企業名正式', 'お届け先名称1'],
  ['担当者名',   'お届け先名称2'],
  ['担当者電話', 'お届け先電話番号'],
  ['郵便番号',   '郵便番号'],
  ['都道府県',   'お届け先県名'],
  ['住所',       'お届け先住所1'],
];

/**
 * 発送対象の欠損・重複を検出して警告文の配列を返す（空配列＝問題なし）。
 * 重複キーは GAS の actionSubmitCompanyEntry_ と同じ「企業名正式 または メールアドレス」に揃える。
 * ⚠ 「状態」列は意図的に見ない（枚数のみで判定する運用。2026-08-10 ユーザー確認済み）。
 */
function findShippingIssues_(targets) {
  const issues = [];
  const norm = v => String(v || '').trim().replace(/\s+/g, ' ');
  const seenName = new Map();
  const seenMail = new Map();

  targets.forEach(e => {
    const label = norm(e['企業名正式']) || norm(e['社名略称']) || '(企業名なし)';

    const missing = SHIPPING_REQUIRED_
      .filter(([src]) => !norm(e[src]))
      .map(([src, dest]) => `${src}→${dest}`);
    if (missing.length) issues.push(`【欠損】${label}: ${missing.join(' / ')}`);

    const nameKey = norm(e['企業名正式']);
    if (nameKey) {
      if (seenName.has(nameKey)) issues.push(`【重複】企業名正式「${nameKey}」が複数行あります`);
      else seenName.set(nameKey, true);
    }
    const mailKey = norm(e['メールアドレス']).toLowerCase();
    if (mailKey) {
      if (seenMail.has(mailKey)) issues.push(`【重複】メールアドレス「${mailKey}」が複数行あります（${label}）`);
      else seenMail.set(mailKey, true);
    }
  });
  return issues;
}

/**
 * 西濃運輸パス発送用CSV（自社雛形「西濃パス発送雛形」準拠）。
 * 列は雛形ファイルの1行目そのまま:
 *   お届け先電話番号 / 郵便番号 / お届け先県名 / お届け先住所1 / お届け先住所2 /
 *   お届け先名称1 / お届け先名称2 / 出荷通知メール希望区分 / 記事
 * 対応関係（ユーザー確認済み・2026-08-05）:
 *   - お届け先電話番号 ← 担当者電話（代表電話ではなく、実際にパスを受け取る担当者へ連絡がつくため）
 *   - お届け先住所1 ← 住所 / お届け先住所2 ← 部署名（住所本体とは別列に分けて入れる）
 *   - お届け先名称1 ← 企業名正式 / お届け先名称2 ← 担当者名+「様」
 *   - 出荷通知メール希望区分は空欄（用途不明のため推測で埋めない。必要なら手動で追記）
 *   - 記事は全行固定で「FGパス類」（雛形1行目の記入例に合わせた）
 */
function downloadEntryShippingCsv_() {
  const targets = companyEntries_.filter(e => (Number(e['人パス']) || 0) > 0 || (Number(e['車両パス']) || 0) > 0);
  if (!targets.length) { showToast_('人パス・車両パスの申込がある企業がありません'); return; }

  // 欠損・重複があっても出力自体は止めない（締切直前に1社の不備で全社の発送が
  // 止まると運用が詰まるため）。ただし必ず内容を提示して確認を取る。
  const issues = findShippingIssues_(targets);
  if (issues.length) {
    const shown = issues.slice(0, 10).join('\n');
    const more  = issues.length > 10 ? `\n…他 ${issues.length - 10}件` : '';
    const proceed = window.confirm(
      `発送先データに問題が見つかりました（${issues.length}件 / 対象 ${targets.length}社）。\n\n` +
      `${shown}${more}\n\n` +
      '【欠損】は送り状の項目が空のまま出力されます（取込エラー・誤配送の原因）。\n' +
      '【重複】はそのままだと同じ宛先へ二重発送になります。\n' +
      'シート上で修正してから出力し直すことを推奨します。\n\n' +
      'このまま出力しますか？'
    );
    if (!proceed) { showToast_('出力を中止しました'); return; }
  }

  const cols = ['お届け先電話番号', '郵便番号', 'お届け先県名', 'お届け先住所1', 'お届け先住所2',
                'お届け先名称1', 'お届け先名称2', '出荷通知メール希望区分', '記事'];
  const header = cols.join(',');
  const rows = targets.map(e => {
    const contact = String(e['担当者名'] || '').trim();
    const values = [
      e['担当者電話'] || '',
      e['郵便番号'] || '',
      e['都道府県'] || '',
      e['住所'] || '',
      e['部署名'] || '',
      e['企業名正式'] || '',
      contact ? contact + '様' : '',
      '',
      'FGパス類',
    ];
    return values.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',');
  });
  // ⚠ 西濃運輸の送り状発行システムは Shift_JIS の CSV しか受け付けない。
  //   UTF-8(BOM付き)で出していたため「読み込めません」となり、取り込めても文字化けした
  //   （2026-08-17 に発覚。値をExcelへ貼り直すとExcelがShift_JISで保存するため通っていた）。
  const unsupported = downloadCsvSjis_('パス発送_' + curEvent_ + '.csv', [header, ...rows].join('\r\n'));
  if (unsupported.length) {
    // Shift_JIS に無い文字は '?' で出力される。どの文字が落ちたかを必ず伝える
    // （企業名に絵文字やローマ数字等が入っていると、送り状の宛名が欠ける）
    window.alert(
      'Shift_JISに変換できない文字がありました。該当箇所は「?」で出力されています。\n\n' +
      unsupported.join(' ') + '\n\n' +
      '送り状の宛名が欠けるため、申込データの該当文字を修正して出力し直してください。'
    );
  }
  showToast_(issues.length
    ? `△ ${targets.length}社を出力しました（未解決の問題 ${issues.length}件）`
    : `✓ ${targets.length}社の発送先を出力しました（Shift_JIS）`);
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

let listDataEvent_    = '';   // preRegAll_/schoolOrder_/womenPairings_ が属するイベント（空＝未ロード）
let preRegAll_        = [];   // 事前登録全件
let schoolOrder_      = [];   // 大学の並び順（大学名の配列）
let womenPairings_    = [];   // 女子ペアリング [{ a: studentId, b: studentId }]
let entryListLoading_ = 0;   // 実行中の世代番号（0=アイドル）

async function loadEntryList_(gen = null, ev = null) {
  if (gen === null) gen = ++loadGen_;
  ev = ev ?? curEvent_;
  // ⚠ 以前は boolean で「読み込み中なら何もしない」としていたため、Aの読み込み中に
  //   Bへ切り替えると B の取得自体が実行されず、一覧が空のままだった。
  //   同一世代の二重呼び出しだけを抑止し、世代が変われば新しい取得を通す。
  if (entryListLoading_ === gen) return;
  entryListLoading_ = gen;
  bindListPageEvents_();

  const [preRes, cfgRes, uniRes] = await Promise.all([
    adminCall_('adminGetPreRegistrations', { event: ev }),
    adminGetConfigDeduped_(ev),
    adminCall_('adminGetPendingUniversities', { event: ev }),
  ]);
  entryListLoading_ = 0;
  if (gen !== loadGen_) return;
  // 取得失敗時は前回の内容を残さない。残すと画面はエラーなのにCSVだけ古い内容が出る。
  if (!preRes.ok) {
    preRegAll_ = []; schoolOrder_ = []; womenPairings_ = []; listDataEvent_ = '';
    showListErr_('entry-list-wrap', preRes); return;
  }
  renderPendingUniWarning_('entry-list-wrap', uniRes);

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

  const norm = normalizeWomenPairings_(womenPairings_, preRegAll_);
  womenPairings_ = norm.pairs;
  if (norm.dupRemoved) showToast_('女子ペアリングに重複があったため解除しました。内容を確認し保存してください。');

  listDataEvent_ = ev;
  renderSchoolOrder_();
  renderWomenPairs_();
  renderEntryList_();
}

async function loadReceptionList_(gen = null, ev = null) {
  if (gen === null) gen = ++loadGen_;
  ev = ev ?? curEvent_;
  bindListPageEvents_();

  const [preRes, cfgRes, uniRes] = await Promise.all([
    adminCall_('adminGetPreRegistrations', { event: ev }),
    adminGetConfigDeduped_(ev),
    adminCall_('adminGetPendingUniversities', { event: ev }),
  ]);
  if (gen !== loadGen_) return;
  // 取得失敗時は前回の内容を残さない（受付リスト・応援学生リストのCSVが古い内容で出る）
  if (!preRes.ok) {
    preRegAll_ = []; schoolOrder_ = []; womenPairings_ = []; listDataEvent_ = '';
    showListErr_('reception-list-wrap', preRes); return;
  }
  renderPendingUniWarning_('reception-list-wrap', uniRes);

  preRegAll_ = preRegRowsToObjects_(preRes.data);
  const cfg  = (cfgRes.ok && cfgRes.data && cfgRes.data.config) ? cfgRes.data.config : {};
  schoolOrder_   = parseJsonOr_(cfg.schoolRunningOrder, []);
  womenPairings_ = parseJsonOr_(cfg.womenPairings, []);
  const menSchools = computeMenSchools_(preRegAll_);
  schoolOrder_ = [
    ...schoolOrder_.filter(s => menSchools.includes(s)),
    ...menSchools.filter(s => !schoolOrder_.includes(s)),
  ];
  const norm = normalizeWomenPairings_(womenPairings_, preRegAll_);
  womenPairings_ = norm.pairs;
  if (norm.dupRemoved) showToast_('女子ペアリングに重複があったため解除しました。内容を確認し保存してください。');

  listDataEvent_ = ev;
  renderReceptionList_();
  renderSupportList_();
  renderOrderList_();
}

function bindListPageEvents_() {
  // 初期化: 各tab-barのCSS変数を設定
  document.querySelectorAll('#page-entry-list .tab-bar, #page-reception .tab-bar, #page-forms .tab-bar').forEach(bar => {
    const btns = [...bar.querySelectorAll('.tab-btn')];
    bar.style.setProperty('--tab-count', btns.length);
    const activeIdx = Math.max(0, btns.findIndex(b => b.classList.contains('active')));
    bar.style.setProperty('--tab-idx', activeIdx);
  });

  // クリックハンドラは一度だけ（イベント委譲）
  if (bindListPageEvents_._done) return;
  bindListPageEvents_._done = true;
  document.addEventListener('click', ev => {
    const btn = ev.target.closest('.tab-btn');
    if (!btn) return;
    const bar = btn.closest('.tab-bar');
    if (!bar) return;
    const page = btn.closest('#page-entry-list, #page-reception, #page-forms');
    if (!page) return;
    const btns = [...bar.querySelectorAll('.tab-btn')];
    const i = btns.indexOf(btn);
    btns.forEach(b => b.classList.toggle('active', b === btn));
    bar.style.setProperty('--tab-idx', i);
    page.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const t = id_('tab-' + btn.dataset.tab);
    if (t) t.classList.add('active');
  });
  id_('btn-save-order')?.addEventListener('click', saveSchoolOrder_);
  id_('btn-add-women-pair')?.addEventListener('click', () => {
    womenPairings_.push({ a: '', b: '', c: '' });
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
  // FGクラス(A/B/C)ドライバーが1人でも登録されている大学のリスト（重複除去、登録順を維持）
  // ⚠ 女子クラスドライバー(W)は含めない。ここは走行順計算のN(男子登録大学数)の母集団であり、
  //   女子のみ登録の大学を含めるとNが水増しされ、男子B/C・女子A/Bの走行順が全てズレる。
  const seen = new Set();
  const out = [];
  all.forEach(r => {
    const cls = classOf_(r);
    if (['A', 'B', 'C'].includes(cls)) {
      const s = String(r['大学名'] || r.school || '').trim();
      if (s && !seen.has(s)) { seen.add(s); out.push(s); }
    }
  });
  return out;
}

// 女子ペアリングの自己修復: 範囲外(女子ドライバーでなくなった)IDの除去、および
// 全ペア横断での重複除去（ドライバー1人につき出走枠は1つのため）。
// ⚠ Cヒートは大会によって使わない場合があるが、キー自体は必ず維持すること。
//   a/bだけを再構築するとCヒートの値が毎回無条件に消えてしまう不具合があった。
// 保存するまでサーバー側のCONFIGは変えない（読み込み時のメモリ上修復のみ）。
function normalizeWomenPairings_(pairs, preRegAll) {
  const womenIds = new Set(preRegAll
    .filter(r => classOf_(r) === 'W')
    .map(r => r.studentId));
  const seen = new Set();
  let dupRemoved = false;
  const fix = v => {
    if (!v || !womenIds.has(v)) return '';
    if (seen.has(v)) { dupRemoved = true; return ''; }
    seen.add(v);
    return v;
  };
  const out = pairs.map(p => ({ a: fix(p.a), b: fix(p.b), c: fix(p.c) }));
  return { pairs: out, dupRemoved };
}

// 承認待ち（仮コード）の大学が残っている間、リストの上に警告を出す。
// 仮コードのままCSVを出すと、そのIDが印刷物や配布物に載ってしまい、
// 後から確定させても紙とデータが食い違う。出力自体はブロックしない（運用判断）。
function renderPendingUniWarning_(wrapId, pendingRes) {
  const wrap = id_(wrapId);
  if (!wrap || !wrap.parentNode) return;
  const bannerId = wrapId + '-uni-warn';
  const existing = id_(bannerId);
  const list = (pendingRes && pendingRes.ok && pendingRes.data)
    ? (pendingRes.data.universities || []) : [];
  if (!list.length) { if (existing) existing.remove(); return; }

  const names = list.map(u => `${u.name}（仮 ${u.code}）`).join('、');
  const html =
    `<strong>⚠ 承認待ちの大学が ${list.length}件 あります</strong><br>` +
    `${esc_(names)}<br>` +
    'この大学の学生IDは仮コードのままです。確定すると学生IDが変わるため、' +
    '先に「大学管理」で確定させてからCSVを出力・印刷してください。';
  const el = existing || document.createElement('div');
  if (!existing) {
    el.id = bannerId;
    el.style.cssText = 'background:#FFF7E1;border:1px solid #F5D680;border-radius:8px;' +
      'padding:10px 12px;margin:0 0 10px;font-size:12px;color:#5C4200;line-height:1.6';
    wrap.parentNode.insertBefore(el, wrap);
  }
  el.innerHTML = html;
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
    wrap.innerHTML = '<p style="font-size:12px;color:var(--gray);text-align:center;padding:16px 0">ドライバーの事前登録がまだありません</p>';
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

  // ドライバー1人につき出走枠は1つなので、全ペア横断で既に選ばれている学生を
  // 選択肢から除外する（同一ペア内の他ヒートだけでなく、別ペアでの重複も禁止）。
  // 自分自身の現在値だけは残す。
  const allUsed = new Set();
  womenPairings_.forEach(p => { [p.a, p.b, p.c].forEach(v => { if (v) allUsed.add(v); }); });

  const opt = sel => {
    let html = '<option value="">選択</option>';
    womenDrivers.forEach(w => {
      if (allUsed.has(w.studentId) && w.studentId !== sel) return;
      const label = `${w['大学名'] || ''} / ${w['氏名'] || ''}`;
      const s = w.studentId === sel ? ' selected' : '';
      html += `<option value="${esc_(w.studentId)}"${s}>${esc_(label)}</option>`;
    });
    return html;
  };

  wrap.innerHTML =
    `<div class="women-pair-row header"><span></span><span>Aヒート</span><span>Bヒート</span><span>Cヒート</span><span></span></div>` +
    womenPairings_.map((p, i) => `
      <div class="women-pair-row">
        <span class="women-pair-label">ペア${i + 1}</span>
        <div class="women-pair-slot"><span class="heat-lbl">A</span><select data-pair="${i}" data-heat="a">${opt(p.a)}</select></div>
        <div class="women-pair-slot"><span class="heat-lbl">B</span><select data-pair="${i}" data-heat="b">${opt(p.b)}</select></div>
        <div class="women-pair-slot"><span class="heat-lbl">C</span><select data-pair="${i}" data-heat="c">${opt(p.c)}</select></div>
        <button class="women-pair-del" data-del="${i}" title="ペアを削除">×</button>
      </div>`).join('');

  wrap.querySelectorAll('select').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = +sel.dataset.pair;
      womenPairings_[i][sel.dataset.heat] = sel.value;
      renderWomenPairs_(); // 相手側selectの除外リストを再計算するため再描画
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
  if (!curEvent_) return;
  const btn = id_('btn-save-order');
  const fb  = id_('save-order-fb');
  btn.disabled = true; fb.className = 'save-fb'; fb.textContent = '';

  // ⚠ 宛先イベントと保存値の両方を開始時に固定する。
  //   womenPairings は2回目の await 後に評価されるため、固定しないと
  //   「別イベントの読み込みで置き換わった womenPairings_ を、別イベントへ書く」
  //   という二重のズレが起きる。走行順・女子ペアリングの汚染は大会運営に直結する。
  const ev        = curEvent_;
  // ⚠ 一覧が未ロード／別イベントのものだと、空配列や別イベントの並び順を
  //   保存済みの走行順に上書きしてしまう。読み込み済みのイベントとだけ照合して弾く。
  if (listDataEvent_ !== ev) {
    fb.textContent = '一覧の読み込みが完了していません。再読み込みしてください';
    fb.className = 'save-fb err';
    btn.disabled = false;
    return;
  }
  const orderJson = JSON.stringify(schoolOrder_);
  const pairsJson = JSON.stringify(womenPairings_);

  const r1 = await adminCall_('adminUpdateConfig', {
    event: ev, key: 'schoolRunningOrder', value: orderJson,
  });
  const r2 = await adminCall_('adminUpdateConfig', {
    event: ev, key: 'womenPairings', value: pairsJson,
  });

  btn.disabled = false;
  if (r1.ok && r2.ok) {
    const moved = ev !== curEvent_;
    fb.textContent = moved ? `✓ 保存しました（${ev}）` : '✓ 保存しました';
    fb.className = 'save-fb ok';
    // 表示中のイベントが変わっていたら再描画しない（別イベントの一覧を汚す）
    if (!moved) renderEntryList_(); // 表示側も更新
    else showToast_(`✓ ${ev} の走行順を保存しました（表示中のイベントとは異なります）`);
  } else {
    fb.textContent = '保存に失敗しました';
    fb.className = 'save-fb err';
  }
}

// a/b/cが全て空のペア（「ペア追加」だけ押して未入力のもの）は出走枠を持たないため、
// 走行順のM（女子登録ペア数）にも表示区分の境界計算にも含めない。
function activeWomenPairings_() {
  return womenPairings_.filter(p => p.a || p.b || p.c);
}

// ── 走行順の計算 ────────────
// 男子A: 1..N / 女子A: N+1..N+M / 男子B: N+M+1..2N+M / 女子B: 2N+M+1..2N+2M /
// 男子C: 2N+2M+1..3N+2M / 女子C: 3N+2M+1..3N+2M+Mc
// (Mc=Cヒートが選ばれているペア数。大会によって女子Cを使わない場合は0のままで、
//  その場合は既存の男子C以前の計算式に一切影響しない)
function computeRunningOrder_() {
  const N = schoolOrder_.length;
  const activePairs = activeWomenPairings_();
  const M = activePairs.length;
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

  activePairs.forEach((p, i) => {
    if (p.a) byId[p.a] = N + i + 1;
    if (p.b) byId[p.b] = 2 * N + M + i + 1;
  });

  // 女子Cヒート: Cが選ばれているペアだけ、男子Cの後ろに詰めて連番を振る
  let cSeq = 0;
  activePairs.forEach(p => {
    if (!p.c) return;
    cSeq++;
    byId[p.c] = 3 * N + 2 * M + cSeq;
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
    <th>大学名</th><th>走行順</th><th>ドライバー</th>
    <th>選手名</th><th>よみがな</th><th>入部何年</th>
  </tr></thead>`;
  const emptyBody = `<tr><td colspan="6" style="text-align:center;color:var(--gray);padding:12px 0">該当なし</td></tr>`;

  wrap.innerHTML = `
    <div class="list-section-title">Formula Gymkhana クラス</div>
    <div class="list-scroll"><table class="list-tbl">${header}<tbody>${men.length ? men.map(row).join('') : emptyBody}</tbody></table></div>
    <div class="list-section-title">Formula Gymkhana 女子クラス</div>
    <div class="list-scroll"><table class="list-tbl">${header}<tbody>${women.length ? women.map(row).join('') : emptyBody}</tbody></table></div>
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
  const WOMEN_HEAT_CLS = { a: 'A', b: 'B', c: 'C' };
  womenPairings_.forEach(p => {
    ['a', 'b', 'c'].forEach(k => {
      if (!p[k]) return;
      const r = preRegAll_.find(x => x.studentId === p[k]);
      if (!r) return;
      rows.push({
        section: 'women',
        school:    String(r['大学名'] || '').trim(),
        cls:       WOMEN_HEAT_CLS[k],
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

  const men   = rows.filter(r => r.section === 'men');
  const women = rows.filter(r => r.section === 'women');

  const header = `<thead><tr>
        <th>大学名</th><th>ドライバー</th><th>選手名</th><th>よみがな</th>
        <th>受付(土)</th><th>受付(日)</th><th>紹介カード</th><th>リストバンド</th>
        <th>必要書類</th><th>ID</th>
      </tr></thead>`;
  const emptyBody = `<tr><td colspan="10" style="text-align:center;color:var(--gray);padding:12px 0">該当なし</td></tr>`;
  const row = r => `<tr>
    <td>${esc_(r.school)}</td>
    <td class="center cls-${r.cls}">${r.cls}</td>
    <td>${esc_(r.name)}</td>
    <td>${esc_(r.furigana)}</td>
    <td class="center"></td><td class="center"></td>
    <td class="center"></td><td class="center"></td>
    <td></td>
    <td class="num">${esc_(r.studentId)}</td>
  </tr>`;

  const tbl = (label, xs) => `
    <div class="list-section-title">${label}</div>
    <div class="list-scroll"><table class="list-tbl">${header}<tbody>${xs.length ? xs.map(row).join('') : emptyBody}</tbody></table></div>`;

  wrap.innerHTML = tbl('Formula Gymkhana クラス', men) + tbl('Formula Gymkhana 女子クラス', women);
}

// ── 応援学生受付リスト表示 ────────────
// 「両クラス担当」の表記ゆれを表示上だけ揃える。
// 補欠の旧データは 'FG/女子クラス'、見学応援と2026-08-17以降の補欠は 'FGクラス/女子クラス'。
// 両者が同じ「メカニック登録」列に並ぶため、表示のみ新表記に寄せる（シートは書き換えない）。
function normalizeServiceClass_(v) {
  return String(v || '') === 'FG/女子クラス' ? 'FGクラス/女子クラス' : String(v || '');
}

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
    // ⚠ 事前登録シートに「属性」列は存在しない（列は「参加区分」）。
    //   以前は r['属性'] を見ていたため常に undefined となり、
    //   補欠選手登録・メカニック登録・必要書類の3列が常に空欄になっていた。
    const cat    = String(r['参加区分'] || r.category || '');
    const svcCls = String(r['サービス作業クラス'] || '');
    // 「実施しない」は区分によって文言が異なる（旧データの補欠は
    // 「サービス作業は実施しない/来場予定はない」。2026-08-17に「実施しない」へ統一）
    const doesService = !!svcCls && !svcCls.includes('実施しない');
    const isBackup    = cat === '補欠ドライバー';
    const isSupport   = cat === '見学・応援学生(メカニック登録含む)';
    // ⚠「サービス作業クラス」列は区分に関わらず「メカニックとしてどのクラスを担当するか」の回答。
    //   補欠かどうかは「参加区分」列だけで決まるため、補欠選手登録列にクラスを出してはいけない。
    const backup = isBackup ? 'あり' : '';
    // メカニック登録列は補欠・見学応援で共通（フォームの設問が同一のため）。
    // 補欠が「実施しない」を選んだ場合のみ明示する。見学応援は空欄のまま（従来の見た目を維持）。
    // 未回答（空欄）は補欠でも空欄のままにする＝「実施なし」と断定しない。
    let mech = '';
    if (isBackup || isSupport) {
      mech = doesService ? normalizeServiceClass_(svcCls)
           : (isBackup && svcCls ? '実施なし' : '');
    }
    // 保険証明を提出するのは「見学・応援でサービス作業を行う人」のみ（補欠は提出しない）
    const needDoc = isSupport && doesService && !r['保険証明URL'] ? '※保険確認' : '';
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
  const emptyBody = `<tr><td colspan="10" style="text-align:center;color:var(--gray);padding:16px 0">応援学生の事前登録がありません</td></tr>`;
  wrap.innerHTML = `
    <div class="list-scroll"><table class="list-tbl">
      <thead><tr>
        <th>大学名</th><th>氏名</th><th>よみがな</th>
        <th>受付</th><th>補欠選手登録</th><th>メカニック登録</th>
        <th>土曜昼食</th><th>日曜昼食</th><th>必要書類</th><th>ID</th>
      </tr></thead>
      <tbody>${rows.length ? trs : emptyBody}</tbody>
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
  const M = activeWomenPairings_().length;
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
    <th>学校名</th><th>出走順</th><th>ドライバー</th>
    <th>氏名</th><th>ふりがな</th><th>入部何年</th>
  </tr></thead>`;
  const emptyBody = `<tr><td colspan="6" style="text-align:center;color:var(--gray);padding:12px 0">該当なし</td></tr>`;

  const tbl = (label, xs) => `
    <div class="list-section-title">${label}</div>
    <div class="list-scroll"><table class="list-tbl">${header}<tbody>${xs.length ? xs.map(row).join('') : emptyBody}</tbody></table></div>`;

  wrap.innerHTML = tbl('Aドライバー', heatA) + tbl('Bドライバー', heatB) + tbl('Cドライバー', heatC);
}

// ── CSV出力 ────────────
// BOMは downloadCsv_ が付ける。ここでは付けない（二重BOMになるため）。
function toCsv_(headers, rows) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [headers.map(q).join(',')];
  rows.forEach(r => lines.push(r.map(q).join(',')));
  return lines.join('\r\n');
}

function downloadEntryListCsv_() {
  const orders = computeRunningOrder_();
  const rows   = buildEntryListRows_(orders);
  const headers = ['大学名', '走行順', 'ドライバー', '選手名', 'よみがな', '入部何年', 'クラス', 'studentId'];
  const data = rows.map(r => [
    r.school, r.order, r.cls, r.name, r.furigana, r.clubYears,
    r.section === 'men' ? 'Formula Gymkhana' : 'Formula Gymkhana 女子', r.studentId,
  ]);
  downloadCsv_(`エントリーリスト_${curEvent_}.csv`, toCsv_(headers, data));
}

function downloadReceptionCsv_() {
  const orders = computeRunningOrder_();
  const rows   = buildEntryListRows_(orders);
  const headers = ['大学名', 'ドライバー', '選手名', 'よみがな',
    '受付(土曜日)', '受付(日曜日)', '紹介カード', 'リストバンド', '必要書類', 'クラス', 'ID'];
  const data = rows.map(r => [r.school, r.cls, r.name, r.furigana, '', '', '', '', '',
    r.section === 'men' ? 'Formula Gymkhana' : 'Formula Gymkhana 女子', r.studentId]);
  downloadCsv_(`選手受付リスト_${curEvent_}.csv`, toCsv_(headers, data));
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
  const headers = ['学校名', '出走順', 'ドライバー', '氏名', 'ふりがな', '入部何年', 'studentId'];
  const data = rows.map(r => [r.school, r.order, r.cls, r.name, r.furigana, r.clubYears, r.studentId]);
  downloadCsv_(`出走リスト_${curEvent_}.csv`, toCsv_(headers, data));
}
