---
name: plan-issue
description: >-
  Transforma ideias humanas em Issues Forgejo + planos de intenção em
  docs/plans/ (persona, fluxo, objetivo, direção suave no código — sem
  decisões duras de engenharia). Divide o pedido nas menores tarefas que
  ainda fazem sentido. Use quando o usuário pedir /plan-issue, planejar
  features, fatiar um pedido em Issues, ou registrar trabalho novo na fila.
disable-model-invocation: true
---

# Planejar Issues (intenção, não engenharia)

Esta skill transforma ideias soltas em: (1) um **plano de intenção** em `docs/plans/<slug>.md` por item, e (2) uma **Issue Forgejo rastreável** (`bun run agent:register`, frontmatter `id/depends/priority/model`). Issues Forgejo são a fonte canônica de spec/status/deps/prio/modelo.

## Ciclo de vida (obrigatório)

```text
rascunho local (Issue: —)
  → GATE (Passo 5) + confirmação explícita do lote
  → register com --plan → Issue NÃO claimável (blocked; script enforça)
  → commit + PR dos planos (Related #N, nunca Closes)
  → merge em main
  → promote blocked→ready (`bun run agent:ready`)
  → fila / `worktree next`
```

**Regras duras:**

1. **Nada no Forgejo antes do gate.** Antes da confirmação explícita do Passo 5: proibido `bun run agent:register`, `bun run pr` / push de PR de planos. Planos locais (`Issue: —`) ok.
2. **Confirmação = OK ao overview do lote** (ex. "confirma", "pode registrar"). "Ok" ambíguo no meio da edição **não** dispara o Passo 6.
3. **Register com `--plan` não nasce `ready`.** O script aplica `blocked` automaticamente quando `--plan` está presente. Sem `--plan` (chore body-only / `file-miss`), pode nascer `ready`.
4. **Promote só depois do plano em `main`.** Nunca flipar para `ready` com o PR ainda aberto — isso recria a race de claim. Caminhos: (A) `bun run agent:ready -- --issue N` no fim do Passo 6 após merge; (B) workflow de merge que lê `Related #N` (o CI já tem `agent:promote-related`). Ambos idempotentes.
5. **Planos de Issues `in-progress` / `done` / `in-prod` são imutáveis.** Não editar `docs/plans/<slug>.md` nem o body de intenção dessas Issues. Refino → **plano + Issue novos** (sucessor; `depends` no pai se fizer sentido). Enquanto a Issue ainda é só `blocked`/`ready` (sem claim), editar o mesmo plano ainda é barato.

## Divisão com as skills de execução

| Skill | Papel |
| ----- | ----- |
| **`plan-issue` (esta)** | Intenção humana: o quê / para quem / por quê / outcome. Direção suave no codebase. **Proibido** travar schema, signatures, abstrações ou "Abordagem" de engenharia. |
| **`work-issue`** | Humano supervisiona: Issue já claimada (claim via `worktree next`) → plano de **implementação** (Plan mode) → **pausa** para confirmação → executa. |

Aqui **não** se implementa código de produto, **não** se escreve plano de implementação.

**Shaping (não tour):** aplique [shaping.md](shaping.md) + [skills-map.md](skills-map.md) em silêncio — appetite, fatia mínima útil, rabbit holes de produto, self-score ≥4 antes de gravar. O skills-map é o repertório de engenharia absorvível no plano de intenção; o que ele aponta para fora fica para o `work-issue`.

## Checklist

