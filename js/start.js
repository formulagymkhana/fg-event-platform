/**
 * FG Event Platform — スタンプラリー開始画面ロジック
 *
 * 起動パターン:
 *   A) Cookie有効 → 参加登録済み / 進行中 画面
 *   B) Cookie無効 → QRスキャン画面
 *
 * activateStamp の isNew フラグで初回登録(遊び方ガイド)と
 * 復帰(継続画面)を区別する。
 */

let _stream = null;
let _rafId  = null;
let _canvas = null;
let _ctx    = null;
let _jsqrPromise = null;   // jsQR(256KB)は初回スキャン時にのみ遅延読込

// ── イベントリスナー ──────────────────────────────

document.getElementById('btn-start')?.addEventListener('click', startScan);
document.getElementById('btn-cancel')?.addEventListener('click', cancelScan);
document.getElementById('btn-retry')?.addEventListener('click', () => showState('ready'));

// ── 起動 ──────────────────────────────────────────

function init() {
  // Cookie にstampTokenがある → 既存進捗を表示
  const existingStamp = FG_API.getStampToken();
  if (existingStamp) {
    loadExistingProgress(existingStamp);
    return;
  }
  // なければ QRスキャン待機
  showState('ready');
}
init();

// ブラウザの「戻る」でbfcache復元された場合、init を再実行する。
// （スキャンで付与済みのstampTokenを再評価し、QRボタンの再表示を防ぐ）
window.addEventListener('pageshow', (e) => {
  if (e.persisted) { stopCamera(); init(); }
});

// ── Cookie有効: 既存進捗を読み込む ─────────────────

async function loadExistingProgress(token) {
  const res = await FG_API.getStampProgress(token);
  if (res.ok) {
    if (res.data.exchanged) {
      // 交換済み → 完了メッセージ
      renderContinuing(res.data);
    } else {
      renderBar('already-bar', 'already-count', res.data);
      showState('already');
    }
  } else {
    // トークン無効(古いCookie等) → スキャン画面に倒す
    showState('ready');
  }
}

// ── QRスキャン ────────────────────────────────────

// jsQR を必要になった時だけ読み込む（初期ロードから256KBを除外）
function ensureJsQR() {
  if (window.jsQR) return Promise.resolve();
  if (_jsqrPromise) return _jsqrPromise;
  _jsqrPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '../js/vendor/jsQR.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('jsQR load failed'));
    document.head.appendChild(s);
  });
  return _jsqrPromise;
}

