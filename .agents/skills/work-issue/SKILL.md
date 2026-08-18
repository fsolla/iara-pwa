---
name: work-issue
description: >-
  Executa uma Issue já claimada de ponta a ponta com supervisão humana no
  plano: o contexto da sessão identifica a Issue (sem claim), Plan mode com
  plano de implementação, pausa para confirmação humana, depois execução →
  /simplify → capture-review-debts autônomo (o agente decide o que registrar
  e o que descartar) → PR Ready em main com auto-merge. Use quando o usuário
  pedir /work-issue, quiser supervisionar a abordagem de engenharia, ou
  trabalhar uma Issue com gate humano antes do código.
disable-model-invocation: true
---

# Work-issue (humano supervisiona)

Fluxo próprio do humano na sua máquina, com a sessão aberta no worktree da
Issue. A sessão **já nasce no contrato**: Issue claimada, worktree correto,
branch correta — o claim é feito **fora da skill** (o `worktree next` claima).
A skill assume isso e vai direto ao trabalho — **nenhum passo de
claim/ambiente** (só a validação de contexto do Passo 1).

Os materiais compartilhados vivem aqui como referência: `engineering-brief.md`,
`implementation-template.md`, `decision-quality.md`, `execution-pipeline.md`
(mecânica de execução → fechamento).

**Proibido:** merge sem CI green; editar outras Issues `in-progress`; pular a
pausa do impl plan; Draft / sem auto-merge.

## Checklist

```
- [ ] 0. Prep: `bun install` se preciso
- [ ] 1. Contexto: Issue do prompt/`$ARGUMENTS` da sessão (ausente → UMA pergunta com validação; nunca claim)
- [ ] 2. Abrir o plano de intenção do body da Issue (`Plano: docs/plans/...`; sem link → body é spec)
- [ ] 3. Plan mode → escrever `docs/plans/<slug>-impl.md` → **PARAR e confirmar com o humano**
- [ ] 4. Após "ok": Passo 4 (execução → /simplify → débitos autônomos → PR, via `execution-pipeline.md`)
```

## Passo 1 — Contexto da sessão

A Issue chega no prompt/`$ARGUMENTS` do `/work-issue` (`--issue <N>` ou o número).
Sempre consulte o Forgejo para o resto (fonte única é a Issue, nunca um brief
duplicado).

- **Presente** → valide o básico (consulte a Issue: existe, `OPEN`, label
  `in-progress` — confirma que o claim foi feito fora da skill) e use.
- **Ausente** → **uma** pergunta ao humano ("Qual Issue?"), valide o número
  informado com a mesma checagem e siga.
- **Checagem falhou** (não existe / não `OPEN` / sem `in-progress`) → a Issue
  não está claimada: **pare e peça ao humano** para reabrir a sessão
  (`bun run worktree next --issue <N>`; o `worktree next` claima). Nunca siga
  com Issue não claimada, nunca claim na sessão.
- **Nunca rode `bun run agent:claim`** — claim é contrato do ambiente
  (`worktree next`), não da skill.

## Passo 2 — Intenção

O path do plano de intenção vem do **body da Issue** (`Plano: [docs/plans/<slug>.md]`).
Sem plano linkado → o body é a spec. Abra e leia.

## Passo 3 — Plano de implementação + GATE humano

Plan mode: `SwitchMode` → `plan` (deliberar engenharia a partir da intenção).

1. Leia `engineering-brief.md` e aplique skills/princípios sob demanda.
2. Explore o código o bastante para **reavaliar** a "Direção no codebase" da
   intenção — você **deve** escolher a melhor abordagem maintainable, mesmo que
   difira da hipótese do plano de intenção, desde que o **aceite de produto** se
   mantenha.
3. Escreva `docs/plans/<slug>-impl.md` via `implementation-template.md`.
   Qualidade: `decision-quality.md` ≥4/5.
4. Apresente no chat: abordagem recomendada, opções rejeitadas, fases, riscos,
   o que diverge da hipótese de direção da intenção.
5. **Pare.** Não escreva código de feature até confirmação explícita ("ok",
   "pode executar", "aprovado", …).
6. Se o humano pedir mudança de abordagem → revise o `*-impl.md` e reapresente.
7. Confirmação → marque Status `aprovado` no impl plan → `SwitchMode` `agent` →
   continue.

Divergência material de produto (aceite/persona da intenção não cabem):
pare e **pergunte ao humano** — ele decide entre item sucessor ou `blocked`;
nunca invente produto novo.

## Passo 4 — Executar

`SwitchMode` → `agent` se ainda estiver em plan. Siga a mecânica de
[`execution-pipeline.md`](execution-pipeline.md) (executar → simplify →
fechar em main), com os deltas do ator humano:

- **Branch:** `<Code>-<slug>` do worktree — nunca crie branch nova na sessão.
- **UI:** shape → craft → critique → polish.
- **`capture-review-debts`:** **autônomo** — colha, dedupe, pontue e **decida
  você mesmo o destino** (registrar/absorver/deferir/descartar) pela triage
  da própria skill, **sem pausa para o humano**; registre via
  `bun run agent:register` / `bun run agent:file-miss` (Issues novas com
  `depends` no pai se necessário) e resuma o que registrou vs descartou no
  fechamento.

## Resumo final

Issue (contexto da sessão) · impl plan (abordagem + rejeitadas + divergências da
hipótese) · simplify + débitos registrados/deferidos · PR + estado do merge.
