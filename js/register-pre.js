/**
 * FG Event Platform — 学生 事前登録フォーム（会期前・公開）
 *
 * register-pre.html?event=<eventId> でアクセス。
 * 共通セクション＋参加区分＋同意を収集し、registerPreStudent(POST)へ送信。
 * cardToken はGAS側で発行（学生マスター upsert・登録種別=事前）。確認メール送信。
 *
 * config.js / api.js より後に読み込むこと。
 */

const $ = id => document.getElementById(id);

let _event = null;

// カテゴリ → formConfig のキー対応
const CAT_DEADLINE_KEY = {
  '出場選手(FGクラスドライバー)':       'deadlineDriver',
  '出場選手(女子クラスドライバー)':     'deadlineWomenDriver',
  '補欠ドライバー':                     'deadlineReserve',
  '見学・応援学生(メカニック登録含む)': 'deadlineMechanic',
};

let _formConfig = {};

(async () => {
  _event = FG_API.getParam('event');
  if (!_event) { showState('no-event'); return; }

  // イベント名・フォーム設定・大学リストを並行取得
  const [evRes, cfgRes, schoolRes] = await Promise.all([
    FG_API.getEventList(),
    FG_API.getFormConfig(_event),
    FG_API.getSchoolList(),
  ]);
  if (schoolRes.ok) fillSchoolList_(schoolRes.data.schools || []);

  let _eventName = _event;
  let _day1 = '土曜日';
  let _day2 = '日曜日';

  if (evRes.ok) {
    const ev = (evRes.data.events || []).find(e => String(e.eventId) === String(_event));
    if (ev) {
      _eventName = ev.name || ev.eventId;
      if (ev.startDate) { const d = new Date(ev.startDate); if (!isNaN(d)) _day1 = fmtDay_(d); }
      if (ev.endDate)   { const d = new Date(ev.endDate);   if (!isNaN(d)) _day2 = fmtDay_(d); }
    }
    $('event-name-label').textContent = _eventName;
  } else {
    $('event-name-label').textContent = _event;
  }

  // フォーム内の「土曜日」「日曜日」を実際の日付に置換
  replaceDays_(_day1, _day2);

  // 「所属校は出場しますか？」ラベルはイベント名から自動生成
  const compEl = $('label-competing');
  if (compEl) compEl.textContent = `所属する学校は、${_eventName}に出場しますか？`;

  if (cfgRes.ok) {
    _formConfig = cfgRes.data || {};
    const now = new Date();

    // フォーム公開開始前
    if (_formConfig.formOpenAt && now < new Date(_formConfig.formOpenAt)) {
      showState('not-open');
      return;
    }

    // カテゴリ別締切チェック（期限切れはラジオを無効化・ラベルに注記）
    document.querySelectorAll('input[name="category"]').forEach(radio => {
      const key = CAT_DEADLINE_KEY[radio.value];
      const dl  = key && _formConfig[key];
      if (dl && now > new Date(dl)) {
        radio.disabled = true;
        const label = radio.closest('label') || radio.parentElement;
        if (label && !label.querySelector('.deadline-note')) {
          const note = document.createElement('span');
          note.className = 'deadline-note';
          note.textContent = '（受付終了）';
          note.style.cssText = 'color:#e53935;font-size:12px;margin-left:4px';
          label.appendChild(note);
        }
      }
    });
  }

  showState('form');
})();

$('btn-submit')?.addEventListener('click', submitForm);

// メールアドレス欄はコピー＆ペースト・ドラッグ＆ドロップを禁止し、確実に手入力させる
['f-email', 'f-email-confirm'].forEach(id => {
  const el = $(id);
  if (!el) return;
  ['paste', 'drop'].forEach(ev => el.addEventListener(ev, e => e.preventDefault()));
});

// ── 参加区分による分岐表示 ──────────────────────
const BRANCH_BY_CAT = {
  '出場選手(FGクラスドライバー)':       'sec-fg',
  '出場選手(女子クラスドライバー)':     'sec-women',
  '補欠ドライバー':                     'sec-backup',
  '見学・応援学生(メカニック登録含む)': 'sec-spectator',
};
document.querySelectorAll('input[name="category"]').forEach(r =>
  r.addEventListener('change', () => showBranch(r.value)));

function showBranch(cat) {
  const target = BRANCH_BY_CAT[cat];
  document.querySelectorAll('.branch').forEach(sec => {
    sec.style.display = (sec.id === target) ? 'block' : 'none';
  });
}

// 宿泊→夕食の表示連動（FG/女子）
['fg', 'w'].forEach(pfx => {
  document.querySelectorAll(`input[name="${pfx}Hotel"]`).forEach(r =>
    r.addEventListener('change', () => {
      const row = $('row-' + pfx + 'Dinner');
      if (row) row.style.display = (r.value === 'はい' && r.checked) ? 'block' : 'none';
    }));
});

