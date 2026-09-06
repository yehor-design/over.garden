#!/usr/bin/env bash
# Installs the pinned gnparser release (ADR-0026 D4: the scientific-name
# parser behind the reconciliation ladder). The same version and checksums
# serve the Docker image, both CI workflows and a developer's machine, so the
# parser the tests exercise is the parser production runs.
#
#   scripts/install-gnparser.sh [destination-directory]
#
# Defaults to /usr/local/bin when writable, else ~/.local/bin.
set -euo pipefail

GNPARSER_VERSION="v1.15.0"
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    ASSET="gnparser-${GNPARSER_VERSION}-linux-x86.tar.gz"
    SHA256="50483cff07afedd9084ee122dc8bb25a454b567e5d99de66d30d7bf7ba3bbe7c"
    ;;
  Darwin-arm64)
    ASSET="gnparser-${GNPARSER_VERSION}-mac-arm.tar.gz"
    SHA256="46156dd2c4522c9285485fa4707eebfbc037c895989be032323ed7c6fb2f1508"
    ;;
  *)
    echo "install-gnparser: no pinned asset for $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac

DESTINATION="${1:-}"
if [ -z "$DESTINATION" ]; then
  if [ -w /usr/local/bin ]; then DESTINATION=/usr/local/bin; else DESTINATION="$HOME/.local/bin"; fi
fi
mkdir -p "$DESTINATION"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
curl -fsSL -o "$WORK/$ASSET" "https://github.com/gnames/gnparser/releases/download/${GNPARSER_VERSION}/${ASSET}"
echo "${SHA256}  ${WORK}/${ASSET}" | (command -v sha256sum >/dev/null && sha256sum -c - || shasum -a 256 -c -) >/dev/null
tar -xzf "$WORK/$ASSET" -C "$WORK"
install -m 0755 "$WORK/gnparser" "$DESTINATION/gnparser"
"$DESTINATION/gnparser" --version
