# Plano: Pós-OPS1 Fase 2 — remover arquivos do fluxo Forgejo (workflows/scripts mortos)

Status: rascunho
Atualizado em: 2026-08-20
Issue: OPS1-F2 (sucessora de #17 OPS1)
Priority: P2
Appetite: ~1 sessão (remoção + fixups de consumidores + docs)

## Intenção

O fluxo GitHub Actions (OPS1, validado ao vivo: PRs #1/#3 no GitHub — CI `checks`
verde → auto-merge nativo → flips via API → deploy manual `workflow_dispatch`) é a
única via de CI/PR/deploy no repo. Os arquivos do fluxo Forgejo ficam **dormentes**
desde o cutover e devem sair do tree — é a Fase 2 prometida no impl plan do OPS1.

## O que NÃO negociar

- Tracker no Forgejo (Issues/labels/claims/flips via API): `forgejo-api.mjs`,
  `agent-*.mjs`, `issue.mjs`, `forgejo-issue-transition.mjs`,
  `agent-promote-related-on-merge.mjs` **ficam**; `.forgejo/worktree.env` fica
  (consumido pelo provisionamento de worktree — fora do escopo `workflows/*`).
- Desligar o runner do Forgejo é passo manual do runbook (fora do código).
- `ci.yml` de main não volta (deploy = dispatch manual).
- Nunca fechar o tracker (anti-goal do OPS1).

## O que remover

- `.forgejo/workflows/*` (4 arquivos: ci.yml, issue-done-on-main-merge.yml,
  plan-issue-ready-on-main-merge.yml, agent-pr-ready-automerge.yml).
- `scripts/forgejo-pr-automerge.mjs` (poll automerger da era Forgejo — substituído
  pelo auto-merge nativo + `github-pr-automerge.mjs`).
- Doc residuais que descrevem o fluxo Forgejo (varredura por `forgejo-pr-automerge`,
  `.forgejo/workflows`, "rsync homeserver:" etc.).

## Rabbit holes / fora de escopo

- Não deletar scripts do tracker (item NÃO negociar) nem `.forgejo/worktree.env`.
- Não editar `docs/plans/*` já congelado (história; a narrativa "dormentes até a
  Fase 2" permanece).
- Rollback continua sendo git history / PR reversível (não manter arquivos).

## Já resolvido no simplify (não reabrir)

- Resistência de reverter a Fase 2 foi mudada para "rollback = git history" (o main
  congelado do Forgejo ainda tem a árvore pré-cutover).

## Aceite

- `git grep` por `forgejo-pr-automerge|.forgejo/workflows` em scripts/workflows
  vivo → zero hits (fora do tracker e do env file).
- `bun run gate` limpo; um PR inteiro validado no GitHub depois da remoção
  (CI + merge + flip).