// 見学：サービス作業有無の表示連動（分岐②）
document.querySelectorAll('input[name="sService"]').forEach(r =>
  r.addEventListener('change', () => {
    const yes = $('sec-spectator-yes'), no = $('sec-spectator-no');
    if (yes) yes.style.display = (r.value === 'はい'  && r.checked) ? 'block' : 'none';
    if (no)  no.style.display  = (r.value === 'いいえ' && r.checked) ? 'block' : 'none';
  }));

// ── ファイル（区分別） ──────────────────────────
const MAX_FILE  = 8 * 1024 * 1024;   // 1ファイル上限 8MB
const MAX_TOTAL = 20 * 1024 * 1024;  // 合計上限 20MB（GAS POSTの実用上限・base64膨張を考慮）

// 選択中ファイルの合計バイト数
function totalFileBytes_(cat) {
  return fileSpec(cat).reduce((sum, s) => {
    const f = ($(s.id).files || [])[0];
    return sum + (f ? f.size : 0);
  }, 0);
}

function fileSpec(cat) {
  if (cat === '出場選手(FGクラスドライバー)')
    return [{ key: 'pledge', id: 'f-fg-pledge', req: true }, { key: 'license', id: 'f-fg-license', req: true }];
  if (cat === '出場選手(女子クラスドライバー)')
    return [{ key: 'approval', id: 'f-w-approval', req: false }, { key: 'pledge', id: 'f-w-pledge', req: true }, { key: 'license', id: 'f-w-license', req: true }];
  if (cat === '補欠ドライバー')
    return [{ key: 'pledge', id: 'f-b-pledge', req: true }, { key: 'license', id: 'f-b-license', req: true }];
  if (cat === '見学・応援学生(メカニック登録含む)') {
    const sw = radioVal('sService');
    if (sw === 'はい')   return [{ key: 'insurance', id: 'f-s-insurance', req: true }, { key: 'pledge', id: 'f-s-pledge-yes', req: true }];
    if (sw === 'いいえ') return [{ key: 'pledge', id: 'f-s-pledge-no', req: true }];
  }
  return [];
}

function validateFiles(cat) {
  let ok = true;
  fileSpec(cat).forEach(s => {
    const f = ($(s.id).files || [])[0];
    const bad = (s.req && !f) || (f && f.size > MAX_FILE);
    setErr(s.id.replace(/^f-/, ''), bad);
    if (bad) ok = false;
  });
  return ok;
}

function readB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve({ name: file.name, mime: file.type || 'application/octet-stream', b64: String(r.result).split(',')[1] || '' });
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function readBranchFiles(cat) {
  const out = {};
  for (const s of fileSpec(cat)) {
    const f = ($(s.id).files || [])[0];
    if (f) out[s.key] = await readB64(f);
  }
  return out;
}

// ── バリデーション ──────────────────────────────
const NAME_RE  = /.+[ 　].+/;        // 姓と名の間にスペース
const PHONE_RE = /^[0-9]{10,11}$/;
const POSTAL_RE = /^[0-9]{7}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIM_RE   = /^[0-9]{1,2}:[0-5][0-9]\.[0-9]{3}$/;  // 1:15.001

function setErr(id, on) {
  const err = $('err-' + id);
  const field = $('f-' + id);
  if (err) err.classList.toggle('show', on);
  if (field) field.classList.toggle('error', on);
}
function errToggle(id, on) {
  const err = $('err-' + id);
  if (err) err.classList.toggle('show', on);
}
function radioVal(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : '';
}
function checkedVals(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(e => e.value);
}

// 参加区分ごとの追加項目を収集
function collectBranch(cat) {
  const b = {};
  b.mediaConsent = $('cb-media').checked ? 'true' : 'false';
  if (cat === '出場選手(FGクラスドライバー)') {
    b.driverClass = radioVal('driverClass');
    b.simDate = $('f-fg-simdate').value;
    b.simTime = $('f-fg-simtime').value.trim();
    b.comment = $('f-fg-comment').value.trim();
    b.hotel   = radioVal('fgHotel');
    b.dinner  = radioVal('fgDinner');
  } else if (cat === '出場選手(女子クラスドライバー)') {
    b.simDate = $('f-w-simdate').value;
    b.simTime = $('f-w-simtime').value.trim();
    b.comment = $('f-w-comment').value.trim();
    b.hotel   = radioVal('wHotel');
    b.dinner  = radioVal('wDinner');
  } else if (cat === '補欠ドライバー') {
    b.simDate      = $('f-b-simdate').value;
    b.simTime      = $('f-b-simtime').value.trim();
    b.comment      = $('f-b-comment').value.trim();
    b.visitDays    = radioVal('bVisit');
    b.lunchSat     = radioVal('bLunchSat');
    b.lunchSun     = radioVal('bLunchSun');
    b.serviceClass = radioVal('bService');
  } else if (cat === '見学・応援学生(メカニック登録含む)') {
    b.visitDays    = checkedVals('sVisit').join(',');
    b.lunchSat     = radioVal('sLunchSat');
    b.lunchSun     = radioVal('sLunchSun');
    b.competing    = radioVal('sCompeting');
  }
  return b;
}

