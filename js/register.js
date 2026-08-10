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

// メールアドレス欄はコピー＆ペースト・ドラッグ＆ドロップを禁止し、確実に手入力させる
['f-email', 'f-email-confirm'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  ['paste', 'drop'].forEach(ev => el.addEventListener(ev, e => e.preventDefault()));
});

// メアド重複警告（部活代表・共有アドレスの使い回し抑止）
let emailDupChecked_ = ''; // 直近で警告を表示したメアド
document.getElementById('f-email')?.addEventListener('blur', checkEmailDup_);
document.getElementById('f-email')?.addEventListener('input', () => {
  const sec = document.getElementById('sec-email-dup'); if (sec) sec.style.display = 'none';
  const ack = document.getElementById('f-email-dup-ack'); if (ack) ack.checked = false;
  const err = document.getElementById('err-email-dup-ack'); if (err) err.classList.remove('show');
  emailDupChecked_ = '';
});

async function checkEmailDup_() {
  const email = document.getElementById('f-email').value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  if (email.toLowerCase() === emailDupChecked_) return;
  if (!pageEvent_) return; // イベント未解決時はチェックを飛ばす
  try {
    const r = await FG_API.checkStudentEmailExists(pageEvent_, email);
    const sec = document.getElementById('sec-email-dup');
    if (r.ok && r.data && r.data.exists) {
      sec.style.display = '';
      emailDupChecked_ = email.toLowerCase();
    } else {
      sec.style.display = 'none';
      emailDupChecked_ = '';
    }
  } catch (e) {
    // 通信失敗時は警告を出さない（送信時にサーバー側で対応）
    document.getElementById('sec-email-dup').style.display = 'none';
    emailDupChecked_ = '';
  }
}


// 成功画面のマイページリンク組み立て用に、解決済みイベントIDを保持
let pageEvent_ = null;

// ── 起動 ──────────────────────────────────────────
(async function init() {
  showState('loading');

  const [eventRes, schoolRes] = await Promise.all([
    FG_API.getCurrentEvent(),
    FG_API.getSchoolList(),
  ]);

  // 今日のイベント情報を取得して来場日バッジに表示
  if (eventRes.ok && eventRes.data) {
    const d = eventRes.data;
    pageEvent_ = d.eventId || null;
    const label = formatEventDate_(d.startDate, d.eventName);
    setText('event-date-label', label);
    // 書類URL上書き（設定があればアンカーの href を差し替え）
    const du = d.docUrls || {};
    if (du.rulebook) { const a = document.getElementById('link-doc-rulebook'); if (a) a.href = du.rulebook; }
    if (du.pledge)   { const a = document.getElementById('link-doc-pledge');   if (a) a.href = du.pledge;   }
  } else {
    // イベントが見つからない場合もフォームは表示する(GAS側でも再チェック)
    setText('event-date-label', formatToday_());
  }

  if (schoolRes.ok) fillSchoolList_(schoolRes.data.schools || []);

  showState('form');
})();

// ── フォーム送信 ──────────────────────────────────
async function handleSubmit() {
  clearErrors_();
  if (!validateForm_()) return;

  showState('submitting');

  const params = {
    name:       val_('f-name').trim().replace(/　/g, ' '),
    furigana:   val_('f-furigana').trim().replace(/　/g, ' '),
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
    // 個人ページ(氏名+QR)リンクをメールに載せるための app/ ディレクトリ絶対URL
    appBase:    new URL('.', location.href).href,
    // メアド重複警告への同意（表示された場合のみtrueが送られる）
    emailDupAcknowledged: document.getElementById('f-email-dup-ack')?.checked ? 'true' : 'false',
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
  } else if (res.error === 'email_already_used') {
    // フロントの blur チェックが走らなかった場合の保険。警告を強制表示してフォームに戻す。
    showState('form');
    document.getElementById('sec-email-dup').style.display = '';
    emailDupChecked_ = params.email.toLowerCase();
    setErrText_('err-email-dup-ack', '個人アドレスであることに同意してください');
    showErr_('err-email-dup-ack', 'f-email-dup-ack');
    document.getElementById('sec-email-dup').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    showState('error');
    const msgs = {
      no_active_event: '本日開催のイベントが見つかりません。スタッフにお問い合わせください。',
      invalid_code:    'URLが正しくありません。会場のQRコードから再度アクセスしてください。',
      missing_params:  '入力内容に不足があります。フォームを確認してください。',
      timeout:         '通信がタイムアウトしました。電波の良い場所で再試行してください。',
      // 事務局が大学確定・統合を実行している最中はロック待ちで弾かれる。
      // 待てば通るので「エラー」ではなく再試行を促す文言にする。
      lock_timeout:    '現在混み合っています。30秒ほどおいて、もう一度「登録する」を押してください。',
    };
    // lock_timeout は「失敗」ではなく「今は混んでいる」。見出しまで
    // 「エラーが発生しました」にすると学生が諦めてしまうので変える。
    setText('error-title', res.error === 'lock_timeout' ? '混み合っています' : 'エラーが発生しました');
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
  // メールアドレス（確認）: 必須 + 上の入力と完全一致
  const emailConfirm = val_('f-email-confirm').trim();
  if (!emailConfirm) {
    setErrText_('err-email-confirm', '確認のためもう一度入力してください');
    showErr_('err-email-confirm', 'f-email-confirm'); ok = false;
  } else if (email !== emailConfirm) {
    setErrText_('err-email-confirm', 'メールアドレスが一致しません');
    showErr_('err-email-confirm', 'f-email-confirm'); ok = false;
  }
  // メアド重複警告が表示されている場合、同意チェックが必須
  const dupSec = document.getElementById('sec-email-dup');
  if (dupSec && dupSec.style.display !== 'none') {
    const acked = document.getElementById('f-email-dup-ack')?.checked;
    if (!acked) {
      showErr_('err-email-dup-ack', 'f-email-dup-ack'); ok = false;
    }
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
  const count     = d.stampCount    || 0;
  const unitSize  = d.prizeUnitSize || d.prizeThreshold || 5;
  const maxPrizes = d.maxPrizes     || d.prizeCount     || 3;
  const threshold = d.nextThreshold || (maxPrizes * unitSize);
  const pct = Math.min(100, Math.round((count / threshold) * 100));
  document.getElementById('result-bar').style.width = pct + '%';
  setText('result-count', `${count} / ${threshold} 個`);
  setText('guide-goal',  String(unitSize * maxPrizes));  // 全景品獲得に必要なスタンプ数
  setText('guide-count', String(maxPrizes));             // 獲得できる景品数

  // マイページ(氏名+QR)へのリンク。cardToken はサーバが返す。
  const link = document.getElementById('link-mypage');
  if (link && d.cardToken) {
    const ev = pageEvent_ ? `&event=${encodeURIComponent(pageEvent_)}` : '';
    link.href = `mypass.html?token=${encodeURIComponent(d.cardToken)}${ev}`;
  } else if (link) {
    link.style.display = 'none';
  }
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

// ── 大学候補リスト ────────────────────────────────
// 並び順はGAS側でコード順（＝頭文字の五十音順）に整列済み。
function fillSchoolList_(schools) {
  const dl = document.getElementById('dl-universities');
  if (!dl) return;
  dl.innerHTML = schools.map(s => `<option value="${s.replace(/"/g, '&quot;')}"></option>`).join('');
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
