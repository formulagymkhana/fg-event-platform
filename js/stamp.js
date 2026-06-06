/**
 * FG Event Platform — スタンプ画面ロジック
 *
 * 景品モデル: N個集めるとM個選べる
 * URL形式: stamp.html?ct=[企業スタンプキー]&nc=[NFCカウンター(任意)]
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
  const count     = d.stampCount     || 0;
  const threshold = d.prizeThreshold || 5;
  const prizeNum  = d.prizeCount     || 1;
  const cleared   = d.cleared        || false;

  setText('success-company', d.company + ' のブース');
  setText('stamp-count', `${count} / ${threshold} 個`);

  // 進捗バー
  const pct = Math.min(100, Math.round((count / threshold) * 100));
  document.getElementById('bar-fill').style.width = pct + '%';

  // 達成時バナー
  if (cleared) {
    const el = document.getElementById('cleared-banner');
    el.innerHTML = `🎉 景品引換可能！<div class="cleared-sub">交換所で好きな景品を${prizeNum}個選べます</div>`;
    el.style.display = 'block';
  }
}

function showState(state) {
  ['loading', 'no-token', 'success', 'already', 'error'].forEach(s => {
    const el = document.getElementById('state-' + s);
    if (el) el.style.display = s === state ? 'block' : 'none';
  });
}
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
