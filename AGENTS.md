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

**Pack de skills de engenharia:** em `.agents/skills/` (além das 5 de fluxo custom), com proveniência/hashes em `skills-lock.json` na raiz — fonte de verdade; upgrade deliberado via `npx skills update`.

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

## Workflow de trabalho (fluxo tipo teqo)

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
6. **PR Ready** `Closes #N` com auto-merge (`bun run pr -- --automerge`) → CI (lint+build+e2e) → merge → `done`/`in-prod` → deploy.

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
| `bun run pr -- --head <b> --body "Closes #N" --automerge` | cria PR e mergea quando os checks passarem |

**O comando de terminal `worktree` é o roteador global** (`~/.config/shell/worktree.sh`): descobre o projeto pelo diretório atual (`git rev-parse`) e roda o script do projeto; config por projeto em `.forgejo/worktree.env` (commitado, sem secrets).

## CI (Forgejo Actions — `.forgejo/workflows/`)

- `ci.yml` — em push (main) e PR: job `checks` (lint + build + **e2e** Playwright) e job `deploy` (só main, `needs: checks`, rsync para o homeserver).
- `issue-done-on-main-merge.yml` — PRs mergeadas com `Closes #N` flipam a Issue para `done`/`in-prod` (`scripts/forgejo-issue-transition.mjs`).
- `plan-issue-ready-on-main-merge.yml` — PRs com `Related #N` promovem `blocked` → `ready` (`scripts/agent-promote-related-on-merge.mjs`).
- `agent-pr-ready-automerge.yml` — marca Ready e mergea quando `checks` ficar green (safety net do auto-merge).

**Sem branch protection server-side em `main`** (espelha o teqo): o gate de merge é o
próprio script de auto-merge (`pr.mjs --automerge` / `forgejo-pr-automerge.mjs`),
que espera os status checks ficarem green antes de mergear; o deploy é gated pelo
`needs: checks` do `ci.yml`.

**e2e só no CI** — nunca rode `bun run test:e2e` local como parte do fluxo normal.

## Regras de entrega

- **Gate antes de push:** `bun run gate` limpo. CI roda lint+build+e2e de novo no PR.
- **PR nunca draft** para entrega; `Closes #N` no body; auto-merge armado.
- **Nunca editar Issue `in-progress`** de outra sessão; débito vira Issue nova com `depends` no pai.
- **Planos imutáveis** para Issues `in-progress`/`done`/`in-prod` — refino = sucessor.
- **Sem `git push` nu** com o fluxo de agente — use o fluxo do PR (a branch é do worktree).
