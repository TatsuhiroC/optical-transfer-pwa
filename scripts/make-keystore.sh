#!/usr/bin/env bash
# Disable tracing before signing configuration is read.
set +x
set -euo pipefail
exec node "$(dirname "$0")/make-keystore.mjs" "$@"
