#!/usr/bin/env bash
#
# Deploy Iara (SPA estático) para o homeserver (OPS1).
#
# Roda NO homeserver via o runner self-hosted do GitHub (job `deploy` de
# .github/workflows/deploy.yml):
#   bash scripts/deploy-iara.sh <commit-sha>
# (A invocação da era Forgejo — `rsync dist/ homeserver:...` via SSH a partir
# da workstation — foi substituída: o runner executa localmente, sem SSH, sem
# envolvimento da workstation.)
#
# Flow: HEAD guard (só o HEAD atual de main deploya) -> flock (serialização)
# -> guard de idempotência (marker do SHA já deployado) -> workspace fetch no
# SHA -> bun install + build -> rsync local do dist para o diretório servido.
# Qualquer falha deixa o site atual intocado e o job vermelho.
#
# Environment defaults assumem o layout do homeserver: repo clonado de
# github.com/fsolla/iara-pwa (público — sem credencial; o clone pré-cutover
# apontava para o Forgejo local e é re-apontado idempotentemente abaixo).
# Requer `bun` no homeserver (passo manual do cutover).

set -euo pipefail

SHA="${1:?usage: deploy-iara.sh <commit-sha>}"
IARA_REPO_URL="${IARA_REPO_URL:-https://github.com/fsolla/iara-pwa.git}"
WORKSPACE_DIR="${WORKSPACE_DIR:-$HOME/iara-deploy}"
SERVE_DIR="${SERVE_DIR:-$HOME/iara-pwa/dist}"
DEPLOY_LOCK="${DEPLOY_LOCK:-/tmp/iara-deploy.lock}"
MARKER_FILE="${MARKER_FILE:-$HOME/iara-pwa/.deployed-sha}"
BUN_BIN="${BUN:-$(command -v bun || echo "$HOME/.bun/bin/bun")}"

say() { printf '[deploy] %s\n' "$*"; }

fatal() {
  say "FAILED: $*" >&2
  exit 1
}

# --- bun no homeserver (passo manual do cutover) -------------------------

[ -x "$BUN_BIN" ] || fatal "bun não encontrado em $BUN_BIN — instale no homeserver (ou defina BUN)"

# --- guards ------------------------------------------------------------

main_head="$(git ls-remote "$IARA_REPO_URL" refs/heads/main | awk '{print $1}')"
if [ "$main_head" != "$SHA" ]; then
  say "stale run: main is $main_head, job deploys $SHA — skipping"
  exit 0
fi

exec 9>"$DEPLOY_LOCK"
# ~20min de espera pelo lock: o job tem timeout de 30min — esperar mais que
# isso seria descartado pelo GitHub de qualquer forma.
flock -w 1200 9 || fatal "another deploy holds $DEPLOY_LOCK"

main_head="$(git ls-remote "$IARA_REPO_URL" refs/heads/main | awk '{print $1}')"
if [ "$main_head" != "$SHA" ]; then
  say "stale run after lock: main is $main_head, job deploys $SHA — skipping"
  exit 0
fi

# --- idempotency -------------------------------------------------------
# Um dispatch manual duplicado do mesmo SHA é um no-op: o marker guarda o
# SHA já servido em produção (a ausência do marker conta como "não
# deployado" — o deploy prossegue, direção segura).

if [ -f "$MARKER_FILE" ] && [ "$(cat "$MARKER_FILE")" = "$SHA" ]; then
  say "already deployed: $SERVE_DIR runs $SHA — nothing to do"
  exit 0
fi

# --- workspace at <sha> ------------------------------------------------

if [ ! -d "$WORKSPACE_DIR/.git" ]; then
  say "cloning $IARA_REPO_URL into $WORKSPACE_DIR"
  git clone "$IARA_REPO_URL" "$WORKSPACE_DIR"
else
  # OPS1: o clone pré-cutover apontava para o Forgejo local — re-aponta
  # idempotentemente para o repo que recebeu o merge.
  current_url="$(git -C "$WORKSPACE_DIR" remote get-url origin 2>/dev/null || true)"
  if [ -n "$current_url" ] && [ "$current_url" != "$IARA_REPO_URL" ]; then
    say "re-pointing workspace origin: $current_url -> $IARA_REPO_URL"
    git -C "$WORKSPACE_DIR" remote set-url origin "$IARA_REPO_URL"
  fi
  git -C "$WORKSPACE_DIR" fetch -q origin
fi

# Workspace limpo e no SHA exato: um deploy anterior falhado (ou residuo de
# build) não contamina o build — `bun install` recria o que precisar.
git -C "$WORKSPACE_DIR" reset -q --hard "$SHA"
git -C "$WORKSPACE_DIR" clean -q -fdx
git -C "$WORKSPACE_DIR" checkout -q --detach "$SHA"
say "workspace at $SHA"

# --- build -------------------------------------------------------------

"$BUN_BIN" install --frozen-lockfile --cwd "$WORKSPACE_DIR"
"$BUN_BIN" run --cwd "$WORKSPACE_DIR" build

# --- sync (local — o runner já está no homeserver) ----------------------

mkdir -p "$SERVE_DIR"
rsync -a --delete "$WORKSPACE_DIR/dist/" "$SERVE_DIR/"
printf '%s\n' "$SHA" > "$MARKER_FILE"

say "deploy concluido em $(date -u +%H:%M:%SZ) — $SERVE_DIR runs $SHA"
