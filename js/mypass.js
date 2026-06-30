/**
 * FG Event Platform — 当日参加者 マイページ
 *
 * URL形式: mypass.html?token=<cardToken>&event=<eventId>
 *
 * 役割:
 *   - 氏名と個人QR（企業がスキャンする card.html へのQR）を表示
 *   - スタンプ進捗のcookieを静かに復元（クッキー喪失からの復帰口）
 *
 * 登録完了メールに記載するリンク先。ブックマーク/ホーム画面追加で再訪できる。
 */

(async function init() {
  showState('loading');

  const token = FG_API.getParam('token');
  if (!token) {
    showError('URLが正しくありません。', '登録完了メールのリンクから開いてください。');
    return;
  }

  // event は基本URLに含まれる。無ければ本日のイベントで補完。
  let event = FG_API.getParam('event');
  if (!event) {
    const cur = await FG_API.getCurrentEvent();
    event = cur.ok && cur.data ? cur.data.eventId : null;
  }

  const res = await FG_API.getStudent(token, event, 'mypass');
  if (!res.ok) {
    if (res.error === 'event_ended') {
      showError('このイベントは終了しました。', '');
    } else if (res.error === 'expired') {
      showError('公開期限が終了しました。', 'MY PASSの公開期間が終了しています。');
    } else if (res.error === 'timeout' || res.error === 'network_error') {
      showError('接続に失敗しました。', '電波の良い場所でもう一度お試しください。');
    } else {
      showError('ページを表示できませんでした。', '登録完了メールのリンクを再度ご確認ください。');
    }
    return;
  }

  renderPass_(res.data, token, event);
  showState('ready');

  // スタンプ進捗cookieを静かに復元（喪失していても、このページを開くだけで復帰）
  restoreStampCookie_(token, event);
})();

// ── 描画 ──────────────────────────────────────────
function renderPass_(d, token, event) {
  setText('event-name', d.eventName || 'MY PASS');
  setText('furigana', d.furigana || '');
  setText('name', d.name || '');
  const school = [d.school, d.department].filter(Boolean).join(' ');
  setText('school', school);

  // 進捗リンク: event + stampToken を付与してデバイス間で同一学生データを参照
  const prog = document.getElementById('btn-progress');
  if (prog && event) {
    const params = new URLSearchParams({ event });
    if (d.stampToken) {
      params.set('st', d.stampToken);
      FG_API.saveStampToken(d.stampToken);
    }
    prog.href = `progress.html?${params}`;
  }

  // QRは企業閲覧用URL（card.html）を符号化する
  const cardUrl = buildCardUrl_(token, event);
  renderQr_('qr-box', cardUrl);
}

function buildCardUrl_(token, event) {
  const ev = event ? `&event=${encodeURIComponent(event)}` : '';
  return new URL(`card.html?token=${encodeURIComponent(token)}${ev}`, location.href).toString();
}

function renderQr_(elId, text) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = '';
  new QRCode(el, {
    text: text,
    width: 200,
    height: 200,
    colorDark: '#0B2545',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

// ── スタンプcookie復元（ベストエフォート） ──────────
async function restoreStampCookie_(token, event) {
  try {
    const res = await FG_API.activateStamp(token, event);
    if (res.ok && res.data && res.data.stampToken) {
      const st = res.data.stampToken;
      FG_API.saveStampToken(st);
      // スタンプ初回起動後に進捗リンクへ st を付与（getStudent 時点では未登録の場合）
      const prog = document.getElementById('btn-progress');
      if (prog && event && !prog.href.includes('st=')) {
        const params = new URLSearchParams({ event, st });
        prog.href = `progress.html?${params}`;
      }
    }
  } catch (e) { /* 失敗しても表示は維持 */ }
}

// ── ユーティリティ ────────────────────────────────
function showState(state) {
  ['loading', 'ready', 'error'].forEach(s => {
    const el = document.getElementById('state-' + s);
    if (el) el.style.display = s === state ? 'block' : 'none';
  });
}
function showError(title, msg) {
  setText('error-title', title);
  setText('error-msg', msg);
  showState('error');
}
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
