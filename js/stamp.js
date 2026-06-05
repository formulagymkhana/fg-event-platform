/**
 * FG Event Platform — スタンプ画面ロジック
 *
 * NFCタグをタップした際に開くページ。
 * URLの ct(企業スタンプキー) と cookieの学生トークンを使ってスタンプを記録する。
 *
 * URL形式: stamp.html?ct=[企業スタンプキー]&nc=[NFCカウンター(任意)]
 * config.js と api.js より後に読み込むこと。
 */

(async () => {
  // URLパラメータ取得
  const ct = FG_API.getParam('ct');
  const nc = FG_API.getParam('nc');

  // ct がなければ無効なURL
  if (!ct) {
    showState('error');
    setText('error-title', 'URLが正しくありません');
    setText('error-msg', 'NFCタグの設定を確認してください。');
    return;
  }

  // cookieから学生トークンを取得(QRカードを読んでいない場合はない)
  104c1ba0-b23d-4ab3-999c-50c0870ab8a3	f2ebe97b-082b-477b-99fe-4c41eb18099a
  if (!studentToken) {
    showState('no-token');
    return;
  }

  // API呼び出し
  showState('loading');
  const res = await FG_API.saveStamp(studentToken, ct, nc || undefined);

  if (res.ok) {
    renderSuccess(res.data);
    showState('success');
    return;
  }

  // エラー処理
  switch (res.error) {
    case 'already_stamped':
      showState('already');
      break;
    case 'timeout':
      showState('error');
      setText('error-title', '接続がタイムアウトしました');
      setText('error-msg', 'もう一度お試しください。');
      break;
    case 'invalid_student_token':
      // クッキーのトークンが無効(古い可能性)
      showState('no-token');
      break;
    default:
      showState('error');
      setText('error-title', 'エラーが発生しました');
      setText('error-msg', res.message || 'もう一度お試しください。');
  }
})();

// ── 成功画面の描画 ──

function renderSuccess(d) {
  const count    = d.stampCount    || 0;
  const total    = d.prizeCriteria || 5;
  const cleared  = d.cleared       || false;

  setText('success-company', d.company + ' のブース');
  setText('stamp-count', `${count} / ${total} スタンプ`);

  // 進捗ドットを描画
  const container = document.getElementById('stamp-dots');
  container.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot' + (i < count ? ' filled' : '');
    // 今回取得したスタンプ(最後のfilled)にアニメーション
    if (i === count - 1) dot.classList.add('new');
    container.appendChild(dot);
  }

  // クリア時のバナーを表示
  if (cleared) {
    document.getElementById('cleared-banner').style.display = 'block';
  }
}

// ── ユーティリティ ──

/** 表示する状態を切り替える */
function showState(state) {
  const states = ['loading', 'no-token', 'success', 'already', 'error'];
  states.forEach(s => {
    const el = document.getElementById('state-' + s);
    if (el) el.style.display = s === state ? 'block' : 'none';
  });
}

/** テキストを設定する */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
