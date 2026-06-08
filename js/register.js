/**
 * FG Event Platform — 当日飛び込み参加登録ロジック
 *
 * URL形式: register.html?code=[walkInCode]
 *   code … 会場掲示QRコードに埋め込まれた認証コード(GASスクリプトプロパティ WALK_IN_CODE)
 *
 * 登録後は stampToken を cookie に保存し、遊び方ガイドを表示。
 */

// ── イベントリスナー ──────────────────────────────
document.getElementById('btn-submit')?.addEventListener('click', handleSubmit);
document.getElementById('btn-retry')?.addEventListener('click', () => {
  showState('form');
});

// ── 起動 ──────────────────────────────────────────
(async function init() {
  const code = FG_API.getParam('code');
  if (!code) { showState('no-code'); return; }

  showState('loading');

  // 今日のイベント情報を取得して来場日バッジに表示
  const res = await FG_API.getCurrentEvent();
  if (res.ok && res.data) {
    const d = res.data;
    const label = formatEventDate_(d.startDate, d.eventName);
    setText('event-date-label', label);
  } else {
    // イベントが見つからない場合もフォームは表示する(GAS側でも再チェック)
    setText('event-date-label', formatToday_());
  }

  showState('form');
})();

// ── フォーム送信 ──────────────────────────────────
async function handleSubmit() {
  clearErrors_();
  if (!validateForm_()) return;

  const code = FG_API.getParam('code');
  showState('submitting');

  const params = {
    code,
    name:       val_('f-name').trim(),
    furigana:   val_('f-furigana').trim(),
    school:     val_('f-school').trim(),
    department: val_('f-department').trim(),
    year:       val_('f-year'),
    gender:     val_('f-gender'),          // 性別（プルダウン）
    clubYears:  val_('f-club-years'),
    birthday:   val_('f-birthday'),
    email:      val_('f-email').trim(),
    phone:      val_('f-phone').trim(),
    prefecture: val_('f-prefecture'),
    competing:  radioVal_('competing'),    // 所属校が出場するか（記録対象に）
    // 同意記録（送信時点で全てチェック必須なので通常 'true'）
    rulesConsent:   document.getElementById('cb-rules').checked   ? 'true' : 'false',
    snsConsent:     document.getElementById('cb-media').checked   ? 'true' : 'false',
    privacyConsent: document.getElementById('cb-privacy').checked ? 'true' : 'false',
  };

  const res = await FG_API.registerWalkIn(params);

  if (res.ok) {
    FG_API.saveStampToken(res.data.stampToken);
    renderSuccess_(res.data);
    showState('success');
  } else if (res.error === 'already_registered') {
    // 同日・同一学生の重複登録 → 既存stampTokenを再利用
    FG_API.saveStampToken(res.data.stampToken);
    renderSuccess_(res.data);
    showState('success');
  } else {
    showState('error');
    const msgs = {
      no_active_event: '本日開催のイベントが見つかりません。スタッフにお問い合わせください。',
      invalid_code:    'URLが正しくありません。会場のQRコードから再度アクセスしてください。',
      missing_params:  '入力内容に不足があります。フォームを確認してください。',
      timeout:         '通信がタイムアウトしました。電波の良い場所で再試行してください。',
    };
    setText('error-title', 'エラーが発生しました');
    setText('error-msg', msgs[res.error] || res.message || 'もう一度お試しください。');
  }
}

