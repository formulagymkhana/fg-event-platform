#!/usr/bin/env bash
#
# GAS の実体と docs/gas-patches/*.final.txt の乖離を検出する。
#
# ⚠ このスクリプトは【読み取り専用】。GAS へ書き込むコマンド（push / deploy / version）は
#   一切実行しない。実行して GAS 側が変化することはない。
#
# 使い方:
#   1. 事前に clasp login を済ませておく
#   2. tools/gas-diff-check.sh <スクリプトID>
#
# 差分ゼロ  → 終了コード 0。.final.txt は実体と一致している。
# 差分あり  → 終了コード 1。どちらが正しいか判断して .final.txt へ取り込むこと。
#
# 詳細は docs/GAS_CLASP_MIGRATION.md を参照。

set -uo pipefail

SCRIPT_ID="${1:-}"
if [ -z "$SCRIPT_ID" ]; then
  echo "使い方: tools/gas-diff-check.sh <スクリプトID>" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFY_DIR="$REPO_ROOT/gas-verify"
PATCH_DIR="$REPO_ROOT/docs/gas-patches"

if ! command -v clasp >/dev/null 2>&1; then
  echo "clasp が見つかりません。npm install -g @google/clasp を実行するか、" >&2
  echo "このスクリプト内の clasp を npx @google/clasp に読み替えてください。" >&2
  exit 2
fi

# 毎回まっさらな状態で取得する（前回の残骸と混ざらないように）
rm -rf "$VERIFY_DIR"
mkdir -p "$VERIFY_DIR"

echo "=== GAS から取得します（読み取りのみ） ==="
echo "スクリプトID: $SCRIPT_ID"
( cd "$VERIFY_DIR" && clasp clone "$SCRIPT_ID" ) || {
  echo "clone に失敗しました。ログインアカウントとスクリプトIDを確認してください。" >&2
  exit 2
}

echo
echo "=== 取得したファイル ==="
ls -1 "$VERIFY_DIR"

# .gs / .js のどちらで落ちるかは clasp の設定に依存するため、両方を探す
find_remote() {
  local base="$1"
  for ext in gs js; do
    if [ -f "$VERIFY_DIR/$base.$ext" ]; then
      echo "$VERIFY_DIR/$base.$ext"
      return 0
    fi
  done
  return 1
}

status=0
echo
echo "=== .final.txt との差分 ==="
for base in api admin; do
  local_file="$PATCH_DIR/$base.gs.final.txt"
  if [ ! -f "$local_file" ]; then
    echo "[skip] $local_file が存在しません"
    continue
  fi
  if ! remote_file="$(find_remote "$base")"; then
    echo "[警告] GAS 側に $base.gs / $base.js が見つかりません"
    status=1
    continue
  fi
  if diff -q "$remote_file" "$local_file" >/dev/null; then
    echo "[一致] $base"
  else
    echo "[差分] $base  ($(basename "$remote_file") vs $(basename "$local_file"))"
    diff "$remote_file" "$local_file" | head -40
    echo "  … 全差分は次で確認: diff $remote_file $local_file"
    status=1
  fi
done

echo
if [ "$status" -eq 0 ]; then
  echo "✓ 差分はありません。GAS の実体と .final.txt は一致しています。"
else
  echo "⚠ 差分があります。"
  echo "  これは事故ではなく発見です。GAS エディタ側で直接編集された変更が"
  echo "  .final.txt に取り込まれていない可能性があります。"
  echo "  どちらが正しいかを判断し、.final.txt へ反映してください。"
fi

echo
echo "（gas-verify/ は .gitignore 済みです。不要になったら削除して構いません）"
exit "$status"
