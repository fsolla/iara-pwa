# Pipeline de execução compartilhada (work-issue)

Mecânica comum de execução → fechamento do fluxo (humano supervisiona). O corpo
mora aqui; `work-issue/SKILL.md` referencia este material.

## Executar

Ordem:

1. **Camadas base** — utilitários, libs (`src/lib/`), tipos de domínio
   (`src/lib/ws.ts`, `src/lib/messages.ts`, `src/lib/settings.ts`).
2. **UI** — `src/components/` (Chat, Settings, ApprovalCard): shape → craft →
   critique → polish.
3. **Gates** — `bun run gate` na iteração (lint + build/typecheck). Entrega via
   push da branch (o PR roda o CI completo).

Tracer bullet cedo se o item for grande. Inclua o `*-impl.md` no commit da
entrega.

## /simplify + débitos

1. Rode a skill `code-simplification` completa (**3 reviewers paralelos via
   Task, read-only**) no diff da sessão.
2. Aplique fixes pontuais que preservem comportamento.
3. Rode `capture-review-debts` autônomo (o agente decide o destino). Nunca
   edite a Issue `in-progress` atual para absorver débitos.

## Fechar em main

1. Branch do ator (ver deltas) — nunca crie branch nova fora dela.
2. Commit (inclua o `*-impl.md`).
3. Push da branch para o origin.
4. PR **Ready** (nunca draft) com `Closes #<N>`:

```bash
bun run pr -- --head <branch> --title "<título>" --body "Closes #<N>" --automerge
```

`--automerge` aguarda os checks (branch protection `checks`) e mergea por
rebase. O workflow de CI (`issue:transition`) flipa `done`/`in-prod` no merge.
Comente na Issue o desfecho em uma linha.

## Deltas por ator

| Ator | Branch | UI | `capture-review-debts` |
| ---- | ------ | --- | ---------------------- |
| **Humano** (`work-issue`) | `<Code>-<slug>` (worktree; nunca crie branch nova na sessão) | shape → craft → critique → polish | **autônomo** — decide o destino dos achados (registrar/absorver/deferir/descartar) pela triage da skill; sem pausa para o humano |