// ── バリデーション ────────────────────────────────
function validateForm_() {
  let ok = true;

  // 氏名: 入力必須 + 姓名の間にスペース（フォーム規則: 半角/全角どちらも可）
  const name = val_('f-name').trim();
  if (!name) {
    setErrText_('err-name', '氏名を入力してください');
    showErr_('err-name', 'f-name'); ok = false;
  } else if (!/.+[ 　].+/.test(name)) {
    setErrText_('err-name', '姓と名の間にスペースを入力してください');
    showErr_('err-name', 'f-name'); ok = false;
  }

  // ふりがな: 必須 + ひらがな + 姓名の間にスペース（半角/全角どちらも可）
  const furigana = val_('f-furigana').trim();
  if (!furigana) {
    setErrText_('err-furigana', 'ふりがなを入力してください');
    showErr_('err-furigana', 'f-furigana'); ok = false;
  } else if (!/^[ぁ-んー]+[ 　][ぁ-んー]+$/.test(furigana)) {
    setErrText_('err-furigana', 'ひらがなで「せい めい」のようにスペース区切りで入力してください');
    showErr_('err-furigana', 'f-furigana'); ok = false;
  }

  // 大学名: 必須 + 「大学」を含む + 100文字以内（フォーム規則）
  const school = val_('f-school').trim();
  if (!school) {
    setErrText_('err-school', '大学名を入力してください');
    showErr_('err-school', 'f-school'); ok = false;
  } else if (school.length > 100) {
    setErrText_('err-school', '大学名は100文字以内で入力してください');
    showErr_('err-school', 'f-school'); ok = false;
  } else if (!school.includes('大学')) {
    setErrText_('err-school', '大学名または大学校名を正しく入力してください');
    showErr_('err-school', 'f-school'); ok = false;
  }

  // 学部学科: 必須（フォーム規則）
  if (!val_('f-department').trim()) {
    showErr_('err-department', 'f-department'); ok = false;
  }
  if (!val_('f-year')) {
    showErr_('err-year', 'f-year'); ok = false;
  }
  // 自動車部所属年数: 必須（フォーム規則。非所属者は「その他・自動車部所属ではない」を選択）
  if (!val_('f-club-years')) {
    showErr_('err-club-years', 'f-club-years'); ok = false;
  }
  // 性別: 必須（プルダウン）
  if (!val_('f-gender')) {
    showErr_('err-gender', 'f-gender'); ok = false;
  }
  if (!val_('f-birthday')) {
    showErr_('err-birthday', 'f-birthday'); ok = false;
  }
  const email = val_('f-email').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showErr_('err-email', 'f-email'); ok = false;
  }
  // 電話番号: 必須 + ハイフン無し半角数字のみ（フォーム規則）
  const phone = val_('f-phone').trim();
  if (!phone) {
    setErrText_('err-phone', '電話番号を入力してください');
    showErr_('err-phone', 'f-phone'); ok = false;
  } else if (!/^[0-9]{10,11}$/.test(phone)) {
    setErrText_('err-phone', 'ハイフン無しの半角数字で入力してください（10〜11桁）');
    showErr_('err-phone', 'f-phone'); ok = false;
  }
  // 住所(都道府県): 必須（フォーム規則）
  if (!val_('f-prefecture')) {
    showErr_('err-prefecture', 'f-prefecture'); ok = false;
  }
  // 大会規則書・誓約書同意: 必須（フォーム規則）
  if (!document.getElementById('cb-rules').checked) {
    showErr_('err-rules');
    document.getElementById('cb-wrap-rules').classList.add('error'); ok = false;
  }
  if (!document.getElementById('cb-media').checked) {
    showErr_('err-media');
    document.getElementById('cb-wrap-media').classList.add('error'); ok = false;
  }
  if (!document.getElementById('cb-privacy').checked) {
    showErr_('err-privacy');
    document.getElementById('cb-wrap-privacy').classList.add('error'); ok = false;
  }

  if (!ok) {
    const banner = document.getElementById('form-error-banner');
    banner.textContent = '入力内容を確認してください。';
    banner.classList.add('show');
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return ok;
}

function showErr_(errId, inputId) {
  const el = document.getElementById(errId);
  if (el) el.classList.add('show');
  if (inputId) {
    const inp = document.getElementById(inputId);
    if (inp) inp.classList.add('error');
  }
}

/** エラーメッセージ文言を動的に差し替える */
function setErrText_(errId, text) {
  const el = document.getElementById(errId);
  if (el) el.textContent = text;
}

/** name属性で指定したラジオボタンの選択値を返す（未選択は ''） */
function radioVal_(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : '';
}

function clearErrors_() {
  document.querySelectorAll('.field-err').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('input.error, select.error').forEach(el => el.classList.remove('error'));
  document.querySelectorAll('.consent-box.error').forEach(el => el.classList.remove('error'));
  const banner = document.getElementById('form-error-banner');
  if (banner) banner.classList.remove('show');
}

// ── 成功画面描画 ──────────────────────────────────
function renderSuccess_(d) {
  const count     = d.stampCount     || 0;
  const threshold = d.prizeThreshold || 15;
  const prizeNum  = d.prizeCount     || 1;
  const pct = Math.min(100, Math.round((count / threshold) * 100));
  document.getElementById('result-bar').style.width = pct + '%';
  setText('result-count', `${count} / ${threshold} 個`);
  setText('guide-goal',  String(threshold));
  setText('guide-count', String(prizeNum));
}

// ── 日付フォーマット ──────────────────────────────
function formatEventDate_(dateStr, eventName) {
  if (!dateStr) return formatToday_();
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return formatToday_();
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
  } catch (e) { return formatToday_(); }
}

function formatToday_() {
  const d = new Date();
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
}

// ── ユーティリティ ────────────────────────────────
function showState(state) {
  ['no-code', 'loading', 'form', 'submitting', 'success', 'error'].forEach(s => {
    const el = document.getElementById('state-' + s);
    if (el) el.style.display = s === state ? 'block' : 'none';
  });
}
function val_(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
