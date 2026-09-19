#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 ghcr.io/dx-corp/platform/runner-host@sha256:<digest>" >&2
  exit 2
fi

printf '%s\n' "$1" | grep -Eq '^ghcr\.io/dx-corp/platform/runner-host@sha256:[0-9a-f]{64}$' || {
  echo "runner image must use the Mono-owned runner-host repository and a lowercase sha256 digest" >&2
  exit 2
}

command -v cosign >/dev/null 2>&1 || { echo "cosign is required" >&2; exit 2; }

exec cosign verify \
  --certificate-identity "https://github.com/dx-corp/mono/.github/workflows/publish.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  "$1"
