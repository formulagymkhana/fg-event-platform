/**
 * FG Event Platform — フロントエンド設定
 *
 * バックエンドをGASから別サービスに移行する場合は
 * API_BASE_URL を書き換えるだけでOK。
 */

const FG_CONFIG = {
  // GASデプロイURL(変更時はここだけ書き換える)
  API_BASE_URL: 'https://script.google.com/macros/s/AKfycbyMZDTIHPr8UwfQx-F6rELoFkbggjszO1oo--xarweni8tOAgTpc38j8VC6LCld3MMOhA/exec',

  // 現在のイベントID(設定シートのeventIdと一致させる)
  EVENT_ID: '2026_rd2',
};
