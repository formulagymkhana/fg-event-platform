/**
 * FG Event Platform — 企業ブース出展申込フォーム（ステップ式）
 */

let pageEvent_ = null;
let currentStep_ = 1;
const TOTAL_STEPS = 5;

// ── 初期化 ─────────────────────────────────────────
(async function init() {
  showState_('loading');

  // URL param から event= を取得（管理画面リンクで付与）
  const eventParam = FG_API.getParam('event');
  if (eventParam) {
    pageEvent_ = eventParam;
    const res = await FG_API.getEventList();
    if (res.ok && res.data && res.data.events) {
      const ev = res.data.events.find(e => e.eventId === eventParam);
      setText_('event-label', ev ? (ev.name || ev.eventId) : eventParam);
    } else {
      setText_('event-label', eventParam);
    }
  } else {
    const res = await FG_API.getCurrentEvent();
    if (res.ok && res.data) {
      pageEvent_ = res.data.eventId;
      const d = res.data;
      setText_('event-label', d.eventName + (d.startDate ? '　' + d.startDate : ''));
    } else {
      setText_('event-label', '対象イベントが見つかりません（担当者から送付されたリンクを使用してください）');
    }
  }

  // コピペ禁止
  ['f-email', 'f-email-confirm'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    ['paste', 'drop'].forEach(ev => el.addEventListener(ev, e => e.preventDefault()));
  });


  // デモ走行 → 詳細欄の表示切り替え
  document.querySelectorAll('input[name="demo"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('row-demo-detail')?.classList.toggle('show', r.value === 'あり');
    });
  });

  // ステッパーボタン（委任）
  document.addEventListener('click', e => {
    const btn = e.target.closest('.stepper-btn');
    if (!btn) return;
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const delta = parseInt(btn.dataset.delta, 10);
    const min = parseInt(input.min ?? '0', 10);
    const max = parseInt(input.max ?? '999', 10);
    const cur = parseInt(input.value || '0', 10) || 0;
    input.value = Math.min(max, Math.max(min, cur + delta));
  });

  // ナビゲーション
  document.getElementById('btn-s1-next')?.addEventListener('click', () => tryNext_(1));
  document.getElementById('btn-s2-back')?.addEventListener('click', () => showStep_(1));
  document.getElementById('btn-s2-next')?.addEventListener('click', () => tryNext_(2));
  document.getElementById('btn-s3-back')?.addEventListener('click', () => showStep_(2));
  document.getElementById('btn-s3-next')?.addEventListener('click', () => tryNext_(3));
  document.getElementById('btn-s4-back')?.addEventListener('click', () => showStep_(3));
  document.getElementById('btn-s4-next')?.addEventListener('click', () => tryNext_(4));
  document.getElementById('btn-s5-back')?.addEventListener('click', () => showStep_(4));
  document.getElementById('btn-submit')?.addEventListener('click', handleSubmit_);

  showState_('form');
  showStep_(1);
})();

// ── ステップ表示 ────────────────────────────────────
function showStep_(n) {
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const el = document.getElementById('step-' + i);
    if (el) el.style.display = i === n ? '' : 'none';
  }
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const dot = document.getElementById('sp-' + i);
    if (!dot) continue;
    dot.classList.toggle('active', i === n);
    dot.classList.toggle('done', i < n);
  }
  for (let i = 1; i < TOTAL_STEPS; i++) {
    const line = document.getElementById('sl-' + i);
    if (line) line.classList.toggle('done', i < n);
  }
  clearErrors_();
  currentStep_ = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function tryNext_(step) {
  clearErrors_();
  if (!validateStep_(step)) return;
  showStep_(step + 1);
}

