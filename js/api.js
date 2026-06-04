/**
 * FG Event Platform — フロントエンドAPIモジュール
 *
 * 使い方:
 *   const student = await FG_API.getStudent(token);
 *   if (!student.ok) { alert(student.message); return; }
 *   console.log(student.data.name);
 */

const FG_API = (() => {

  /**
   * GAS APIを呼ぶ共通関数
   * GASはリダイレクト(302)を返すため redirect:'follow' が必須
   */
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
    try {
      const res  = await fetch(url.toString(), { redirect: 'follow' });
      const json = await res.json();
      return json;
    } catch (e) {
      console.error('API call failed:', e);
      return { ok: false, error: 'network_error', message: '通信エラーが発生しました' };
    }
  }

  // ----------------------------------------------------------------

  /**
   * 学生情報を取得する (QRカード表示用)
   * @param {string} token - 学生トークン
   */
  function getStudent(token) {
    return call_('getStudent', { token });
  }

  /**
   * 企業閲覧ログを記録する
   * @param {string} token     - 学生トークン
   * @param {string} companyId - 企業ID
   * @param {string} [email]   - 企業メール(後日再閲覧登録時)
   */
  function saveViewLog(token, companyId, email) {
    return call_('saveViewLog', { token, company: companyId, email });
  }

  /**
   * NFCスタンプを記録する
   * @param {string} studentToken  - 学生トークン(cookieから取得)
   * @param {string} companyToken  - 企業スタンプキー(NFCタグURLから取得)
   * @param {string} [nfcCounter]  - NFCカウンター値(NTAG213 nc パラメータ)
   */
  function saveStamp(studentToken, companyToken, nfcCounter) {
    return call_('saveStamp', {
      st: studentToken,
      ct: companyToken,
      nc: nfcCounter,
    });
  }

  /**
   * スタンプ進捗を取得する
   * @param {string} token - 学生トークン
   */
  function getStampProgress(token) {
    return call_('getStampProgress', { token });
  }

  /**
   * 企業向け訪問学生一覧を取得する
   * @param {string} viewKey - 企業閲覧キー
   */
  function getCompanyView(viewKey) {
    return call_('getCompanyView', { key: viewKey });
  }

  // ----------------------------------------------------------------

  /**
   * 学生トークンをcookieに保存する
   * card.html を開いたときに自動的に呼ばれる
   */
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

  /**
   * cookieから学生トークンを取得する
   * stamp.html / progress.html で使用する
   */
  function getTokenFromCookie() {
    const match = document.cookie
      .split('; ')
      .find(c => c.startsWith('fg_student_token='));
    return match ? match.split('=')[1] : null;
  }

  /**
   * URLパラメータから値を取得する
   */
  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  // ----------------------------------------------------------------

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
