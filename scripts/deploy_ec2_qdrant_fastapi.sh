#!/usr/bin/env bash
set -Eeuo pipefail

# Linux EC2 single-node deployment:
# - Qdrant binary as a systemd service
# - FastAPI app from this repo as a systemd service
# - Local SQLite + local Qdrant

APP_NAME="${APP_NAME:-aihub-rag}"
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP_USER="${APP_USER:-${SUDO_USER:-$USER}}"
APP_GROUP="${APP_GROUP:-$(id -gn "$APP_USER")}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
APP_STATE_DIR="${APP_STATE_DIR:-/var/lib/$APP_NAME}"
VENV_DIR="${VENV_DIR:-/opt/$APP_NAME/venv}"
MODEL_CACHE_DIR="${MODEL_CACHE_DIR:-$APP_STATE_DIR/model_cache}"

APP_HOST="${APP_HOST:-0.0.0.0}"
APP_PORT="${APP_PORT:-8000}"
QDRANT_HOST="${QDRANT_HOST:-127.0.0.1}"
QDRANT_HTTP_PORT="${QDRANT_HTTP_PORT:-6333}"
QDRANT_GRPC_PORT="${QDRANT_GRPC_PORT:-6334}"

QDRANT_BASE_DIR="${QDRANT_BASE_DIR:-/opt/qdrant}"
QDRANT_BIN_DIR="${QDRANT_BIN_DIR:-$QDRANT_BASE_DIR/bin}"
QDRANT_STORAGE_DIR="${QDRANT_STORAGE_DIR:-/var/lib/qdrant/storage}"
QDRANT_SNAPSHOTS_DIR="${QDRANT_SNAPSHOTS_DIR:-/var/lib/qdrant/snapshots}"
QDRANT_CONFIG_DIR="${QDRANT_CONFIG_DIR:-/etc/qdrant}"

APP_ENV_DIR="${APP_ENV_DIR:-/etc/$APP_NAME}"
APP_ENV_FILE="${APP_ENV_FILE:-$APP_ENV_DIR/app.env}"
QDRANT_ENV_FILE="${QDRANT_ENV_FILE:-$APP_ENV_DIR/qdrant.env}"

FASTAPI_SERVICE_NAME="${FASTAPI_SERVICE_NAME:-$APP_NAME-fastapi}"
QDRANT_SERVICE_NAME="${QDRANT_SERVICE_NAME:-$APP_NAME-qdrant}"

INSTALL_DEPS="${INSTALL_DEPS:-1}"
INSTALL_QDRANT="${INSTALL_QDRANT:-1}"
INSTALL_PYTHON_DEPS="${INSTALL_PYTHON_DEPS:-1}"
WARM_MODEL="${WARM_MODEL:-1}"
RUN_TRAVEL_INGEST="${RUN_TRAVEL_INGEST:-0}"
USE_QDRANT="${USE_QDRANT:-true}"
LLM_PROVIDER="${LLM_PROVIDER:-none}"
OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o-mini}"
EMBED_MODEL="${EMBED_MODEL:-paraphrase-multilingual-MiniLM-L12-v2}"
TORCH_VERSION="${TORCH_VERSION:-2.5.1}"
DOCS_PATH="${DOCS_PATH:-$REPO_DIR/data/documents.jsonl}"
DATABASE_URL="${DATABASE_URL:-sqlite:///$APP_STATE_DIR/med_rag.db}"
QDRANT_VERSION="${QDRANT_VERSION:-}"

usage() {
  cat <<'EOF'
Usage:
  sudo bash scripts/deploy_ec2_qdrant_fastapi.sh

Optional environment variables:
  APP_USER=ec2-user
  REPO_DIR=/home/ubuntu/aihub-rag
  APP_PORT=8000
  QDRANT_VERSION=v1.17.1
  WARM_MODEL=0
  RUN_TRAVEL_INGEST=1
  TORCH_VERSION=2.5.1

What this script does:
  1. Installs OS packages
  2. Downloads a Qdrant Linux binary
  3. Creates systemd units for Qdrant and FastAPI
  4. Creates a Python virtualenv and installs requirements
  5. Starts both services
EOF
}

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy][error] %s\n' "$*" >&2
  exit 1
}

run_as_app() {
  sudo -u "$APP_USER" -H bash -lc "$*"
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    fail "Run this script with sudo or as root."
  fi
}

check_repo() {
  [[ -f "$REPO_DIR/requirements.txt" ]] || fail "requirements.txt not found under REPO_DIR=$REPO_DIR"
  [[ -f "$REPO_DIR/api/main.py" ]] || fail "api/main.py not found under REPO_DIR=$REPO_DIR"
}

resolve_qdrant_version() {
  if [[ -n "$QDRANT_VERSION" ]]; then
    return
  fi

  local latest
  latest="$(curl -fsSL https://api.github.com/repos/qdrant/qdrant/releases/latest | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1 || true)"
  QDRANT_VERSION="${latest:-v1.17.1}"
}

