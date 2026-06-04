/**
 * FG Event Platform — GAS通信モジュール
 *
 * GASのAPIを叩く関数をまとめたモジュール。
 * FG_API.getStudent(token) のように使う。
 * config.jsより後に読み込むこと。
 */

const FG_API = (() => {

  // ── 内部共通関数 ──────────────────────────────

  /**
   * GAS APIを呼び出す共通関数。
   * GASはリダイレクト(302)を返すため redirect:'follow' が必要。
   * 15秒応答がなければタイムアウトとして処理する。
   */
  async function call_(action, params = {}) {
    const url = new URL(FG_CONFIG.API_BASE_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('event', FG_CONFIG.EVENT_ID);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    try {
      // 15秒タイムアウト
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url.toString(), {
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') {
        return { ok: false, error: 'timeout', message: 'タイムアウトしました。再度お試しください。' };
      }
      return { ok: false, error: 'network_error', message: '通信エラーが発生しました' };
    }
  }

  // ── 公開API ───────────────────────────────────

  /** 学生トークンで学生情報を取得(QRカード表示用) */
  function getStudent(token) {
    return call_('getStudent', { token });
  }

  /** 企業が学生QRを閲覧したログを記録 */
  function saveViewLog(token, companyId, email) {
    return call_('saveViewLog', { token, company: companyId, email });
  }

  /** NFCスタンプを記録(st=学生トークン, ct=企業キー, nc=NFCカウンター) */
  function saveStamp(studentToken, companyToken, nfcCounter) {
    return call_('saveStamp', { st: studentToken, ct: companyToken, nc: nfcCounter });
  }

  /** 学生のスタンプ取得状況を取得 */
  function getStampProgress(token) {
    return call_('getStampProgress', { token });
  }

  /** 企業が訪問学生一覧を閲覧(viewKeyで認証) */
  function getCompanyView(viewKey) {
    return call_('getCompanyView', { key: viewKey });
  }

  // ── クッキー操作 ──────────────────────────────

  /** 学生トークンをcookieに保存(スタンプラリーで他ページから参照するため) */
  function saveTokenToCookie(token, days = 60) {
    const expires = new Date();
    expires.setDate(expires.getDate() + days);
    document.cookie = [
      `fg_student_token=${token}`,
      `expires=${expires.toUTCString()}`,
      'path=/',
      'SameSite=Lax',
      location.protocol === 'https:' ? 'Secure' : '',
    ].filter(Boolean).join('; ');
  }

  /** cookieから学生トークンを取得(stamp.html / progress.htmlで使用) */
  function getTokenFromCookie() {
    const match = document.cookie
      .split('; ')
      .find(c => c.startsWith('fg_student_token='));
    return match ? match.split('=')[1] : null;
  }

  /** URLクエリパラメータから値を取得 */
  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  // ── エクスポート ──────────────────────────────
  return {
    getStudent,
    saveViewLog,
    saveStamp,
    getStampProgress,
    getCompanyView,
    saveTokenToCookie,
    getTokenFromCookie,
    getParam,
  };

})();
