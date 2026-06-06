/**
 * FG Event Platform — 景品交換画面ロジック(スタッフ用)
 *
 * スタッフがexchange.html?key=[exchangeKey]を開き、
 * 学生のQR名刺をスキャンして景品引換状況を確認・記録する。
 *
 * 依存: jsQR, config.js, api.js
 */

let _stream    = null;
let _rafId     = null;
let _canvas    = null;
let _ctx       = null;
let _staffKey  = null;   // URLのkeyパラメータ
let _curToken  = null;   // 現在表示中の学生cardToken

// ── イベントリスナー ──────────────────────────────

document.getElementById('btn-scan')?.addEventListener('click', startScan);
document.getElementById('btn-cancel')?.addEventListener('click', cancelScan);
document.getElementById('btn-exchange')?.addEventListener('click', doExchange);
document.getElementById('btn-next')?.addEventListener('click', startScan);
document.getElementById('btn-next2')?.addEventListener('click', startScan);
document.getElementById('btn-retry')?.addEventListener('click', () => showState('ready'));

// ── 起動 ──────────────────────────────────────────

(function init() {
  _staffKey = FG_API.getParam('key');
  if (!_staffKey) {
    showState('no-key');
    return;
  }
  showState('ready');
})();

// ── QRスキャン ────────────────────────────────────

async function startScan() {
  showState('scanning');
  _canvas = document.createElement('canvas');
  _ctx    = _canvas.getContext('2d');

  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
    });
    const video = document.getElementById('scan-video');
    video.srcObject = _stream;
    await video.play();
    _canvas.width  = video.videoWidth  || 640;
    _canvas.height = video.videoHeight || 480;
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
    const img = _ctx.getImageData(0, 0, _canvas.width, _canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (code) { onQRFound(code.data); return; }
  }
  _rafId = requestAnimationFrame(() => scanLoop(video));
}

async function onQRFound(qrData) {
  stopCamera();

  let cardToken = null;
  try {
    cardToken = new URL(qrData).searchParams.get('token');
  } catch (e) { /* URLでない */ }

  if (!cardToken) {
    showState('error');
    setText('error-title', '学生QR名刺ではありません');
    setText('error-msg', '学生のQR名刺を読み取ってください。');
    return;
  }

  _curToken = cardToken;
  showState('loading');

  const res = await FG_API.getExchangeStatus(cardToken, _staffKey);

  if (!res.ok) {
    showState('error');
    if (res.error === 'invalid_staff_key') {
      setText('error-title', 'スタッフキーが無効です');
      setText('error-msg', 'URLのkeyを確認してください。');
    } else if (res.error === 'invalid_token') {
      setText('error-title', 'この学生が見つかりません');
      setText('error-msg', '学生QR名刺を読み取ってください。');
    } else {
      setText('error-title', 'エラーが発生しました');
      setText('error-msg', res.message || 'もう一度お試しください。');
    }
    return;
  }

  renderResult(res.data);
  showState('result');
}

// ── 結果表示 ──────────────────────────────────────

function renderResult(d) {
  setText('r-name', d.name);
  setText('r-sub', `${d.school}　${d.category}`);
  setText('r-count', String(d.stampCount));
  setText('r-threshold', String(d.prizeThreshold));
  setText('r-prize-count', String(d.prizeCount));

  hide('r-can-exchange'); hide('r-not-cleared'); hide('r-already');

  if (d.exchanged) {
    show('r-already');
  } else if (d.cleared) {
    show('r-can-exchange');
  } else {
    const remaining = d.prizeThreshold - d.stampCount;
    setText('r-remaining', `景品まであと ${remaining} 個`);
    show('r-not-cleared');
  }
}

// ── 景品交換実行 ──────────────────────────────────

async function doExchange() {
  if (!_curToken) return;
  const btn = document.getElementById('btn-exchange');
  btn.disabled = true;
  btn.textContent = '記録中...';

  const res = await FG_API.markPrizeExchanged(_curToken, _staffKey, '');

  btn.disabled = false;
  btn.textContent = '景品を渡した（引換完了）';

  if (res.ok) {
    setText('done-name', res.data.name);
    showState('done');
  } else {
    showState('error');
    if (res.error === 'already_exchanged') {
      setText('error-title', 'すでに交換済みです');
      setText('error-msg', 'この学生は景品を受け取り済みです。');
    } else if (res.error === 'not_cleared') {
      setText('error-title', 'まだ条件を満たしていません');
      setText('error-msg', 'スタンプ数が足りません。');
    } else {
      setText('error-title', 'エラーが発生しました');
      setText('error-msg', res.message || 'もう一度お試しください。');
    }
  }
}

// ── ユーティリティ ────────────────────────────────

function cancelScan() {
  stopCamera();
  showState('ready');
}

function stopCamera() {
  if (_rafId)  { cancelAnimationFrame(_rafId); _rafId = null; }
  if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
}

function showState(state) {
  ['no-key', 'ready', 'scanning', 'loading', 'result', 'done', 'error'].forEach(s => {
    const el = document.getElementById('state-' + s);
    if (el) el.style.display = s === state ? 'block' : 'none';
  });
}

function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function show(id) { const el = document.getElementById(id); if (el) el.style.display = 'block'; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
