/**
 * FG Event Platform — スタンプ画面ロジック
 *
 * NFCタグをタップした際に開くページ。
 * URLの ct(企業スタンプキー) と fg_stamp_token cookie の stampToken でスタンプを記録する。
 *
 * URL形式: stamp.html?ct=[企業スタンプキー]&nc=[NFCカウンター(任意)]
 * config.js と api.js より後に読み込むこと。
 */

(async () => {
  const ct = FG_API.getParam('ct');
  const nc = FG_API.getParam('nc');

  if (!ct) {
    showState('error');
    setText('error-title', 'URLが正しくありません');
    setText('error-msg', 'NFCタグの設定を確認してください。');
    return;
  }

  // stampTokenをcookieまたはURLパラメータから取得
  const stampToken = FG_API.getParam('st') || FG_API.getStampToken();
  if (!stampToken) {
    showState('no-token');
    return;
  }

  showState('loading');
  const res = await FG_API.saveStamp(stampToken, ct, nc || undefined);

  if (res.ok) {
    renderSuccess(res.data);
    showState('success');
    return;
  }

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
      showState('no-token');
      break;
    default:
      showState('error');
      setText('error-title', 'エラーが発生しました');
      setText('error-msg', res.message || 'もう一度お試しください。');
  }
})();

function renderSuccess(d) {
  const count   = d.stampCount    || 0;
  const total   = d.prizeCriteria || 5;
  const cleared = d.cleared       || false;

  setText('success-company', d.company + ' のブース');
  setText('stamp-count', `${count} / ${total} スタンプ`);

  const container = document.getElementById('stamp-dots');
  container.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot' + (i < count ? ' filled' : '');
    if (i === count - 1) dot.classList.add('new');
    container.appendChild(dot);
  }

  if (cleared) document.getElementById('cleared-banner').style.display = 'block';
}

function showState(state) {
  ['loading', 'no-token', 'success', 'already', 'error'].forEach(s => {
    const el = document.getElementById('state-' + s);
    if (el) el.style.display = s === state ? 'block' : 'none';
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