install_os_packages() {
  [[ "$INSTALL_DEPS" == "1" ]] || return 0

  if command -v apt-get >/dev/null 2>&1; then
    log "Installing Debian/Ubuntu packages"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y \
      ca-certificates \
      curl \
      tar \
      git \
      libgomp1 \
      python3 \
      python3-venv \
      python3-pip
    return 0
  fi

  if command -v dnf >/dev/null 2>&1; then
    log "Installing Amazon Linux/RHEL packages"
    dnf install -y \
      ca-certificates \
      tar \
      git \
      libgomp \
      python3.12 \
      python3.12-pip

    if command -v python3.12 >/dev/null 2>&1; then
      PYTHON_BIN="python3.12"
    elif command -v python3.11 >/dev/null 2>&1; then
      PYTHON_BIN="python3.11"
    fi
    return 0
  fi

  fail "Unsupported package manager. Expected apt-get or dnf."
}

detect_qdrant_asset() {
  local arch candidate url
  arch="$(uname -m)"

  case "$arch" in
    x86_64|amd64)
      for candidate in \
        "qdrant-x86_64-unknown-linux-musl.tar.gz" \
        "qdrant-x86_64-unknown-linux-gnu.tar.gz"
      do
        url="https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/${candidate}"
        if curl -fsI "$url" >/dev/null; then
          printf '%s\n' "$url"
          return 0
        fi
      done
      ;;
    aarch64|arm64)
      for candidate in \
        "qdrant-aarch64-unknown-linux-musl.tar.gz" \
        "qdrant-aarch64-unknown-linux-gnu.tar.gz"
      do
        url="https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/${candidate}"
        if curl -fsI "$url" >/dev/null; then
          printf '%s\n' "$url"
          return 0
        fi
      done
      ;;
    *)
      fail "Unsupported CPU architecture for this script: $arch"
      ;;
  esac

  fail "Unable to locate a downloadable Qdrant release asset for ${QDRANT_VERSION}"
}

install_qdrant_binary() {
  [[ "$INSTALL_QDRANT" == "1" ]] || return 0

  resolve_qdrant_version
  local url tmpdir archive
  url="$(detect_qdrant_asset)"
  tmpdir="$(mktemp -d)"
  archive="$tmpdir/qdrant.tar.gz"

  log "Installing Qdrant ${QDRANT_VERSION}"
  mkdir -p "$QDRANT_BIN_DIR" "$QDRANT_CONFIG_DIR" "$QDRANT_STORAGE_DIR" "$QDRANT_SNAPSHOTS_DIR"
  curl -fL "$url" -o "$archive"
  tar -xzf "$archive" -C "$QDRANT_BIN_DIR"
  chmod 0755 "$QDRANT_BIN_DIR/qdrant"
  ln -sf "$QDRANT_BIN_DIR/qdrant" /usr/local/bin/qdrant
  rm -rf "$tmpdir"

  if ! id -u qdrant >/dev/null 2>&1; then
    useradd --system --home /var/lib/qdrant --shell /usr/sbin/nologin qdrant
  fi
  chown -R qdrant:qdrant /var/lib/qdrant "$QDRANT_BASE_DIR" "$QDRANT_CONFIG_DIR"
}

setup_python_app() {
  [[ "$INSTALL_PYTHON_DEPS" == "1" ]] || return 0

  log "Preparing Python virtualenv"
  mkdir -p "$MODEL_CACHE_DIR" "$APP_STATE_DIR" "$(dirname "$VENV_DIR")"
  chown -R "$APP_USER:$APP_GROUP" "$MODEL_CACHE_DIR" "$APP_STATE_DIR" "$(dirname "$VENV_DIR")"

  if [[ -x "$VENV_DIR/bin/python" ]]; then
    local version_ok
    version_ok="$(run_as_app "'$VENV_DIR/bin/python' - <<'PY'
import sys
print('yes' if sys.version_info >= (3, 10) else 'no')
PY")"
    if [[ "$version_ok" != "yes" ]]; then
      run_as_app "rm -rf '$VENV_DIR'"
    fi
  fi

  if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    run_as_app "cd '$REPO_DIR' && '$PYTHON_BIN' -m venv '$VENV_DIR'"
  fi

  run_as_app "cd '$REPO_DIR' && PIP_NO_CACHE_DIR=1 '$VENV_DIR/bin/pip' install --upgrade pip setuptools wheel"
  run_as_app "cd '$REPO_DIR' && PIP_NO_CACHE_DIR=1 '$VENV_DIR/bin/pip' install --index-url https://download.pytorch.org/whl/cpu 'torch==${TORCH_VERSION}'"
  run_as_app "cd '$REPO_DIR' && PIP_NO_CACHE_DIR=1 '$VENV_DIR/bin/pip' install -r requirements.txt"
}

