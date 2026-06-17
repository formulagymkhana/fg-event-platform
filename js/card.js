/**
 * FG Event Platform — QRカード表示ロジック(企業向け)
 *
 * card.htmlのメイン処理。
 * URLのcardTokenパラメータでGASから学生情報を取得してカードを描画する。
 *
 * ⚠ cardTokenはcookieに保存しない。
 *    企業担当者のスマホで開くページのため、
 *    学生のスタンプラリー認証には使わない。
 *
 * config.js と api.js より後に読み込むこと。
 */

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

let _d = null;

// ── イベントリスナー(CSP対応: onclickは使わない) ──
document.getElementById('email-row')?.addEventListener('click', copyEmail);
document.getElementById('copy-all-btn')?.addEventListener('click', copyAll);
document.getElementById('btn-company-scan')?.addEventListener('click', openCompanyScan);
document.getElementById('btn-scan-cancel')?.addEventListener('click', closeCompanyScan);

(async () => {
  const token   = FG_API.getParam('token');
  const vkParam = FG_API.getParam('viewkey');
  // ページURLのevent(あれば)。学生情報・自動記録のイベント文脈に使う。
  // 会期外や複数大会の取り違えを防ぐため、URLに event があれば優先する。
  const pageEvent = FG_API.getParam('event') || null;

  // ── 企業QR登録モード(card.html?viewkey=...&event=...) ──
  // 企業QRを通常カメラで読むとここに入る。viewKeyをcookieへ保存し、
  // 以降の学生QR閲覧を自動記録できるようにする。
  if (vkParam) {
    const res = await FG_API.resolveViewKey(vkParam, pageEvent);
    if (res.ok) {
      FG_API.saveCompanyViewKey(vkParam);
      try { localStorage.setItem('fg_company_name', res.data.companyName); } catch (e) {}
      if (!token) {
        $('state-loading').style.display = 'none';
        $('company-done-name').textContent = res.data.companyName;
        $('state-company').style.display = 'flex';
        return;
      }
      // token併記の場合は登録だけ済ませて通常の学生表示へ続行
    } else if (!token) {
      showError('企業QRが無効です。', '配布された企業QRを再度ご確認ください。');
      return;
    }
  }

  if (!token) {
    showError('URLが正しくありません。', 'QRコードを再度スキャンしてください。');
    return;
  }

  // ⚠ cardTokenのcookie保存は行わない(企業の端末で開くため)

  const res = await FG_API.getStudent(token, pageEvent);
  if (!res.ok) {
    if (res.error === 'expired') {
      showError('公開期限が終了しました。', '期限内に登録された企業はメールからアクセスできます。');
    } else if (res.error === 'timeout') {
      showError('接続がタイムアウトしました。', 'もう一度お試しください。');
    } else if (res.error === 'no_active_event') {
      showError('現在開催中のイベントがありません。', '開催日時をご確認ください。');
    } else if (res.error === 'missing_event') {
      showError('イベントを特定できませんでした。', 'スタッフにお問い合わせください。');
    } else {
      showError('QRコードが無効です。', 'もう一度スキャンしてください。');
    }
    return;
  }

  _d = res.data;
  render(_d);
  autoViewLog_(token, pageEvent);
})();

/**
 * 企業cookie(viewKey)があれば閲覧ログを自動記録し、
 * なければ企業QR読み取りの案内を表示する。
 * 記録は裏で実行し、学生情報の表示は妨げない。
 */
function autoViewLog_(token, pageEvent) {
  const vk = FG_API.getCompanyViewKey();
  if (vk) {
    FG_API.saveViewLogAuto(token, vk, pageEvent);  // fire-and-forget(失敗しても表示は維持)
    showCompanyRegistered_();
  } else {
    $('company-section').style.display = 'block';
  }
}

function showCompanyRegistered_() {
  let name = '';
  try { name = localStorage.getItem('fg_company_name') || ''; } catch (e) {}
  const el = $('company-registered');
  el.textContent = name
    ? `✓ ${name} の閲覧リストに自動記録されています`
    : '✓ 閲覧リストに自動記録されています';
  el.style.display = 'block';
  $('company-box').style.display = 'none';
  $('company-section').style.display = 'block';
}

function render(d) {
  const col = CAT_COLORS[d.category] || { bg:'#0B2545', tx:'#E8F0FF' };
  const parts = (d.eventName || '').split(' ');
  $('event-name').textContent = parts.slice(-2).join(' ');

  $('cat-banner').style.background = col.bg;
  $('sid-label').style.color = col.tx;
  $('sid').style.color       = col.tx;
  $('sid').textContent       = d.studentId;
  $('cat-badge').textContent = d.category;
  $('cat-badge').style.color = col.tx;

  $('furigana').textContent   = d.furigana;
  $('name').textContent       = d.name;
  $('school').textContent     = d.school;
  $('school-sub').textContent = d.department + '　' + d.year;

  $('club-years').textContent = d.clubYears;
  $('prefecture').textContent = d.prefecture;
  $('birthday').textContent   = d.birthday;
  $('email').textContent      = d.email;


  $('state-loading').style.display = 'none';
  $('state-card').style.display    = 'block';
}

