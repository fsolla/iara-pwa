# Planos de intenção / implementação

Convenção herdada do teqo (paralelismo com fila de claim em Issues Forgejo):

- **`docs/plans/<slug>.md`** — plano de **intenção** (produto): o quê / para
  quem / por quê / outcome, direção suave no codebase. Criado pela skill
  `plan-issue`; a Issue nasce `blocked` até o plano estar em `main`.
- **`docs/plans/<slug>-impl.md`** — plano de **implementação** (engenharia):
  abordagem + rejeitadas + fases. Criado pela skill `work-issue` no worktree,
  com gate humano antes da execução.

Planos de Issues `in-progress`/`done`/`in-prod` são **imutáveis** — refino vira
plano + Issue sucessor (`depends` no pai).