async function startScan() {
  showState('scanning');
  _canvas = document.createElement('canvas');
  _ctx    = _canvas.getContext('2d');

  try {
    // QRデコーダとカメラ権限を並行で準備
    const jsqrReady = ensureJsQR();
    _stream = await navigator.mediaDevices.getUserMedia({
      // ⚠ 学生QRは約120文字のURLを持つためセルが細かい。640x480では
      //   パスを少し離すとデコードできない。解像度を上げて余裕を持たせる。
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    const video = document.getElementById('scan-video');
    video.srcObject = _stream;
    await video.play();
    _canvas.width  = video.videoWidth  || 1280;
    _canvas.height = video.videoHeight || 720;
    await jsqrReady;   // デコーダ読込完了を待ってからループ開始
    scanLoop(video);
  } catch (err) {
    stopCamera();
    showState('error');
    setText('error-title', 'カメラを起動できませんでした');
    setText('error-msg', 'カメラのアクセスを許可してください。');
  }
}

function scanLoop(video) {
  if (!_stream) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    _ctx.drawImage(video, 0, 0, _canvas.width, _canvas.height);
    const img  = _ctx.getImageData(0, 0, _canvas.width, _canvas.height);
    // ⚠ attemptBoth にする。印刷物が白黒反転（暗い背景に白いQR）でも読めるようにするため。
    //   dontInvert のままだと反転印刷は永久に読めない。
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    if (code) { onQRFound(code.data); return; }
  }
  _rafId = requestAnimationFrame(() => scanLoop(video));
}

/**
 * QRの中身がトークン単体かどうか。
 * ⚠ 印刷されたパスのQRにはURLではなくトークンだけが入っている場合がある
 *   （2026-08-20に本番のパスで判明）。URLしか受け付けないと受付で全員が詰まる。
 *   cardToken は Utilities.getUuid() の36文字UUIDだが、印刷側の都合で
 *   別形式になることもあるため、UUIDに限定せず「URLではない英数字の塊」を許容する。
 *   ここを通ってもサーバーが存在確認するので、誤った文字列は invalid_token で弾かれる。
 */
function isLikelyToken_(v) {
  const s = String(v || '').trim();
  if (!s || /\s/.test(s)) return false;      // 空白を含むものはトークンではない
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return false;  // URLは対象外（上で処理済み）
  return /^[A-Za-z0-9_-]{16,64}$/.test(s);
}

async function onQRFound(qrData) {
  stopCamera();

  let cardToken = null;
  let qrEvent   = null;
  const raw = String(qrData || '').trim();
  try {
    const u  = new URL(raw);
    cardToken = u.searchParams.get('token');
    qrEvent   = u.searchParams.get('event');
  } catch (e) {}

  // ⚠ URLとして解釈できない／token が無い場合でも、中身がトークンそのもの
  //   （cardToken は Utilities.getUuid() の36文字UUID）なら受け付ける。
  //   印刷物のQRがURLではなくトークンだけを持つ場合に、受付で詰まらせないため。
  if (!cardToken && isLikelyToken_(raw)) {
    cardToken = raw;
  }

  if (!cardToken) {
    showState('error');
    setText('error-title', 'このQRコードは対応していません');
    setText('error-msg', '自分の学生QR名刺を読み取ってください。');
    return;
  }

  showState('loading');
  const res = await FG_API.activateStamp(cardToken, qrEvent);

  if (res.ok) {
    // NFCブースから来た場合（stamp.html が ?ct= を引き継ぐ）は、元のブースへ戻す。
    // 導線が無いと、登録は済んだのにスタンプを押さずに離脱してしまう。
    showBoothReturn_();
    FG_API.saveStampToken(res.data.stampToken);
    if (res.data.isNew) {
      // 初回登録 → 遊び方ガイドを表示
      renderBar('result-bar', 'result-count', res.data);
      const us = res.data.prizeUnitSize || res.data.prizeThreshold || 5;
      const mp = res.data.maxPrizes     || res.data.prizeCount     || 3;
      setText('guide-goal',  String(us * mp));   // 全景品獲得に必要なスタンプ数
      setText('guide-count', String(mp));        // 獲得できる景品数
      showState('success');
    } else {
      // 復帰(Cookie消失後の再スキャン) → 継続 or 交換済み画面
      renderContinuing(res.data);
    }
  } else if (res.error === 'no_active_event') {
    showState('error');
    setText('error-title', '現在開催中のイベントがありません');
    setText('error-msg', '開催日時をご確認ください。');
  } else if (res.error === 'missing_event') {
    showState('error');
    setText('error-title', 'イベントを特定できませんでした');
    setText('error-msg', 'スタッフにお問い合わせください。');
  } else if (res.error === 'stamp_closed') {
    // ⚠ 開始前・終了後をまとめて「受付時間外」と言う。開始前に「終了しました」と
    //   出すと、当日朝のテストで現場が混乱する。
    showState('error');
    setText('error-title', 'スタンプラリー受付時間外です');
    setText('error-msg', '受付時間内に、もう一度読み取ってください。ご不明な点はスタッフへお声掛けください。');
  } else if (res.error === 'event_inactive') {
    showState('error');
    setText('error-title', 'ただいま受付を停止しています');
    setText('error-msg', 'スタッフにお問い合わせください。');
  } else if (res.error === 'lock_timeout') {
    // 混み合っているだけで、待てば通る。「無効」と言って諦めさせない。
    showState('error');
    setText('error-title', '混み合っています');
    setText('error-msg', '30秒ほどおいて、もう一度読み取ってください。');
  } else if (res.error === 'timeout') {
    showState('error');
    setText('error-title', '接続がタイムアウトしました');
    setText('error-msg', '電波の良い場所で、もう一度読み取ってください。');
  } else if (res.error === 'invalid_token') {
    showState('error');
    setText('error-title', 'QRコードが無効です');
    setText('error-msg', '自分の学生QR名刺を読み取ってください。');
  } else {
    // ⚠ ここに来るものを「QRが無効」と決めつけない。原因が別（通信・サーバー）でも
    //   「無効」と出ると、正しいパスを持つ学生が受付でつまずく。
    showState('error');
    setText('error-title', '読み取りに失敗しました');
    setText('error-msg', res.message || 'もう一度お試しください。解決しない場合はスタッフへお声掛けください。');
  }
}

/**
 * ?ct=<企業スタンプキー> が付いていれば、「このブースのスタンプを取得する」リンクを表示する。
 * 付いていなければ何もしない（受付から直接開いた通常の導線では出さない）。
 */
function showBoothReturn_() {
  const ct = FG_API.getParam('ct');
  if (!ct) return;
  const href = 'stamp.html?ct=' + encodeURIComponent(ct);
  ['back-to-booth', 'back-to-booth-2'].forEach(function (id) {
    const a = document.getElementById(id);
    if (a) { a.href = href; a.style.display = ''; }
  });
}

function cancelScan() {
  stopCamera();
  showState('ready');
}

function stopCamera() {
  if (_rafId)  { cancelAnimationFrame(_rafId); _rafId = null; }
  if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
}

// ── 描画 ──────────────────────────────────────────

function renderContinuing(d) {
  if (d.exchanged) {
    document.getElementById('continuing-icon').textContent = '🎁';
    setText('continuing-title', '景品交換済みです！');
    setText('continuing-msg', 'ご参加ありがとうございました！\n進捗ページで交換内容を確認できます。');
    document.getElementById('continuing-bar-wrap').style.display = 'none';
    document.getElementById('continuing-count').style.display    = 'none';
  } else {
    renderBar('continuing-bar', 'continuing-count', d);
  }
  showState('continuing');
}

function renderBar(barId, countId, d) {
  const count     = d.stampCount    || 0;
  const unitSize  = d.prizeUnitSize || d.prizeThreshold || 5;
  const maxPrizes = d.maxPrizes     || d.prizeCount     || 3;
  // 次の交換閾値があればそこまで、無ければ全景品ぶんを満タンとする
  const threshold = d.nextThreshold || (maxPrizes * unitSize);
  const bar = document.getElementById(barId);
  if (bar) bar.style.width = Math.min(100, Math.round((count / threshold) * 100)) + '%';
  const el = document.getElementById(countId);
  if (el) el.textContent = `${count} / ${threshold} 個`;
}

// ── ユーティリティ ────────────────────────────────

function showState(state) {
  ['ready','scanning','loading','success','continuing','already','error'].forEach(s => {
    const el = document.getElementById('state-' + s);
    if (el) el.style.display = s === state ? 'block' : 'none';
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
