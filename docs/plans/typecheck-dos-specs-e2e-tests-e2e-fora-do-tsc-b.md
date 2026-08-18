# I9 — Typecheck dos specs e2e (tests/e2e fora do tsc -b)

Status: blocked
Atualizado em: 2026-08-18
Issue: #13 (id I9)
Intenção: achado do /simplify de I7 — mesma classe de buraco que I7 fechou na
config, um nível abaixo: `tests/e2e/*.spec.ts` não é typechecked por nenhum
projeto tsc (`tsconfig.test.json` cobre só `tests/unit` + `tests/helpers`).
Appetite: P3, fill-in de tooling (~1 linha + gates).

## Plano curto

**Fase 1 — cobertura:** adicionar `tests/e2e` ao include do
`tsconfig.test.json` (ou ao `tsconfig.node.json`, decidir na execução pelo
runtime do helper importado pelos specs — hoje importam só `@playwright/test`).
Verificado no simplify de I7: os 2 specs atuais compilam limpos sob as flags do
projeto node (module nodenext, types node).

**Fase 2 — gates:** `bun run build` + `bun run gate` limpos; e2e segue só no CI.

## Adiado com gatilho

- **Glob `*.config.ts` no tsconfig.node.json** — config raiz futura cai fora do
  typecheck de novo (o bug que I7 corrigiu). Gatilho: **3º arquivo
  `*.config.ts` na raiz** → migrar o include para `["*.config.ts"]`.
- **`strict: true` nos projetos tsc** — repo inteiro roda sem strict
  (pré-existente). Gatilho: decisão repo-wide de adoção de strict (pode abrir
  erros em todos os projetos), fora de lote de tooling.

## Explicitamente fora

- Nada mais do simplify de I7: o resto foi absorvido no próprio I7 ou
  descartado (sem achado acionável).