warm_embedding_model() {
  [[ "$WARM_MODEL" == "1" ]] || return 0

  log "Warming sentence-transformers model cache"
  run_as_app "cd '$REPO_DIR' && SENTENCE_TRANSFORMERS_HOME='$MODEL_CACHE_DIR' '$VENV_DIR/bin/python' - <<'PY'
from sentence_transformers import SentenceTransformer
SentenceTransformer('${EMBED_MODEL}')
print('model cache ready')
PY"
}

write_env_files() {
  log "Writing environment files"
  mkdir -p "$APP_ENV_DIR"

  cat > "$QDRANT_ENV_FILE" <<EOF
QDRANT__SERVICE__HOST=${QDRANT_HOST}
QDRANT__SERVICE__HTTP_PORT=${QDRANT_HTTP_PORT}
QDRANT__SERVICE__GRPC_PORT=${QDRANT_GRPC_PORT}
QDRANT__STORAGE__STORAGE_PATH=${QDRANT_STORAGE_DIR}
QDRANT__STORAGE__SNAPSHOTS_PATH=${QDRANT_SNAPSHOTS_DIR}
EOF

  cat > "$APP_ENV_FILE" <<EOF
DOCS_PATH=${DOCS_PATH}
LLM_PROVIDER=${LLM_PROVIDER}
OPENAI_MODEL=${OPENAI_MODEL}
DATABASE_URL=${DATABASE_URL}
USE_QDRANT=${USE_QDRANT}
QDRANT_URL=http://${QDRANT_HOST}:${QDRANT_HTTP_PORT}
QDRANT_COLLECTION=domain_docs
EMBED_MODEL=${EMBED_MODEL}
SENTENCE_TRANSFORMERS_HOME=${MODEL_CACHE_DIR}
EOF

  chmod 0640 "$QDRANT_ENV_FILE" "$APP_ENV_FILE"
}

write_systemd_units() {
  log "Writing systemd unit files"

  cat > "/etc/systemd/system/${QDRANT_SERVICE_NAME}.service" <<EOF
[Unit]
Description=Qdrant Vector Database (${APP_NAME})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=qdrant
Group=qdrant
EnvironmentFile=${QDRANT_ENV_FILE}
WorkingDirectory=/var/lib/qdrant
ExecStart=/usr/local/bin/qdrant
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

  cat > "/etc/systemd/system/${FASTAPI_SERVICE_NAME}.service" <<EOF
[Unit]
Description=FastAPI Service (${APP_NAME})
After=network-online.target ${QDRANT_SERVICE_NAME}.service
Wants=network-online.target
Requires=${QDRANT_SERVICE_NAME}.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
EnvironmentFile=${APP_ENV_FILE}
WorkingDirectory=${REPO_DIR}
ExecStart=${VENV_DIR}/bin/uvicorn api.main:app --host ${APP_HOST} --port ${APP_PORT}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

start_services() {
  log "Reloading systemd and starting services"
  systemctl daemon-reload
  systemctl enable --now "${QDRANT_SERVICE_NAME}.service"
  systemctl enable --now "${FASTAPI_SERVICE_NAME}.service"
}

run_travel_ingest() {
  [[ "$RUN_TRAVEL_INGEST" == "1" ]] || return 0

  log "Running optional travel Qdrant ingest"
  run_as_app "cd '$REPO_DIR' && QDRANT_URL='http://${QDRANT_HOST}:${QDRANT_HTTP_PORT}' '${VENV_DIR}/bin/python' scripts/ingest_travel_qdrant.py"
}

print_next_steps() {
  cat <<EOF

Deployment completed.

Services:
  systemctl status ${QDRANT_SERVICE_NAME}.service
  systemctl status ${FASTAPI_SERVICE_NAME}.service

Logs:
  journalctl -u ${QDRANT_SERVICE_NAME}.service -f
  journalctl -u ${FASTAPI_SERVICE_NAME}.service -f

Health checks:
  curl http://127.0.0.1:${QDRANT_HTTP_PORT}/collections
  curl http://127.0.0.1:${APP_PORT}/healthz

App URL:
  http://<EC2-PUBLIC-IP>:${APP_PORT}

Important:
  - Open EC2 security group inbound for TCP ${APP_PORT}
  - Keep Qdrant port ${QDRANT_HTTP_PORT} private unless you explicitly need remote access
  - If you want better HTTPS/public routing later, place Nginx or ALB in front of FastAPI
EOF
}

main() {
  if [[ "${1:-}" =~ ^(-h|--help)$ ]]; then
    usage
    exit 0
  fi

  require_root
  check_repo
  install_os_packages
  install_qdrant_binary
  setup_python_app
  warm_embedding_model
  write_env_files
  write_systemd_units
  start_services
  run_travel_ingest
  print_next_steps
}

main "$@"
