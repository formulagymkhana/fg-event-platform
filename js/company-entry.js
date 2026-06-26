/**
 * FG Event Platform — 企業ブース出展申込フォーム
 *
 * 公開アクション: submitCompanyEntry (POST)
 * イベント解決: getCurrentEvent（当日or直近）で自動検出
 */

let pageEvent_ = null;

// メールアドレス確認欄のコピペ禁止
['f-email', 'f-email-confirm'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  ['paste', 'drop'].forEach(ev => el.addEventListener(ev, e => e.preventDefault()));
});

// デモ走行ラジオ → 詳細欄の表示切り替え
document.querySelectorAll('input[name="demo"]').forEach(r => {
  r.addEventListener('change', () => {
    const hasDemo = r.value.startsWith('あり');
    const detail = document.getElementById('row-demo-detail');
    if (detail) detail.classList.toggle('show', hasDemo);
  });
});

document.getElementById('btn-submit')?.addEventListener('click', handleSubmit_);

// ── 起動 ─────────────────────────────────────────
(async function init() {
  showState_('loading');

  const res = await FG_API.getCurrentEvent();

  if (res.ok && res.data) {
    pageEvent_ = res.data.eventId;
    const d = res.data;
    const label = d.eventName + (d.startDate ? '　' + d.startDate : '');
    setText_('event-label', label);
    showState_('form');
  } else {
    // イベントが見つからない場合でもフォームは表示（GAS側でも再チェック）
    setText_('event-label', '対象イベントが見つかりません');
    showState_('form');
  }
})();

// ── フォーム送信 ──────────────────────────────────
async function handleSubmit_() {
  clearErrors_();
  if (!validate_()) return;

  showState_('submitting');

  const params = {
    companyName: val_('f-company'),
    director:    val_('f-director'),
    contact:     val_('f-contact'),
    tel:         val_('f-tel'),
    contactTel:  val_('f-contact-tel'),
    email:       val_('f-email'),
    zip:         val_('f-zip'),
    address:     val_('f-address'),
    content:     val_('f-content'),
    booth:       checkedRadio_('booth'),
    boothNote:   val_('f-booth-note'),
    demo:        checkedRadio_('demo'),
    demoDetail:  val_('f-demo-detail'),
  };

  if (pageEvent_) params.event = pageEvent_;

  const res = await FG_API.post('submitCompanyEntry', params);

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

// ── バリデーション ────────────────────────────────
function validate_() {
  let ok = true;

  const require_ = (id, errId, msg) => {
    if (!val_(id).trim()) { showErr_(errId, id, msg); ok = false; }
  };

  require_('f-company',     'err-company',     '企業名・団体名を入力してください');
  require_('f-director',    'err-director',    '代表者名を入力してください');
  require_('f-contact',     'err-contact',     '担当者名を入力してください');
  require_('f-tel',         'err-tel',         '電話番号を入力してください');
  require_('f-contact-tel', 'err-contact-tel', '担当者連絡先を入力してください');

  const email = val_('f-email').trim();
  if (!email) {
    showErr_('err-email', 'f-email', 'メールアドレスを入力してください'); ok = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showErr_('err-email', 'f-email', '有効なメールアドレスを入力してください'); ok = false;
  }

  const emailConf = val_('f-email-confirm').trim();
  if (!emailConf) {
    showErr_('err-email-confirm', 'f-email-confirm', '確認のためもう一度入力してください'); ok = false;
  } else if (email !== emailConf) {
    showErr_('err-email-confirm', 'f-email-confirm', 'メールアドレスが一致しません'); ok = false;
  }

  const zip = val_('f-zip').trim();
  if (!zip) {
    showErr_('err-zip', 'f-zip', '郵便番号を入力してください'); ok = false;
  } else if (!/^\d{7}$/.test(zip)) {
    showErr_('err-zip', 'f-zip', 'ハイフンなし7桁の数字で入力してください'); ok = false;
  }

  require_('f-address', 'err-address', '住所を入力してください');
  require_('f-content', 'err-content', '出展内容を入力してください');

  if (!checkedRadio_('booth')) {
    showErr_('err-booth', null, '選択してください'); ok = false;
  }

  const demo = checkedRadio_('demo');
  if (!demo) {
    showErr_('err-demo', null, '選択してください'); ok = false;
  } else if (demo.startsWith('あり')) {
    require_('f-demo-detail', 'err-demo-detail', 'デモ走行の詳細を入力してください');
  }

  const consent = document.getElementById('f-consent');
  if (!consent?.checked) {
    showErr_('err-consent', null, '注意事項への同意が必要です');
    document.getElementById('consent-box')?.classList.add('error');
    ok = false;
  }

  if (!ok) {
    const banner = document.getElementById('form-error-banner');
    if (banner) { banner.textContent = '未入力または不備のある項目があります。'; banner.classList.add('show'); }
  }

  return ok;
}

// ── ユーティリティ ────────────────────────────────
function val_(id) {
  return (document.getElementById(id)?.value || '').trim();
}

function setText_(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function checkedRadio_(name) {
  const el = document.querySelector('input[name="' + name + '"]:checked');
  return el ? el.value : '';
}

function showErr_(errId, inputId, msg) {
  const err = document.getElementById(errId);
  if (err) { if (msg) err.textContent = msg; err.classList.add('show'); }
  if (inputId) {
    const inp = document.getElementById(inputId);
    if (inp) inp.classList.add('error');
  }
}

function clearErrors_() {
  document.querySelectorAll('.field-err').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  const banner = document.getElementById('form-error-banner');
  if (banner) banner.classList.remove('show');
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