```
- [ ] 1. Parse do lote + dedup (intra-lote, Issues existentes, docs/plans)
- [ ] 2. Reserva de IDs de uma vez por trilha (issuesById())
- [ ] 3. Por item (ordem topológica): classificar → fatiar → explorar só o suficiente → intenção completa
- [ ] 4. Sugestão de modelo × effort (uma linha por item)
- [ ] 5. GATE: overview do lote → confirmar/iterar (PARAR aqui até o humano confirmar; sem Issue/PR)
- [ ] 6. Registro: `agent:register` (`--plan` → `blocked`) → PR `Related #N` → merge → `bun run agent:ready`
```

## Passo 1 — Parse e dedup

1. **Separe os itens.** Entrada pode ser 1 ideia ou N. Se ambíguo, assuma a leitura mais provável e liste — a confirmação vai no gate.
2. **Fatia mínima útil.** Prefira várias Issues pequenas a um epic. Cada item deve caber num appetite curto e entregar um outcome verificável sozinho. Mesclar só quando separar criaria trabalho inútil (mesmo fluxo, mesma persona, mesma superfície sem valor incremental).
3. **Dedup intra-lote:** mesclar | absorver (fase de plano existente, sem ID novo) | manter separados com `depends`.
4. **Dedup contra o existente:** `bun run issue all` + `issuesById()` + grep em `docs/plans/*.md`.
   - Já coberto / entregue → apontar e não criar.
   - Issue **`in-progress` / `done` / `in-prod`:** **não** editar o plano dela — se a intenção mudou, item **sucessor** (plano + Issue novos).
   - Issue só `blocked` / `ready` (ainda não claimada): pode editar o plano existente (fase de plano) sem ID novo.
   - Novo → seguir.

## Passo 2 — Reserva de IDs

Último ID via `issuesById()`; distribua **antes** de escrever planos. Trilhas da Iara: `I<dígitos>` para a maioria (chat/UI/local-first), `OPS+` para operações/ferramentas, `FD+` para débitos futuros sem trilha. Fora de trilha: prefixos `O0+`, `FD+`, `RS+`.

## Passo 3 — Por item: intenção completa

Ordem topológica (dependente cita ID do dependido). Por item:

1. **Tipo**

| Tipo | Destino |
| ---- | ------- |
| Feature com escopo próprio | `kind:feature` + plano de intenção |
| Chore / débito pequeno | `kind:chore` + plano curto (ou body se trivial) |
| Défice do fluxo de agentes | `bun run agent:file-miss` (`kind:agent-miss`) — não aqui |
| Bloqueio externo (jurídico/LGPD) | `blocked` + `needs:consent`/`needs:migration`; texto no lote |
| Decisão de NÃO fazer | Comentário/doc, não Issue |

2. **Explorar o código o mínimo** — só para apontar **direção** (pastas/domínios prováveis: `src/components/`, `src/lib/`) e evitar duplicar algo já entregue. Não inventar signatures nem diagramas de componentes.
3. **Plano de intenção** em `docs/plans/<slug>.md` via [intention-template.md](intention-template.md). Se muda UI, um **rascunho visual** é bem-vindo (HTML/PNG anexado ao plano ou à Issue) mas opcional — o gate é textual. Self-score ≥4/5 ([shaping.md](shaping.md)).

### O que é proibido no plano de intenção

- Decisões de schema / nomes de arquivos novos obrigatórios / mermaid de arquitetura de solução
- "Abordagem proposta" com componentes nomeados
- Fases de implementação verificáveis com quota de engenharia
- Forçar o executor a uma única forma técnica

### O que é obrigatório

- Intenção do humano (problema/oportunidade)
- Persona(s) e fluxo desejado (job / outcome)
- Critérios de aceite em linguagem de produto
- Appetite e fora de escopo (produto)
- **Direção provável no codebase** (pastas/domínios — hipotética, revisável)
- Questões em aberto com **Opções + Recomendação de produto** (não de engenharia)

## Passo 4 — Modelo × effort

Registre no cabeçalho (`Model:`). Default da Iara: `deepseek/deepseek-v4-flash`. Não crie par `{id}-plan` / `{id}-exec` por default — o plano de implementação nasce em `work-issue`.

## Passo 5 — GATE

Antes de criar Issues **ou** abrir PR de planos:

- Overview: ID, título, prio, depends, appetite, modelo, link do plano local
- Esboço textual de fluxo só se ajudar
- Perguntas acumuladas numa rodada, recomendação de produto primeiro

**Pare e espere.** Itere até confirmação explícita do lote (não basta um "ok" solto durante a edição). Só então Passo 6.

## Passo 6 — Registro (não claimável até plano em `main`)

Ordem obrigatória:

1. **Register** (com `--model`; com `--plan` o script nasce `blocked`):

```bash
bun run agent:register -- --id <ID> --title "<título>" --prio <P0..P3> \
  --depends <A,B> --kind <feature|chore|...> --plan docs/plans/<slug>.md \
  --model <slug>
```

Sem `--plan`: nasce `ready` (use `--blocked` só se quiser não-claimável sem plano).

2. Atualize `Issue: #N` (e status) no plano local.
3. Commit + push (branch de trabalho) + **PR** `--base main` com **`Related #N`** (nunca `Closes #N` em PR só de `docs/plans/`):

```bash
bun run pr -- --head <branch> --title "Plano(s): <resumo>" --body "Related #<N>" --automerge
```

4. Espere o merge em `main`.
5. **Promote** (idempotente se já `ready`):

```bash
bun run agent:ready -- --issue <N[,N…]>
```

O workflow de merge (`agent:promote-related`) é safety net se este passo falhar — não pule o promote do agente no caminho feliz.

**NÃO faz:** implementar código; claim; escrever `*-impl.md`; editar plano de Issue `in-progress`/`done`/`in-prod`; marcar `ready` antes do plano em `main`; registrar/abrir PR antes do gate.

## Resumo final

Tabela do lote + mesclados/absorvidos/descartados + decisões de produto assumidas _(validar)_ + o que o gate decidiu + Issues `#N` + PRs de plano.
