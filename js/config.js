/**
 * FG Event Platform — フロントエンド設定
 *
 * バックエンドをGASからCloudflare Workersに移行する場合、
 * API_BASE_URL を1行書き換えるだけで完了する。
 */

const FG_CONFIG = {
  // GASデプロイ後にここを書き換える
  API_BASE_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',

  // 現在のイベントID (管理画面から自動セットすることも可能)
  EVENT_ID: '2026_rd2',
};
