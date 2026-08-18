# Impl: I8 — Lint: remover import homedir não usado em scripts/worktree.mjs

Status: aprovado
Atualizado em: 2026-08-18
Issue: #8
Intenção: body da Issue (sem plano de intenção — body é a spec)
Appetite restante: P3, 1 linha — sem corte necessário

## Leitura da intenção

- **Outcome:** `bun run lint` (oxlint) limpo — sem o warning `no-unused-vars`
  para o import de `homedir` em `scripts/worktree.mjs` (pré-existente, apareceu
  no gate de I1).
- **O que NÃO negociar:** zero mudança de comportamento — é só remoção de
  import morto; copy/comentários do script intactos.
- **O que reavaliar:** se `homedir` é usado em outro ponto do script —
  **verificado:** não. A única outra ocorrência é um comentário em
  `scripts/lib/load-project-env.mjs:38` (que resolve `~` internamente), não uma
  dependência do `worktree.mjs` no import.

## Abordagem recomendada

```mermaid
flowchart LR
  A[worktree.mjs:65 import homedir] --> B[remover a linha]
  B --> C[oxlint limpo]
  C --> D[gate local e CI inalterados]
```

**Opções consideradas:** A) remover a linha do import | B) manter com
`// eslint-disable` | C) mover o import para onde seria usado
**Recomendação:** A — o import é morto de verdade (verificado por grep +
warning do próprio oxlint); `node:os` não traz mais nada para o arquivo.
**Rejeitadas:** B porque silencia o lint em vez de remover o morto (e o warning
é do pré-existente, não de regra nova). C porque não há uso para mover — o
arquivo não toca `os.homedir()` em lugar nenhum.

### Componentes / mudanças

- **`scripts/worktree.mjs`**: remover a linha 65 (`import { homedir } from 'node:os'`)
  — nenhum outro arquivo/dependência muda.
- **Migration:** sem migration. **Access/Consent:** n/a (script de dev tooling).
- **UI:** n/a — sem mudança de produto.

## Fases verificáveis

1. **Lint fix** — remover a linha 65 de `scripts/worktree.mjs` (1 linha).
2. **Gates** — `bun run lint` limpo e `bun run gate` (lint + build) verde;
   sanity check de que o script segue importável (módulo ESM puro).

## Rabbit holes / Não escopo (engenharia)

- Caça geral a imports não usados em `scripts/` — o oxlint já cobre; se outros
  warnings existirem, são débitos a triar no fechamento, não neste PR.
- Mudar a resolução de `~` do script para usar `os.homedir()` — não é o
  pedido; `load-project-env.mjs` já resolve o home do jeito certo.

## Riscos e mitigação

- **Baixo:** remoção de 1 linha de import sem uso em script de dev tooling;
  se algo referenciasse o símbolo, o próprio `bun run build`/typecheck
  acusaria na hora. Verificado por grep que não há usos.

## Aceite de engenharia

- [x] Aceite de produto da intenção ainda coberto (lint limpo em worktree.mjs)
- [x] Invariantes AGENTS/engineering-standards (zero mudança de runtime)
- [x] Testes de domínio previstos: n/a — change de tooling, verificação via
  `bun run lint`/`bun run gate`