function validateBranch(cat, b) {
  let ok = true;
  const need = (id, cond) => { errToggle(id, cond); if (cond) ok = false; };
  if (cat === '出場選手(FGクラスドライバー)') {
    need('driverClass', !b.driverClass);
    need('fg-simdate',  !b.simDate);
    need('fg-simtime',  !SIM_RE.test(b.simTime));
    need('fgHotel',     !b.hotel);
  } else if (cat === '出場選手(女子クラスドライバー)') {
    need('w-simdate', !b.simDate);
    need('w-simtime', !SIM_RE.test(b.simTime));
    need('wHotel',    !b.hotel);
  } else if (cat === '補欠ドライバー') {
    need('b-simdate',  !b.simDate);
    need('b-simtime',  !SIM_RE.test(b.simTime));
    need('bVisit',     !b.visitDays);
    need('bLunchSat',  !b.lunchSat);
    need('bLunchSun',  !b.lunchSun);
    need('bService',   !b.serviceClass);
  } else if (cat === '見学・応援学生(メカニック登録含む)') {
    need('sVisit',     !b.visitDays);
    need('sLunchSat',  !b.lunchSat);
    need('sLunchSun',  !b.lunchSun);
    need('sCompeting', !b.competing);
    const sw = radioVal('sService');
    need('sService', !sw);
    if (sw === 'はい') need('s-serviceclass', !$('f-s-serviceclass').value);
    const mediaBad = b.mediaConsent !== 'true';
    $('cb-wrap-media').classList.toggle('error', mediaBad);
    errToggle('media', mediaBad);
    if (mediaBad) ok = false;
  }
  return ok;
}

function collect() {
  const cat = document.querySelector('input[name="category"]:checked');
  return {
    name:       $('f-name').value.trim(),
    furigana:   $('f-furigana').value.trim(),
    school:     $('f-school').value.trim(),
    department: $('f-department').value.trim(),
    year:       $('f-year').value,
    clubYears:  $('f-club-years').value,
    gender:     $('f-gender').value,
    birthday:   $('f-birthday').value,
    email:      $('f-email').value.trim(),
    emailConfirm: $('f-email-confirm').value.trim(),
    phone:      $('f-phone').value.trim(),
    postal:     $('f-postal').value.trim(),
    prefecture: $('f-prefecture').value,
    address:    $('f-address').value.trim(),
    category:   cat ? cat.value : '',
    rules:      $('cb-rules').checked,
    privacy:    $('cb-privacy').checked,
  };
}

function validate(d) {
  let ok = true;
  const fail = (id, cond) => { setErr(id, cond); if (cond) ok = false; };

  fail('name',       !NAME_RE.test(d.name));
  fail('furigana',   !NAME_RE.test(d.furigana));
  fail('school',     !(d.school.includes('大学')));
  fail('department', !d.department);
  fail('year',       !d.year);
  fail('club-years', !d.clubYears);
  fail('gender',     !d.gender);
  fail('birthday',   !d.birthday);
  fail('email',      !EMAIL_RE.test(d.email));
  fail('email-confirm', !d.emailConfirm || d.email !== d.emailConfirm);
  fail('phone',      !PHONE_RE.test(d.phone));
  fail('postal',     !POSTAL_RE.test(d.postal));
  fail('prefecture', !d.prefecture);
  fail('address',    !d.address);

  // 参加区分
  const catErr = $('err-category');
  if (!d.category) { catErr.classList.add('show'); ok = false; }
  else catErr.classList.remove('show');

  // 区分別の追加項目＋ファイル
  if (d.category && !validateBranch(d.category, d._branch || {})) ok = false;
  if (d.category && !validateFiles(d.category)) ok = false;

  // 同意
  const rulesErr = $('err-rules'), privErr = $('err-privacy');
  $('cb-wrap-rules').classList.toggle('error', !d.rules);
  rulesErr.classList.toggle('show', !d.rules);
  $('cb-wrap-privacy').classList.toggle('error', !d.privacy);
  privErr.classList.toggle('show', !d.privacy);
  if (!d.rules || !d.privacy) ok = false;

  return ok;
}

