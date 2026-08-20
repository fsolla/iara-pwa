# Iara — convenções de trabalho para agentes

**Iara** é um chat PWA local-first para falar com assistentes de IA (gateways
compatíveis com o protocolo ZeroClaw). Vite + React + TypeScript + assistant-ui
+ Tailwind v4 + vite-plugin-pwa. Sem backend próprio: o estado do cliente vive
no dispositivo (localStorage); o único servidor externo é o gateway WS do
usuário.

## Stack e scripts

- **Runtime:** bun (também há `node` para os scripts de agente — são ESM puros).
- `bun run dev` — dev server; `bun run build` — `tsc -b && vite build` (build de produção em `dist/`); `bun run preview` — servir o build.
- `bun run gate` — gate local: `lint` (oxlint) + `build` (typecheck + build). Rode antes de push.
- `bun run test:e2e` — **e2e Playwright; roda SÓ no CI, nunca local** (decisão do fluxo: não rodar e2e local para não divergir do CI).

## Arquitetura do código

- `src/lib/ws.ts` — protocolo WebSocket `zeroclaw.v1` (tipos de mensagens, conecta em `<gateway>/ws/chat?token=&agent=&name=`). **Contrato**: mudar tipos de protocolo é breaking.
- `src/lib/messages.ts` — normalização/montagem de mensagens.
- `src/lib/settings.ts` — config local (URL/key/agente/STT/TTS) em localStorage.
- `src/lib/voice.ts` — STT/TTS opcional (Web Speech + endpoints configuráveis).
- `src/components/Chat.tsx` — thread + composer (assistant-ui primitives).
- `src/components/Settings.tsx` — tela de configuração.
- `src/components/ApprovalCard.tsx` — card de aprovação (`approval_request` → `approval_response`).
- `vite.config.ts` — base `/_app/` (servido pelo gateway do ZeroClaw), PWA manifest + service worker, background sync do WS.

**Invariantes:** local-first (nada de servidor para estado do cliente); token
nunca logado/commitado; aprovações nunca auto-aprovadas; copy pt-BR /
identificadores em inglês; assets offline em `globPatterns` do PWA.

## Harness do agente

- **Skills:** `.agents/skills/` — fluxo custom + pack de engenharia (fonte de
  verdade: `skills-lock.json`; detalhes no Workflow de trabalho).
- **MCPs:** contrato em `opencode.jsonc` na raiz — seleção sobre os globais
  (`~/.config/opencode/opencode.jsonc`). Em uso: `forgejo`, `playwright`,
  `jina`. Desligados no repo: `postgres` (sem backend; global aponta pro banco
  do teqo) e `stalwart` (e-mail pessoal). `penpot`/secrets do teqo nunca
  entram. MCP novo ou re-habilitado passa por lá, com comentário registrando o
  porquê.

## Workflow de trabalho (fluxo tipo teqo)

**Pack de skills de engenharia:** em `.agents/skills/` (além das 5 de fluxo custom), com proveniência/hashes em `skills-lock.json` na raiz — fonte de verdade; upgrade deliberado via `npx skills update -y`.

Issues do Forgejo (`git.solla.dev/amana/iara-pwa`) são a fonte canônica de
spec/status/deps/prio. Estado em labels: `ready | in-progress | blocked | done`
(+ `in-prod`). Frontmatter no body da Issue:

```yaml
---
id: I7
depends: [I3]
serializes: []
priority: P1
---
Plano: [`docs/plans/<slug>.md`](docs/plans/<slug>.md)
```

Ciclo completo (detalhes nas skills `plan-issue` / `work-issue`):

1. **`/plan-issue`** (num worktree `bun run worktree plan`) → plano de intenção em `docs/plans/<slug>.md` + Issue `blocked` (`bun run agent:register --plan`) → PR `Related #N` → merge → `bun run agent:ready -- --issue N` (ou o CI promove sozinho).
2. **`bun run worktree next`** → claima a próxima Issue `ready` (label `in-progress`), cria worktree `~/.worktrees/iara/<code>-<slug>` de `origin/main`, roda `bun install` e abre o opencode com `/work-issue --issue N`.
3. **`/work-issue`** → plano de implementação (`docs/plans/<slug>-impl.md`), pausa para aprovação humana, execução.
4. **`/simplify`** (skill `code-simplification`) → 3 reviews locais paralelos no diff.
5. **`capture-review-debts`** → triagem + débitos (`bun run agent:register` / `agent:file-miss`).
6. **PR Ready** `Closes #N` com auto-merge (`bun run pr -- --automerge`) → CI (lint+build+e2e) → merge → `done`/`in-prod` → deploy (manual, `workflow_dispatch`).

### Comandos de agente (bun)

