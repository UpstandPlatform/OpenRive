#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/openrive-lottie-corpus.XXXXXX")"
trap 'rm -rf -- "$fixture_root"' EXIT

checkout_sparse() {
  local repository="$1"
  local revision="$2"
  local directory="$3"
  local sparse_path="$4"

  git init --quiet "$directory"
  git -C "$directory" remote add origin "$repository"
  git -C "$directory" sparse-checkout init --cone
  git -C "$directory" sparse-checkout set "$sparse_path"
  git -C "$directory" fetch --quiet --depth 1 --filter=blob:none origin "$revision"
  git -C "$directory" checkout --quiet --detach FETCH_HEAD
}

checkout_sparse \
  https://github.com/LottieFiles/dotlottie-web.git \
  d8a4e9e2cf76740b7b3848257f962b38d71aa71a \
  "$fixture_root/dotlottie-web" \
  fixtures
checkout_sparse \
  https://github.com/telegramdesktop/tdesktop.git \
  63a1831728147e941ad2dc8939879cf5afe419c7 \
  "$fixture_root/tdesktop" \
  Telegram/Resources/animations

bun run --cwd "$root" test:lottie -- \
  "$fixture_root/dotlottie-web/fixtures" \
  "$fixture_root/tdesktop/Telegram/Resources/animations"

bun run --cwd "$root" test:lottie:browser -- \
  "$fixture_root/dotlottie-web/fixtures/lottie/balloons_with_string.json" \
  "$fixture_root/tdesktop/Telegram/Resources/animations/palette.tgs"