// ── 送信 ────────────────────────────────────────
async function submitForm() {
  const banner = $('form-error-banner');
  banner.classList.remove('show');

  const d = collect();
  d._branch = collectBranch(d.category);
  // 見学：サービス作業有無 → サービス作業クラスを確定
  if (d.category === '見学・応援学生(メカニック登録含む)') {
    const sw = radioVal('sService');
    d._branch.serviceClass = sw === 'はい' ? $('f-s-serviceclass').value
                           : sw === 'いいえ' ? '実施しない' : '';
  }
  if (!validate(d)) {
    banner.textContent = '未入力・不正な項目があります。赤色の箇所をご確認ください。';
    banner.classList.add('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // 合計サイズ上限チェック（超過時は原因を明示。送信前に止める）
  if (d.category && totalFileBytes_(d.category) > MAX_TOTAL) {
    banner.textContent = `添付ファイルの合計が大きすぎます（上限 ${Math.round(MAX_TOTAL / 1024 / 1024)}MB）。ファイルを小さくして再度お試しください。`;
    banner.classList.add('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const btn = $('btn-submit');
  btn.disabled = true;
  btn.textContent = '送信中...';

  // 区分別ファイルを base64 で読み込み
  let files = {};
  try {
    files = await readBranchFiles(d.category);
  } catch (e) {
    btn.disabled = false; btn.textContent = '事前登録する';
    banner.textContent = 'ファイルの読み込みに失敗しました。別のファイルでお試しください。';
    banner.classList.add('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const res = await FG_API.registerPreStudent({
    event:          _event,
    name:           d.name,
    furigana:       d.furigana,
    school:         d.school,
    department:     d.department,
    year:           d.year,
    clubYears:      d.clubYears,
    gender:         d.gender,
    birthday:       d.birthday,
    email:          d.email,
    phone:          d.phone,
    postal:         d.postal,
    prefecture:     d.prefecture,
    address:        d.address,
    category:       d.category,
    rulesConsent:   'true',
    privacyConsent: 'true',
    // 区分別の追加項目（未使用キーはGAS側で空欄）
    driverClass:    d._branch.driverClass  || '',
    simDate:        d._branch.simDate       || '',
    simTime:        d._branch.simTime       || '',
    comment:        d._branch.comment       || '',
    hotel:          d._branch.hotel         || '',
    dinner:         d._branch.dinner        || '',
    visitDays:      d._branch.visitDays     || '',
    lunchSat:       d._branch.lunchSat      || '',
    lunchSun:       d._branch.lunchSun      || '',
    serviceClass:   d._branch.serviceClass  || '',
    competing:      d._branch.competing     || '',
    mediaConsent:   d._branch.mediaConsent  || 'false',
    files,
  });

  btn.disabled = false;
  btn.textContent = '事前登録する';

  if (res.ok) {
    showState('success');
    return;
  }

  if (res.error === 'already_registered') {
    banner.textContent = 'この氏名・大学名ではすでに事前登録済みです。内容変更は事務局へご連絡ください。';
    banner.classList.add('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  banner.textContent = res.message || '送信に失敗しました。時間をおいて再度お試しください。';
  banner.classList.add('show');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── 日付ユーティリティ ────────────────────────────
function fmtDay_(date) {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${date.getMonth() + 1}月${date.getDate()}日（${days[date.getDay()]}）`;
}

function replaceDays_(d1, d2) {
  // テキストノードを走査して「土曜日」「日曜日」を置換
  function walk(node) {
    if (node.nodeType === 3) {
      const t = node.textContent;
      const r = t.replace(/土曜日/g, d1).replace(/日曜日/g, d2);
      if (r !== t) node.textContent = r;
    } else if (node.nodeType === 1 && node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
      node.childNodes.forEach(walk);
    }
  }
  const form = $('state-form');
  if (form) walk(form);

  // radio/checkbox の value も置換（GASへの送信値に反映）
  document.querySelectorAll('#state-form input[type="radio"], #state-form input[type="checkbox"]').forEach(inp => {
    if (inp.value.includes('土曜日') || inp.value.includes('日曜日')) {
      inp.value = inp.value.replace(/土曜日/g, d1).replace(/日曜日/g, d2);
    }
  });
}

// ── 大学候補リストを動的に構築 ──────────────────
// 並び順はGAS側でコード順（＝頭文字の五十音順）に整列済み。
function fillSchoolList_(schools) {
  const dl = document.getElementById('dl-universities');
  if (!dl) return;
  dl.innerHTML = schools.map(s => `<option value="${s.replace(/"/g, '&quot;')}"></option>`).join('');
}

// ── 状態切替 ────────────────────────────────────
function showState(state) {
  ['no-event', 'loading', 'not-open', 'form', 'success', 'error'].forEach(s => {
    const el = $('state-' + s);
    if (el) el.style.display = s === state ? 'block' : 'none';
  });
}