// ── バリデーション ──────────────────────────────────
function validateStep_(step) {
  const validators = { 1: v1_, 2: v2_, 3: v3_, 4: () => true, 5: v5_ };
  const ok = (validators[step] || (() => true))();
  if (!ok) {
    const firstErr = document.querySelector('#step-' + step + ' .field-err.show');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return ok;
}

function v1_() {
  let ok = true;
  const req = (id, errId, msg) => { if (!val_(id)) { showErr_(errId, id, msg); ok = false; } };
  req('f-company',      'err-company',      '企業名（正式）を入力してください');
  req('f-company-short','err-company-short','社名略称を入力してください');
  req('f-director',     'err-director',     '代表者名を入力してください');
  req('f-contact',      'err-contact',      '担当者名を入力してください');
  req('f-tel',          'err-tel',          '電話番号を入力してください');
  req('f-contact-tel',  'err-contact-tel',  '担当者連絡先を入力してください');
  return ok;
}

function v2_() {
  let ok = true;
  const email = val_('f-email');
  if (!email) {
    showErr_('err-email', 'f-email', 'メールアドレスを入力してください'); ok = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showErr_('err-email', 'f-email', '有効なメールアドレスを入力してください'); ok = false;
  }
  const conf = val_('f-email-confirm');
  if (!conf) {
    showErr_('err-email-confirm', 'f-email-confirm', '確認のためもう一度入力してください'); ok = false;
  } else if (email !== conf) {
    showErr_('err-email-confirm', 'f-email-confirm', 'メールアドレスが一致しません'); ok = false;
  }
  const zip = val_('f-zip');
  if (!zip) {
    showErr_('err-zip', 'f-zip', '郵便番号を入力してください'); ok = false;
  } else if (!/^\d{7}$/.test(zip)) {
    showErr_('err-zip', 'f-zip', 'ハイフンなし7桁の数字で入力してください'); ok = false;
  }
  if (!val_('f-pref'))    { showErr_('err-pref',    'f-pref',    '都道府県を選択してください'); ok = false; }
  if (!val_('f-address')) { showErr_('err-address', 'f-address', '住所（市区町村以降）を入力してください'); ok = false; }
  return ok;
}

function v3_() {
  let ok = true;
  if (!checkedRadio_('booth')) { showErr_('err-booth', null, 'ブース区画を選択してください'); ok = false; }
  if (!checkedRadio_('demo'))  { showErr_('err-demo',  null, 'デモ走行を選択してください'); ok = false; }
  return ok;
}

function v5_() {
  const consent = document.getElementById('f-consent');
  if (!consent?.checked) {
    showErr_('err-consent', null, '注意事項への同意が必要です');
    document.getElementById('consent-box')?.classList.add('error');
    return false;
  }
  return true;
}

// ── 送信 ────────────────────────────────────────────
async function handleSubmit_() {
  clearErrors_();
  if (!v5_()) return;

  showState_('submitting');

  const params = {
    companyName:  val_('f-company'),
    companyShort: val_('f-company-short'),
    director:     val_('f-director').replace(/　/g, ' '),
    contact:      val_('f-contact').replace(/　/g, ' '),
    tel:          val_('f-tel'),
    contactTel:   val_('f-contact-tel'),
    email:        val_('f-email'),
    zip:          val_('f-zip'),
    prefecture:   val_('f-pref'),
    address:      val_('f-address'),
    content:      val_('f-content'),
    booth:        checkedRadio_('booth'),
    carCount:     num_('f-car-count'),
    demo:         checkedRadio_('demo'),
    demoDetail:   val_('f-demo-detail'),
    personPass:   num_('f-person-pass'),
    carPass:      num_('f-car-pass'),
    lunchSat:     num_('f-lunch-sat'),
    lunchSun:     num_('f-lunch-sun'),
    note:         val_('f-note'),
  };
  if (pageEvent_) params.event = pageEvent_;

  const res = await FG_API.submitCompanyEntry(params);

  if (res.ok) {
    showState_('success');
  } else {
    const msg = {
      no_active_event: '申込受付中のイベントが見つかりませんでした。',
      missing_params:  '入力に不備があります。',
    }[res.error] || 'エラーが発生しました。時間をおいて再度お試しください。（' + (res.error || '') + '）';
    showError_('申込に失敗しました', msg);
  }
}

// ── ユーティリティ ────────────────────────────────
function val_(id)  { return (document.getElementById(id)?.value || '').trim(); }
function num_(id)  { return parseInt(document.getElementById(id)?.value || '0', 10) || 0; }
function setText_(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function checkedRadio_(name) { return document.querySelector('input[name="' + name + '"]:checked')?.value || ''; }

function showErr_(errId, inputId, msg) {
  const err = document.getElementById(errId);
  if (err) { err.textContent = msg; err.classList.add('show'); }
  if (inputId) document.getElementById(inputId)?.classList.add('error');
}

function clearErrors_() {
  document.querySelectorAll('.field-err').forEach(el => { el.classList.remove('show'); el.textContent = ''; });
  document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  document.getElementById('consent-box')?.classList.remove('error');
  document.getElementById('form-error-banner')?.classList.remove('show');
}

function showState_(name) {
  ['loading', 'form', 'submitting', 'success', 'error'].forEach(s => {
    const el = document.getElementById('state-' + s);
    if (el) el.style.display = s === name ? '' : 'none';
  });
}

function showError_(title, msg) {
  setText_('err-title', title);
  setText_('err-msg', msg);
  showState_('error');
}
