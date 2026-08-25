/**
 * 開催報告ページ（2026-08-25 新設）。
 *
 * ⚠ admin.html とは独立したページ。localStorage の fg_admin_key を共有するため、
 *   admin.html でログイン済みならそのまま使える（未ログインならここでも入力できる）。
 * ⚠ このページは書き込みを一切行わない（GAS の adminGetAttendanceReport は読み取り専用）。
 */
(function () {
  const $ = id => document.getElementById(id);
  let adminKey_ = localStorage.getItem('fg_admin_key') || '';

  async function call_(action, params) {
    const body = JSON.stringify({ action, adminKey: adminKey_, ...params });
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(FG_CONFIG.API_BASE_URL, { method: 'POST', body, redirect: 'follow', signal: ctrl.signal });
      clearTimeout(timer);
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, error: 'timeout', message: 'タイムアウト' };
      return { ok: false, error: 'network_error', message: '通信エラー' };
    }
  }

  function showState(s) {
    $('state-login').style.display = s === 'login' ? 'block' : 'none';
    $('state-app').style.display   = s === 'app'   ? 'block' : 'none';
  }

  async function tryLogin(key) {
    // 軽いアクションで疎通確認を兼ねる（イベント一覧取得）
    const res = await call_('adminGetEvents', {});
    if (!res.ok) return false;
    adminKey_ = key;
    localStorage.setItem('fg_admin_key', key);
    return true;
  }

  $('btn-login')?.addEventListener('click', async () => {
    const key = $('f-key').value.trim();
    if (!key) return;
    adminKey_ = key; // 一時的にセットして疎通確認
    const ok = await tryLogin(key);
    if (ok) { showState('app'); loadEvents_(); }
    else { $('login-err').style.display = 'block'; adminKey_ = ''; }
  });

  $('btn-print')?.addEventListener('click', () => window.print());

  let events_ = [];
  async function loadEvents_() {
    const res = await call_('adminGetEvents', {});
    if (!res.ok) {
      if (res.error === 'invalid_admin_key') { localStorage.removeItem('fg_admin_key'); showState('login'); return; }
      $('report-body').innerHTML = '<p class="state-msg">イベント一覧の取得に失敗しました</p>';
      return;
    }
    events_ = res.data.events || [];
    $('ev-select').innerHTML = events_.map(e =>
      `<option value="${e.eventId}">${e.name || e.eventId}（${e.startDate}〜${e.endDate}）</option>`
    ).join('');
    if (!events_.length) return;
    // イベント一覧の「📊 開催結果」から event=<id> 付きで開かれた場合はそれを初期選択にする
    // （2026-08-25 追加）。無い/該当なしの場合は先頭を初期選択にする（従来どおり）。
    const params = new URLSearchParams(location.search);
    const wanted = params.get('event');
    const initial = (wanted && events_.some(e => e.eventId === wanted)) ? wanted : events_[0].eventId;
    $('ev-select').value = initial;
    loadReport_(initial);
  }
  $('ev-select')?.addEventListener('change', e => loadReport_(e.target.value));

  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  async function loadReport_(eventId) {
    const body = $('report-body');
    body.innerHTML = '<p class="state-msg">集計中…（数秒かかることがあります）</p>';
    const res = await call_('adminGetAttendanceReport', { event: eventId });
    if (!res.ok) {
      body.innerHTML = `<p class="state-msg">集計に失敗しました: ${esc(res.message || res.error || '')}</p>`;
      return;
    }
    const d = res.data;
    const ev = events_.find(e => e.eventId === eventId);

    const dayLabel = (day, i) => {
      const dt = new Date(day.replace(/\//g, '-'));
      const w = ['日','月','火','水','木','金','土'][dt.getDay()];
      return `${dt.getMonth() + 1}/${dt.getDate()}（${w}）`;
    };

    const rows = d.days.map(day => {
      const r = d.byDay[day];
      return `<tr>
        <td>${dayLabel(day)}</td>
        <td class="num">${r.drivers}</td>
        <td class="num">${r.nonDrivers}</td>
        <td class="num">${r.total}</td>
      </tr>`;
    }).join('');

    const totalDrivers = d.days.reduce((s, day) => s + d.byDay[day].drivers, 0);
    const totalNonDrivers = d.days.reduce((s, day) => s + d.byDay[day].nonDrivers, 0);
    const totalAll = totalDrivers + totalNonDrivers;

    const srcRows = d.days.map(day => {
      const s = d.byDay[day].sources;
      return `<tr><td>${dayLabel(day)}</td><td class="num">${s.registration}</td><td class="num">${s.stamp}</td><td class="num">${s.view}</td></tr>`;
    }).join('');

    // 活動記録（選手／選手以外）。GAS 側が未対応の場合（再デプロイ前）は 0 表示になる。
    const act = d.activity || {};
    const actCell = (kind, group) => {
      const g = (act[kind] || {})[group] || {};
      return { count: g.count ?? 0, users: g.users ?? 0 };
    };
    const actCellHtml = a => `<td class="num">${a.count}<span class="sub">（${a.users}人）</span></td>`;
    const actRows = [['選手', 'driver'], ['選手以外', 'nonDriver']].map(([label, group]) =>
      `<tr><td>${label}</td>${actCellHtml(actCell('stamp', group))}${actCellHtml(actCell('view', group))}</tr>`
    ).join('');

    body.innerHTML = `
      <div class="card">
        <h2>${esc(ev ? (ev.name || eventId) : eventId)}</h2>
        <p class="note">
          学生の来場者数（概算）。企業スタッフ・一般来場者は含みません。<br>
          「選手」は出場選手（FGクラス／女子クラスドライバー）で、来場予定日の申告項目がフォームに
          無いため <strong>開催日すべてに一律で加算</strong>しています（補欠ドライバーは選手以外に含む）。
          選手はスタンプやQR読み取りの記録があっても「選手以外」には計上しません（二重計上を避けるため）。<br>
          「選手以外」は スタンプ開始・当日登録／スタンプ取得／企業によるQR読み取り のいずれかが
          記録された学生を、その日ごとに重複なく数えた人数です。記録が一切ない学生は、
          来場していても区別できないため来場者に含めていません。
        </p>
        <table class="report-tbl">
          <thead><tr><th>日程</th><th>選手</th><th>選手以外</th><th>合計</th></tr></thead>
          <tbody>
            ${rows}
            <tr class="total-row"><td>合計（延べ）</td><td class="num">${totalDrivers}</td><td class="num">${totalNonDrivers}</td><td class="num">${totalAll}</td></tr>
          </tbody>
        </table>
        <p class="src-note">※「合計」は選手込みの概算値です。選手以外は同一学生を複数日で重複カウントしませんが、「合計（延べ）」の選手以外欄は日ごとの人数を単純合計したものです（同一学生が両日来場していれば2として数えます）。</p>
      </div>

      <div class="card">
        <h2>景品交換</h2>
        <div class="prize-stats">
          <div class="prize-stat"><div class="val">${d.prizeItemCount ?? 0}</div><div class="lbl">交換済み景品数</div></div>
          <div class="prize-stat"><div class="val">${d.prizeExchangeCount ?? 0}</div><div class="lbl">景品交換回数</div></div>
        </div>
      </div>

      <div class="card">
        <h2>内訳（選手以外・集計元）</h2>
        <p class="note">
          1人が複数の方法で記録されると、各列にそれぞれ計上されます（列同士の合計は「選手以外」の人数と一致しません）。<br>
          「スタンプ開始・当日登録」は、事前登録済みの学生が会場でスタンプラリーを開始した記録と、
          当日登録の記録です（当日登録は登録と同時に記録されます）。事前登録そのものは含みません。
        </p>
        <table class="report-tbl">
          <thead><tr><th>日程</th><th>スタンプ開始<br>当日登録</th><th>スタンプ</th><th>QR読み取り</th></tr></thead>
          <tbody>${srcRows}</tbody>
        </table>
      </div>

      <div class="card">
        <h2>活動記録</h2>
        <p class="note">
          スタンプ取得とQR読み取りの記録数。上の来場者数とは独立した集計で、<strong>選手も対象に含みます</strong>。<br>
          大きい数字が記録された延べ回数、カッコ内はその記録を持つ学生の実人数です。
        </p>
        <table class="report-tbl">
          <thead><tr><th>区分</th><th>スタンプ取得</th><th>QR読み取り</th></tr></thead>
          <tbody>${actRows}</tbody>
        </table>
      </div>
    `;
  }

  (async () => {
    if (!adminKey_) { showState('login'); return; }
    const ok = await tryLogin(adminKey_);
    if (!ok) { adminKey_ = ''; localStorage.removeItem('fg_admin_key'); showState('login'); return; }
    showState('app');
    loadEvents_();
  })();
})();
