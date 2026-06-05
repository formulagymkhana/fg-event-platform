/**
 * FG Event Platform — スタンプラリー開始画面ロジック
 *
 * 学生が自分のQR名刺を読み取り、stampTokenを発行する。
 * cardToken → activateStamp API → stampToken → cookie保存
 *
 * 依存ライブラリ: jsQR (start.htmlで読み込み済み)
 * config.js と api.js より後に読み込むこと。
 */

let _stream   = null;  // カメラストリーム
let _rafId    = null;  // requestAnimationFrameのID
let _canvas   = null;  // QRスキャン用オフスクリーンキャンバス
let _ctx      = null;

// ── 起動処理 ──────────────────────────────────────

(function init() {
  // 既にstampTokenを持っている場合 → 開始済み画面へ
  const existing = FG_API.getStampToken();
  if (existing) {
    loadExistingProgress(existing);
  } else {
    showState('ready');
  }
})();

/** 既存stampTokenの進捗を読み込んで「開始済み」画面を表示 */
async function loadExistingProgress(token) {
  const res = await FG_API.getStampProgress(token);
  if (res.ok) {
    renderDots('already-dots', 'already-count', res.data);
  }
  showState('already');
}

// ── QRスキャン ────────────────────────────────────

/** カメラを起動してスキャン開始 */
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

/** フレームをキャプチャしてQRを探す */
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

/** QRコードが見つかったとき */
async function onQRFound(qrData) {
  stopCamera();

  // URLからcardTokenを抽出
  let cardToken = null;
  try {
    const url = new URL(qrData);
    cardToken = url.searchParams.get('token');
  } catch (e) {
    // QRがURLでない
  }

  if (!cardToken) {
    showState('error');
    setText('error-title', 'このQRコードは対応していません');
    setText('error-msg', '自分の学生QR名刺を読み取ってください。');
    return;
  }

  // activateStamp APIを呼び出し
  showState('loading');
  const res = await FG_API.activateStamp(cardToken);

  if (res.ok) {
    FG_API.saveStampToken(res.data.stampToken);
    renderDots('result-dots', 'result-count', res.data);
    showState('success');
  } else {
    showState('error');
    setText('error-title', 'QRコードが無効です');
    setText('error-msg', '自分の学生QR名刺を読み取ってください。');
  }
}

/** スキャンをキャンセル */
function cancelScan() {
  stopCamera();
  // 既存トークンがあれば開始済み画面、なければ開始画面
  const existing = FG_API.getStampToken();
  showState(existing ? 'already' : 'ready');
}

/** カメラを停止してリソースを解放 */
function stopCamera() {
  if (_rafId)  { cancelAnimationFrame(_rafId); _rafId = null; }
  if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
}

// ── 描画 ──────────────────────────────────────────

/** スタンプ進捗ドットを描画 */
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
