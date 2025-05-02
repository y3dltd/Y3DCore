#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Convenience script to start a LiteLLM local proxy for Y3DHub development.
#
# Requires:
#   - Python virtualenv activated (pip install "litellm[proxy]")
#   - Environment variables OPENAI_API_KEY and/or OPEN_ROUTER_API_KEY set.
#
# Usage:
#   ./scripts/run-litellm-proxy.sh              # start with default config
#   PORT=5000 ./scripts/run-litellm-proxy.sh    # override port
# ---------------------------------------------------------------------------

set -euo pipefail

# Determine repo root (directory of this script two levels up)
ROOT_DIR="$(dirname "$(dirname "${BASH_SOURCE[0]}")")"

# --- NEW: auto-load .env ----------------------------------------------------
if [[ -f "$ROOT_DIR/.env" ]]; then
  # Export all vars defined in .env (ignoring comments) so the proxy picks them up
  set -o allexport
  source "$ROOT_DIR/.env"
  set +o allexport
fi
# ---------------------------------------------------------------------------

CONFIG_FILE="$ROOT_DIR/docs/configs/litellm_config.yaml"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "[litellm-proxy] Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

# Allow optional port override via env
PROXY_PORT="${PORT:-4000}"

# --- NEW: figure out which python to use -----------------------------------
if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
  PY="$ROOT_DIR/.venv/bin/python"
else
  PY="$(command -v python || command -v python3)"
fi
if [[ -z "$PY" ]]; then
  echo "[litellm-proxy] Python interpreter not found. Activate your virtualenv or install python3." >&2
  exit 1
fi
# ---------------------------------------------------------------------------

# --- NEW: figure out which litellm CLI to use ------------------------------
if [[ -x "$ROOT_DIR/.venv/bin/litellm" ]]; then
  LITE="$ROOT_DIR/.venv/bin/litellm"
else
  LITE="$(command -v litellm || true)"
fi
if [[ -z "$LITE" ]]; then
  echo "[litellm-proxy] 'litellm' CLI not found. Activate your virtualenv and 'pip install \"litellm[proxy]\"'." >&2
  exit 1
fi
# ---------------------------------------------------------------------------

# If Y3DHub has a DATABASE_URL (MySQL) it confuses LiteLLM (expects Postgres).
# Unless you plan to use LiteLLM's DB features, temporarily remove it.
unset DATABASE_URL

# Run LiteLLM proxy via CLI
exec "$LITE" --config "$CONFIG_FILE" --port "$PROXY_PORT" --host 0.0.0.0
