# Runbook — CI/PR no GitHub, tracker no Forgejo, deploy manual (OPS1)

O código/PR/CI vive no GitHub (`github.com/fsolla/iara-pwa`, público); as
Issues/labels/claims continuam no Forgejo (`git.solla.dev/amana/iara-pwa`,
via API); o deploy é **manual** (`workflow_dispatch` no GitHub) com o runner
self-hosted **no homeserver** — nada de deploy automático em push e a
workstation não roda mais a suíte de CI.

## Cutover (uma vez, nesta ordem — passos (a)–(c) ANTES do primeiro push)

1. **(a) Remotes locais.** `origin` passa a ser o GitHub; o Forgejo fica como
   remote secundário congelado (o repo lá para de receber push; tracker
   intacto por API).

   ```bash
   git remote set-url origin git@github.com:fsolla/iara-pwa.git
   git remote add forgejo ssh://git@192.168.15.142:2222/amana/iara-pwa.git 2>/dev/null || true
   ```

   O config de remotes é compartilhado entre os worktrees do repo (`.git/config`
   único) — vale para todos. Sem este passo, `bun run gate`/diff comparariam
   contra um `origin/main` defasado (Forgejo).

2. **(b) Secrets e config do repo no GitHub.**
   - Secret `FORGEJO_API_TOKEN` no repo (PAT do Forgejo com escopo de repo —
     usado pelos flips pós-merge; nunca o `GITHUB_TOKEN`).
   - Repo setting **Allow auto-merge** habilitado (Settings → General →
     Allow auto-merge) — sem isso o GraphQL `enablePullRequestAutoMerge`
     falha e o job do safety net vai vermelho (visível).
   - Localmente: `GITHUB_TOKEN` PAT do usuário (escopo `repo`) para
     `bun run pr` e `bun run configure:branch-protection`.

3. **(c) Branch protection de `main`** (required check `checks` +
   `enforce_admins: true`):

   ```bash
   GITHUB_TOKEN=<PAT> bun run configure:branch-protection -- --dry-run
   GITHUB_TOKEN=<PAT> bun run configure:branch-protection
   ```

4. **(d) Desligar o runner do Forgejo** (reversível) — logo após o primeiro PR
   GitHub validado: sem ele, nada mais dispara no repo congelado; o runner
   volta a disputar a workstation à toa.

5. **(e) Homeserver: bun + runner self-hosted do GitHub.**
   - Instalar `bun` no homeserver (o `scripts/deploy-iara.sh` usa `bun install`
     + `bun run build` lá — precisa existir no PATH do runner; `BUN` env
     sobrepõe o default).
   - Instalar o `actions-runner` com labels `self-hosted, homeserver`.
   - **Não ligar** "Send workflows to a self-hosted runner" para fork PRs
     (default OFF no GitHub): o repo é público e o `deploy` executa código na
     máquina de produção — se esse setting ligar algum dia, um fork PR pode
     virar RCE no homeserver.
   - Não bloqueia PRs: o deploy é manual e só existe depois do runner.

6. **(f) Push → PR → CI → merge → flips.** O PR do próprio OPS1 valida o fluxo
   ao vivo: CI `checks` no GitHub → auto-merge → flip da Issue no Forgejo.

## Deploy de produção

1. `workflow_dispatch` no GitHub (`Deploy (manual)`) — roda `verify` (hosted,
   suíte full incl. e2e) e, só se verde, `deploy` no homeserver
   (`scripts/deploy-iara.sh <sha>`: HEAD guard → flock → marker do SHA →
   build → rsync local para `~/iara-pwa/dist/`).
2. Dispatch do mesmo SHA de novo → no-op idempotente (marker).

## Rollback

- **CI/PR:** os arquivos do fluxo Forgejo (`.forgejo/workflows/`,
  `scripts/forgejo-pr-automerge.mjs`) permanecem **dormentes** no repo até a
  Fase 2 (remoção na entrega sucessora). Reverter a este PR restaura o fluxo
  GitHub anterior; reverter a Fase 2 restaura o fluxo Forgejo (religar o
  runner e apontar `origin` de volta para o Forgejo).
- **Deploy:** o site servido é um diretório estático (`~/iara-pwa/dist/`); o
  marker `~/iara-pwa/.deployed-sha` registra o SHA em produção — para reverter,
  re-dispatch do SHA anterior (ou rsync manual).

## Falhas conhecidas

- **Literal do required check:** a proteção usa `checks` (nome do check-run/
  job), não o display `CI / checks` — pinado no spec unit. Se o PR não mergear
  com `mergeable_state: blocked`, re-verifique o literal com
  `configure:branch-protection` (drift reporta).
- **Flip com 404:** se `FORGEJO_REPOSITORY`/`FORGEJO_API_URL` sumirem de um
  workflow de flip, a lib resolve `GITHUB_REPOSITORY` (repo GitHub) → 404 no
  tracker. Os workflows novos setam ambos explicitamente; falha agora sai
  vermelha (fail-loud), nunca silenciosa.
