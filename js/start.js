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
document.getElementById('btn-rescan')?.addEventListener('click', startScan);
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
    renderDots('already-dots', 'already-count', res.data);
  }
  showState('already');
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
    renderDots('result-dots', 'result-count', res.data);
    showState('success');
  } else {
    showState('error');
    setText('error-title', 'QRコードが無効です');
    setText('error-msg', res.message || '自分の学生QR名刺を読み取ってください。');
  }
}

function cancelScan() {
  stopCamera();
  showState(FG_API.getStampToken() ? 'already' : 'ready');
}

function stopCamera() {
  if (_rafId)  { cancelAnimationFrame(_rafId); _rafId = null; }
  if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
}

// ── 描画 ──────────────────────────────────────────

function renderDots(dotsId, countId, d) {
  const count = d.stampCount    || 0;
  const total = d.prizeCriteria || 5;

  const container = document.getElementById(dotsId);
  if (container) {
    container.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('div');
      dot.className = 'rdot' + (i < count ? ' filled' : '');
      container.appendChild(dot);
    }
  }

  const countEl = document.getElementById(countId);
  if (countEl) countEl.textContent = `${count} / ${total} スタンプ`;
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
