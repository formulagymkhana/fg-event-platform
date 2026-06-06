/**
 * FG Event Platform — GAS通信モジュール
 *
 * GASのAPIを叩く関数をまとめたモジュール。
 * FG_API.getStudent(token) のように使う。
 * config.jsより後に読み込むこと。
 *
 * トークン設計:
 *   cardToken  … 企業が学生情報を閲覧するためのトークン(学生マスターのtoken列)
 *   stampToken … スタンプラリー専用トークン(fg_stamp_token cookieに保存)
 */

const FG_API = (() => {

  // ── 内部共通関数 ──────────────────────────────

  async function call_(action, params = {}) {
    const url = new URL(FG_CONFIG.API_BASE_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('event', FG_CONFIG.EVENT_ID);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    try {
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

  // ── 企業向けAPI ───────────────────────────────

  /** cardTokenで学生情報を取得(企業がQR名刺を見るとき) */
  function getStudent(cardToken) {
    return call_('getStudent', { token: cardToken });
  }

  /** 企業が学生QRを閲覧したログを記録 */
  function saveViewLog(cardToken, companyId, email) {
    return call_('saveViewLog', { token: cardToken, company: companyId, email });
  }

  // ── 学生向けAPI ───────────────────────────────

  /**
   * cardToken → stampToken を発行(スタンプラリー開始時)
   * 学生が自分のQRをスキャンして呼ぶ。
   * 返り値: { stampToken, stampCount, prizeCriteria, cleared }
   */
  function activateStamp(cardToken) {
    return call_('activateStamp', { token: cardToken });
  }

  /** stampTokenでNFCスタンプを記録 */
  function saveStamp(stampToken, companyStampKey, nfcCounter) {
    return call_('saveStamp', { st: stampToken, ct: companyStampKey, nc: nfcCounter });
  }

  /** stampTokenでスタンプ取得状況を取得(個人情報を含まない) */
  function getStampProgress(stampToken) {
    return call_('getStampProgress', { token: stampToken });
  }

  // ── 企業閲覧API ───────────────────────────────

  /** 企業がQR閲覧学生一覧を取得(viewKeyで認証) */
  function getCompanyView(viewKey) {
    return call_('getCompanyView', { key: viewKey });
  }

  /** 企業ブースでスタンプを取得した学生一覧を取得 */
  function getCompanyStampVisitors(viewKey) {
    return call_('getCompanyStampVisitors', { key: viewKey });
  }

  // ── 景品交換API(スタッフ用) ──────────────────

  /** 学生cardTokenとスタッフキーで景品交換状況を取得 */
  function getExchangeStatus(cardToken, staffKey) {
    return call_('getExchangeStatus', { token: cardToken, key: staffKey });
  }

  /** 学生を景品交換済みとして記録 */
  function markPrizeExchanged(cardToken, staffKey, staff) {
    return call_('markPrizeExchanged', { token: cardToken, key: staffKey, staff });
  }

  // ── stampToken Cookie操作 ─────────────────────
  // cookieName: fg_stamp_token (スタンプラリー専用)

  /** stampTokenをcookieに保存 */
  function saveStampToken(token, days = 60) {
    const expires = new Date();
    expires.setDate(expires.getDate() + days);
    document.cookie = [
      `fg_stamp_token=${token}`,
      `expires=${expires.toUTCString()}`,
      'path=/',
      'SameSite=Lax',
      location.protocol === 'https:' ? 'Secure' : '',
    ].filter(Boolean).join('; ');
  }

  /** cookieからstampTokenを取得 */
  function getStampToken() {
    const match = document.cookie
      .split('; ')
      .find(c => c.startsWith('fg_stamp_token='));
    return match ? match.split('=')[1] : null;
  }

  // ── URLヘルパー ───────────────────────────────

  /** URLクエリパラメータから値を取得 */
  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  // ── エクスポート ──────────────────────────────
  return {
    // 企業向け
    getStudent,
    saveViewLog,
    // 学生向け
    activateStamp,
    saveStamp,
    getStampProgress,
    // 企業閲覧
    getCompanyView,
    getCompanyStampVisitors,
    // 景品交換(スタッフ)
    getExchangeStatus,
    markPrizeExchanged,
    // Cookie
    saveStampToken,
    getStampToken,
    // URL
    getParam,
  };

})();
