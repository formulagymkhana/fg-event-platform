/**
 * FG Event Platform — QRカード表示ロジック
 *
 * card.htmlのメイン処理。
 * 1. URLのtokenパラメータでGASから学生情報を取得
 * 2. カードを描画
 * 3. tokenをcookieに保存(スタンプラリー用)
 * config.js と api.js より後に読み込むこと。
 */

// 属性ごとのバナー背景色・文字色
const CAT_COLORS = {
  'Aドライバー':             { bg:'#0B2545', tx:'#E8F0FF' },
  'Bドライバー':             { bg:'#0B2545', tx:'#E8F0FF' },
  'Cドライバー':             { bg:'#0B2545', tx:'#E8F0FF' },
  '女子クラスドライバー':     { bg:'#5C0A2E', tx:'#FFE8F2' },
  'ドライバー登録メカニック': { bg:'#0B2545', tx:'#E8F0FF' },
  'メカニック':               { bg:'#1A3D00', tx:'#E8FFD4' },
  '応援学生':                 { bg:'#2A2A2A', tx:'#F0F0F0' },
  '一般参加学生':             { bg:'#3A3A3A', tx:'#F0F0F0' },
};

// 現在表示中の学生データ(他の関数から参照するためグローバルに保持)
let _d = null;

// ── 起動処理 ──────────────────────────────────────

(async () => {
  // URLからtokenを取得
  const token = FG_API.getParam('token');
  if (!token) {
    showError('URLが正しくありません。', 'QRコードを再度スキャンしてください。');
    return;
  }

  // スタンプラリー用にcookieへ保存
  FG_API.saveTokenToCookie(token);

  // GAS APIから学生情報を取得
  const res = await FG_API.getStudent(token);
  if (!res.ok) {
    if (res.error === 'expired') {
      showError('公開期限が終了しました。', '期限内に登録された企業はメールからアクセスできます。');
    } else if (res.error === 'timeout') {
      showError('接続がタイムアウトしました。', 'もう一度お試しください。');
    } else {
      showError('QRコードが無効です。', 'もう一度スキャンしてください。');
    }
    return;
  }

  _d = res.data;
  render(_d);
})();

// ── カード描画 ────────────────────────────────────

/** 取得した学生データをカードに反映する */
function render(d) {
  const col = CAT_COLORS[d.category] || { bg:'#0B2545', tx:'#E8F0FF' };

  // イベント名(末尾2単語を短縮表示)
  const parts = (d.eventName || '').split(' ');
  $('event-name').textContent = parts.slice(-2).join(' ');

  // 属性バナー(背景色・文字色を属性に応じて変更)
  $('cat-banner').style.background = col.bg;
  $('sid-label').style.color = col.tx;
  $('sid').style.color       = col.tx;
  $('sid').textContent       = d.studentId;
  $('cat-badge').textContent = d.category;
  $('cat-badge').style.color = col.tx;

  // 氏名・大学
  $('furigana').textContent   = d.furigana;
  $('name').textContent       = d.name;
  $('school').textContent     = d.school;
  $('school-sub').textContent = d.department + '　' + d.year;

  // 詳細情報
  $('club-years').textContent = d.clubYears;
  $('prefecture').textContent = d.prefecture;
  $('birthday').textContent   = d.birthday;
  $('email').textContent      = d.email;

  // 公開期限をアコーディオン内に表示
  if (d.deadline) {
    const dl  = new Date(d.deadline);
    const fmt = `${dl.getFullYear()}/${dl.getMonth()+1}/${dl.getDate()} `
              + `${pad(dl.getHours())}:${pad(dl.getMinutes())}`;
    $('view-deadline').textContent = '公開期限: ' + fmt;
  }

  // ローディングを非表示にしてカードを表示
  $('state-loading').style.display = 'none';
  $('state-card').style.display    = 'block';
}

// ── コピー操作 ────────────────────────────────────

/** メールアドレス行タップ時: クリップボードにコピーして視覚フィードバック */
function copyEmail() {
  if (!_d) return;
  clip(_d.email);
  const row = $('email-row'), val = $('email'), badge = $('copy-badge');
  val.className        = 'email-copied';
  val.textContent      = '✓ コピーしました';
  badge.style.display  = 'none';
  row.style.background = '#F0FFF6';
  // 2.2秒後に元の表示に戻す
  setTimeout(() => {
    val.className        = 'email-value';
    val.textContent      = _d.email;
    badge.style.display  = '';
    row.style.background = '';
  }, 2200);
}

/** 全項目をタブ区切りでコピー(Excelに直接貼り付け可能なフォーマット) */
function copyAll() {
  if (!_d) return;
  const text = [
    'Student ID\t'        + _d.studentId,
    '属性\t'              + _d.category,
    '氏名\t'              + _d.name,
    'ふりがな\t'          + _d.furigana,
    '学校名\t'            + _d.school,
    '学部学科\t'          + _d.department,
    '学年\t'              + _d.year,
    '自動車部の在籍年数\t' + _d.clubYears,
    '住所（都道府県）\t'   + _d.prefecture,
    '生年月日\t'          + _d.birthday,
    'メールアドレス\t'    + _d.email,
  ].join('\n');
  clip(text);
  const btn = $('copy-all-btn'), pre = $('copy-preview');
  btn.textContent   = '✓ コピーしました';
  btn.classList.add('copied');
  pre.textContent   = text;
  pre.style.display = 'block';
  setTimeout(() => {
    btn.textContent = '一覧をコピー（全項目）';
    btn.classList.remove('copied');
  }, 2200);
}

// ── アコーディオン ────────────────────────────────

/** 後日再閲覧フォームの開閉 */
function toggleAcc() {
  $('acc-body').classList.toggle('open');
  $('acc-arrow').classList.toggle('open');
}

/** メール入力時: @が含まれていれば送信ボタンを活性化 */
function onViewEmail(v) {
  const ok  = v.includes('@');
  const btn = $('view-btn');
  btn.disabled = !ok;
  btn.classList.toggle('active', ok);
}

/** 企業メール登録: GASの閲覧ログに記録する */
async function saveView() {
  const email = $('view-email').value;
  if (!email.includes('@') || !_d) return;
  const btn = $('view-btn');
  btn.disabled    = true;
  btn.textContent = '登録中...';
  await FG_API.saveViewLog(FG_API.getParam('token'), 'manual', email);
  $('view-form').style.display = 'none';
  const saved = $('view-saved');
  saved.textContent   = '✓ ' + email + ' で記録しました';
  saved.style.display = 'block';
}

// ── ユーティリティ ────────────────────────────────

/** IDショートカット */
const $ = id => document.getElementById(id);

/** 数値を2桁ゼロ埋め */
const pad = n => String(n).padStart(2, '0');

/** クリップボードにテキストをコピー(非対応ブラウザはフォールバック) */
function clip(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => clipFallback(text));
  } else {
    clipFallback(text);
  }
}

/** clipboard API非対応ブラウザ向けのコピー処理 */
function clipFallback(text) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

/** エラー画面を表示してローディングを非表示にする */
function showError(title, msg) {
  $('state-loading').style.display = 'none';
  $('state-error').style.display   = 'flex';
  $('error-title').textContent = title;
  $('error-msg').textContent   = msg;
}