function copyEmail() {
  if (!_d) return;
  clip(_d.email);
  const row = $('email-row'), val = $('email'), badge = $('copy-badge');
  val.className        = 'email-copied';
  val.textContent      = '✓ コピーしました';
  badge.style.display  = 'none';
  row.style.background = '#F0FFF6';
  setTimeout(() => {
    val.className        = 'email-value';
    val.textContent      = _d.email;
    badge.style.display  = '';
    row.style.background = '';
  }, 2200);
}

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

// ── 企業QR読み取りオーバーレイ ─────────────────────
// ★学生情報を画面に残したままカメラを起動する(ページ遷移禁止)。
//   読み取り成功・キャンセルのいずれでも元の学生情報表示に戻る。

let _scanStream = null;
let _scanRafId  = null;
let _scanCanvas = null;
let _scanCtx    = null;
let _scanPaused = false;

async function openCompanyScan() {
  const overlay = $('scan-overlay');
  overlay.style.display = 'flex';
  setOverlayMsg_('', '');
  _scanPaused = false;
  _scanCanvas = document.createElement('canvas');
  _scanCtx    = _scanCanvas.getContext('2d');

  try {
    _scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
    });
    const video = $('scan-video');
    video.srcObject = _scanStream;
    await video.play();
    _scanCanvas.width  = video.videoWidth  || 640;
    _scanCanvas.height = video.videoHeight || 480;
    scanLoop_(video);
  } catch (err) {
    setOverlayMsg_('カメラを起動できませんでした。カメラのアクセスを許可してください。', 'err');
  }
}

function closeCompanyScan() {
  stopScanCamera_();
  $('scan-overlay').style.display = 'none';
  // 学生情報はそのまま残っている(オーバーレイを閉じるだけ)
}

function stopScanCamera_() {
  if (_scanRafId)  { cancelAnimationFrame(_scanRafId); _scanRafId = null; }
  if (_scanStream) { _scanStream.getTracks().forEach(t => t.stop()); _scanStream = null; }
}

function scanLoop_(video) {
  if (!_scanStream) return;
  if (!_scanPaused && video.readyState === video.HAVE_ENOUGH_DATA) {
    _scanCtx.drawImage(video, 0, 0, _scanCanvas.width, _scanCanvas.height);
    const img  = _scanCtx.getImageData(0, 0, _scanCanvas.width, _scanCanvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (code) {
      onCompanyQR_(code.data);
    }
  }
  _scanRafId = requestAnimationFrame(() => scanLoop_(video));
}

async function onCompanyQR_(qrData) {
  // 企業QR = card.html?viewkey=<viewKey>&event=<eventId> のURL
  let vk = null, qrEvent = null;
  try {
    const u = new URL(qrData);
    vk      = u.searchParams.get('viewkey');
    qrEvent = u.searchParams.get('event');  // 企業QRが属するイベント
  } catch (e) { /* URLでない */ }

  if (!vk) {
    setOverlayMsg_('企業QRではありません。配布された企業QRを読み取ってください。', 'err');
    return; // スキャン継続
  }

  _scanPaused = true;
  setOverlayMsg_('確認中...', '');

  let res;
  try {
    res = await FG_API.resolveViewKey(vk, qrEvent);
  } catch (e) {
    setOverlayMsg_('通信エラーが発生しました。もう一度お試しください。', 'err');
    _scanPaused = false;
    return;
  }
  if (!res.ok) {
    if (res.error === 'timeout') {
      setOverlayMsg_('接続がタイムアウトしました。もう一度お試しください。', 'err');
    } else if (res.error === 'network_error') {
      setOverlayMsg_('通信エラーが発生しました。もう一度お試しください。', 'err');
    } else {
      setOverlayMsg_('企業QRが無効です。もう一度お試しください。', 'err');
    }
    _scanPaused = false;
    return;
  }

  // cookie保存 → 今表示中の学生を記録 → オーバーレイを閉じる
  FG_API.saveCompanyViewKey(vk);
  try { localStorage.setItem('fg_company_name', res.data.companyName); } catch (e) {}

  // 今表示中の学生の記録は「学生ページのイベント文脈」で行う
  const token     = FG_API.getParam('token');
  const pageEvent = FG_API.getParam('event') || null;
  if (token) FG_API.saveViewLogAuto(token, vk, pageEvent);  // 今表示中の学生を記録

  setOverlayMsg_(`✓ ${res.data.companyName} として登録しました`, 'ok');
  setTimeout(() => {
    closeCompanyScan();
    showCompanyRegistered_();  // 案内をやめて記録中表示へ(学生情報はそのまま)
  }, 1200);
}

function setOverlayMsg_(text, kind) {
  const el = $('overlay-msg');
  el.textContent = text;
  el.className = 'overlay-msg' + (kind ? ' ' + kind : '');
}

const $ = id => document.getElementById(id);
const pad = n  => String(n).padStart(2, '0');

function clip(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => clipFallback(text));
  } else {
    clipFallback(text);
  }
}

function clipFallback(text) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

function showError(title, msg) {
  $('state-loading').style.display = 'none';
  $('state-error').style.display   = 'flex';
  $('error-title').textContent = title;
  $('error-msg').textContent   = msg;
}
