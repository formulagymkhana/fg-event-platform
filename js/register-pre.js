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

(async () => {
  _event = FG_API.getParam('event');
  if (!_event) { showState('no-event'); return; }

  // イベント名をバッジ表示（取得失敗しても続行）
  try {
    const res = await FG_API.getEventList();
    if (res.ok) {
      const ev = (res.data.events || []).find(e => String(e.eventId) === String(_event));
      $('event-name-label').textContent = ev ? (ev.name || ev.eventId) : _event;
    } else {
      $('event-name-label').textContent = _event;
    }
  } catch (e) {
    $('event-name-label').textContent = _event;
  }

  showState('form');
})();

$('btn-submit')?.addEventListener('click', submitForm);

// ── バリデーション ──────────────────────────────
const NAME_RE  = /.+[ 　].+/;        // 姓と名の間にスペース
const PHONE_RE = /^[0-9]{10,11}$/;
const POSTAL_RE = /^[0-9]{7}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setErr(id, on) {
  const err = $('err-' + id);
  const field = $('f-' + id);
  if (err) err.classList.toggle('show', on);
  if (field) field.classList.toggle('error', on);
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
  fail('phone',      !PHONE_RE.test(d.phone));
  fail('postal',     !POSTAL_RE.test(d.postal));
  fail('prefecture', !d.prefecture);
  fail('address',    !d.address);

  // 参加区分
  const catErr = $('err-category');
  if (!d.category) { catErr.classList.add('show'); ok = false; }
  else catErr.classList.remove('show');

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
  if (!validate(d)) {
    banner.textContent = '未入力・不正な項目があります。赤色の箇所をご確認ください。';
    banner.classList.add('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const btn = $('btn-submit');
  btn.disabled = true;
  btn.textContent = '送信中...';

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

// ── 状態切替 ────────────────────────────────────
function showState(state) {
  ['no-event', 'loading', 'form', 'success', 'error'].forEach(s => {
    const el = $('state-' + s);
    if (el) el.style.display = s === state ? 'block' : 'none';
  });
}