| Comando | O que faz |
| ------- | --------- |
| `bun run worktree next/plan/new/kill` | fila → worktree da Issue / planejamento / neutro / destruir |
| `bun run issue next\|all` | próxima claimável / overview (read-only) |
| `bun run agent:claim` | claima a próxima `ready` (não usar em sessão — `worktree next` já claima) |
| `bun run agent:register` | cria Issue rastreável (com `--plan` nasce `blocked`) |
| `bun run agent:ready` | promove `blocked` → `ready` (plano em main) |
| `bun run agent:file-miss` | registra défice do fluxo de agentes |
| `bun run agent:status` | grafo/overview read-only |
| `bun run pr -- --head <b> --body "Closes #N" --automerge` | cria PR no GitHub (Ready) e arma o auto-merge nativo — o servidor mergea quando `checks` ficar green (requer `GITHUB_TOKEN` env) |
| `bun run configure:branch-protection` | (re)aplica a proteção de `main` no GitHub (required check `checks` + enforce admins; idempotente) |

**O comando de terminal `worktree` é o roteador global** (`~/.config/shell/worktree.sh`): descobre o projeto pelo diretório atual (`git rev-parse`) e roda o script do projeto; config por projeto em `.forgejo/worktree.env` (commitado, sem secrets).

## CI (GitHub Actions — `.github/workflows/`)

O **código/PR/CI vive no GitHub** (`github.com/fsolla/iara-pwa`, público; o
`origin` local aponta para ele após o cutover); o **tracker de Issues
permanece no Forgejo** (`git.solla.dev/amana/iara-pwa` — labels, claims,
`bun run issue`/`agent:*` e os flips pós-merge continuam falando com a API do
Forgejo; GitHub é só o host do Actions).

- `ci.yml` — **PR gate**: job único `checks` em `ubuntu-latest` (lint + build +
  unit + **e2e** Playwright); seu check-run `CI / checks` é o required check de
  `main` — literal de match na proteção: `checks` (o GitHub casa pelo nome do
  check-run/job; a UI exibe `CI / checks`). **Sem verificador de `main`** —
  publicar é ato manual (deploy.yml).
- `deploy.yml` — **manual (`workflow_dispatch`)**: `verify` (hosted, suíte
  **full**) → `deploy` (`needs: [verify]`, runner **self-hosted no
  homeserver**) executando `scripts/deploy-iara.sh` localmente (sem SSH;
  idempotente via marker do SHA).
- `issue-done-on-main-merge.yml` — PRs mergeadas com `Closes #N` flipam a Issue
  para `done`/`in-prod` no Forgejo via API (`scripts/forgejo-issue-transition.mjs`,
  fail-loud).
- `plan-issue-ready-on-main-merge.yml` — PRs com `Related #N` promovem `blocked`
  → `ready` (`scripts/agent-promote-related-on-merge.mjs`).
- `agent-pr-ready-automerge.yml` — safety net: arma o **auto-merge nativo** do
  GitHub (GraphQL `enablePullRequestAutoMerge`, rebase) para todo PR same-repo
  não-draft (`scripts/github-pr-automerge.mjs`). O servidor só mergeia com o
  required check `checks` verde — nada de poll.

**Branch protection REAL em `main`** (era Forgejo não tinha): required check
`checks` + `enforce_admins: true` (nem admin mergeia com CI vermelho).
Configurado via `bun run configure:branch-protection` (idempotente). O merge
automático é o nativo do GitHub — a semântica de "cria e mergea quando os
checks passarem" (`bun run pr -- --automerge`) é preservada pela garantia do
servidor (o `--automerge` local arma o auto-merge; sem poll local).

**Deploy:** manual via `workflow_dispatch` no GitHub (job `Deploy (manual)`), só
após `verify` full green. Nada de deploy automático em push.

**e2e só no CI** — nunca rode `bun run test:e2e` local como parte do fluxo normal.

**Arquivos do fluxo Forgejo** (`.forgejo/workflows/`, `forgejo-pr-automerge.mjs`)
permanecem **dormentes** como via de rollback até a remoção na entrega
sucessora (Fase 2); o runner do Forgejo fica desligado após o cutover.

## Regras de entrega

- **Gate antes de push:** `bun run gate` limpo. CI roda lint+build+e2e de novo no PR.
- **PR nunca draft** para entrega; `Closes #N` no body; auto-merge armado.
- **Nunca editar Issue `in-progress`** de outra sessão; débito vira Issue nova com `depends` no pai.
- **Planos imutáveis** para Issues `in-progress`/`done`/`in-prod` — refino = sucessor.
- **Sem `git push` nu** com o fluxo de agente — use o fluxo do PR (a branch é do worktree).
