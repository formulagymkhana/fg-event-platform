/**
 * FG Event Platform — スタンプラリー開始画面ロジック
 *
 * 学生が自分のQR名刺を読み取り、stampTokenを発行する。
 * cardToken → activateStamp API → stampToken → cookie保存
 *
 * 依存: jsQR(start.htmlで読み込み済み), config.js, api.js
 *
 * ⚠ CSP対応のためonclick属性は使わず、ここでeventListenerを設定する。
 */

let _stream = null;
let _rafId  = null;
let _canvas = null;
let _ctx    = null;

// ── イベントリスナー(onclick の代わり) ──────────────

document.getElementById('btn-start')?.addEventListener('click', startScan);
document.getElementById('btn-cancel')?.addEventListener('click', cancelScan);
document.getElementById('btn-retry')?.addEventListener('click', () => showState('ready'));

// ── 起動処理 ──────────────────────────────────────

(function init() {
  const existing = FG_API.getStampToken();
  if (existing) {
    loadExistingProgress(existing);
  } else {
    showState('ready');
  }
})();

async function loadExistingProgress(token) {
  const res = await FG_API.getStampProgress(token);
  if (res.ok) {
    // 有効なトークン → 参加登録済み画面
    renderBar('already-bar', 'already-count', res.data);
    showState('already');
  } else {
    // トークンが無効(古い・リセット等) → 未登録として開始画面へ
    showState('ready');
  }
}

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
    setText('error-msg', 'カメラのアクセスを許可してから、もう一度お試しください。');
  }
}

function scanLoop(video) {
  if (!_stream) return;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    _ctx.drawImage(video, 0, 0, _canvas.width, _canvas.height);
    const imageData = _ctx.getImageData(0, 0, _canvas.width, _canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });
    if (code) {
      onQRFound(code.data);
      return;
    }
  }

  _rafId = requestAnimationFrame(() => scanLoop(video));
}

async function onQRFound(qrData) {
  stopCamera();

  let cardToken = null;
  try {
    const url = new URL(qrData);
    cardToken = url.searchParams.get('token');
  } catch (e) {
    // QRがURLでない場合
  }

  if (!cardToken) {
    showState('error');
    setText('error-title', 'このQRコードは対応していません');
    setText('error-msg', '自分の学生QR名刺を読み取ってください。');
    return;
  }

  showState('loading');
  const res = await FG_API.activateStamp(cardToken);

  if (res.ok) {
    FG_API.saveStampToken(res.data.stampToken);
    renderBar('result-bar', 'result-count', res.data);
    setText('guide-goal', String(res.data.prizeThreshold || 15));
    setText('guide-count', String(res.data.prizeCount || 3));
    showState('success');
  } else {
    showState('error');
    setText('error-title', 'QRコードが無効です');
    setText('error-msg', res.message || '自分の学生QR名刺を読み取ってください。');
  }
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

/** 進捗バーとカウントを描画 */
function renderBar(barId, countId, d) {
  const count     = d.stampCount     || 0;
  const threshold = d.prizeThreshold || 5;

  const bar = document.getElementById(barId);
  if (bar) {
    const pct = Math.min(100, Math.round((count / threshold) * 100));
    bar.style.width = pct + '%';
  }

  const countEl = document.getElementById(countId);
  if (countEl) countEl.textContent = `${count} / ${threshold} 個`;
}

// ── ユーティリティ ────────────────────────────────

function showState(state) {
  ['ready', 'scanning', 'loading', 'success', 'already', 'error'].forEach(s => {
    const el = document.getElementById('state-' + s);
    if (el) el.style.display = s === state ? 'block' : 'none';
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
