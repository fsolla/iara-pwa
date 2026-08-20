# Plano: Pós-OPS1 — consolidar parseArgs e extrair cascata `checks` em workflow reutilizável

Status: rascunho
Atualizado em: 2026-08-20
Issue: OPS1-DRY (sucessora de #17 OPS1)
Priority: P3
Appetite: ~1 sessão leve (fill-in)

## Intenção

Débitos de DRY encontrados no review do OPS1 (simplify reviewers), que ficaram
para trás para não misturar refactor com a migração de CI:

1. **parseArgs duplicado em 4 scripts.** `scripts/pr.mjs`, `scripts/github-pr-automerge.mjs`
   e `scripts/configure-branch-protection.mjs` têm cópias locais; `scripts/lib/agent-forgejo.mjs`
   exporta outro idêntico (flagsWithValue + positional + kebab→camel). Consolidar num
   `scripts/lib/cli.mjs` único e importar nos 4 — sem tocar a semântica (fail-closed nos
   flags sem valor, positional, prefixo `--`).
2. **Cascata `checks` duplicada em `ci.yml` e no `verify` do `deploy.yml`.** O mesmo
   fluxo (checkout → setup-bun → install → lint → build → unit → playwright → e2e) em
   dois arquivos; risco de drift (ex.: esquecer `playwright install` em um dos dois).
   Extrair numa reusable workflow (`workflow_call`) chamada pelos dois, preservando o
   nome do job `checks` em `ci.yml` (o required-check literal `checks` não pode mudar).

## O que NÃO negociar

- O literal `checks` (required check + auto-merge) — com reusable workflow, o job
  `checks` fica declarado em `ci.yml` (o check-run `CI / checks` é inalterado).
- Comportamento/política do parser (as 3 variantes hoje divergem só em
  flagsWithValue/positional — unificar com o superset; cada chamador filtra).

## Fases

1. `parseArgs` em `cli.mjs` + importar em `pr.mjs`, `github-pr-automerge.mjs`,
   `configure-branch-protection.mjs`, `agent-forgejo.mjs` (remover as cópias). Gate:
   `bun run test:unit`.
2. Reusable workflow `checks` (workflow_call) + `ci.yml` e `deploy.yml` `verify`
   passando a usá-la. Gate: `bun run gate` + validação ao vivo (PR → check `checks`).

## Rabbit holes / fora de escopo

- Não mudar o comportamento do parser (só mover/consolidar).
- Não mesclar DRY com UX.
- `agent-forgejo.mjs` (tracker) só troca o parseArgs — nada da lógica de claim.

## Já resolvido no simplify (não reabrir)

- Nada do OPS1-DRY foi resolvido — é o próprio conteúdo pós-review diferido.

## Aceite

- Zero `parseArgs` duplicado (busca por `const parseArgs` → 1 em cli.mjs).
- `ci.yml` e `deploy.yml` `verify` usam o mesmo `workflow_call`; um PR validado mostra
  o check-run `CI / checks` idêntico.