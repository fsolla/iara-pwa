---
name: capture-review-debts
description: Use when the user asks to register leftover /simplify findings as trackable Forgejo Issues, harvest session review debts, triage post-simplify follow-ups, or says "registra os débitos", "o que ficou do simplify", "harvest debts".
---

# Capturar débitos de /simplify em Issues

Após um ciclo de entrega, `/simplify` (skill `code-simplification`) deixa achados
**maiores que o cleanup da sessão**. Esta skill **triageia** esses achados a
partir do contexto da sessão, decide o que vira Issue rastreável (e o que não),
**mescla** o que for do mesmo lote, e só então registra via
**`bun run agent:register`** (lotes `kind:chore|defect`, com plano curto em
`docs/plans/` quando score ≥3) ou **`bun run agent:file-miss`**
(`kind:agent-miss`, défice comportamental do fluxo de agentes). Não implementa
código.

**Regra inviolável — nunca editar Issue `in-progress`.** Nem para absorver um
débito do mesmo pai: registra como **Issue nova** com `depends: [<id-do-pai>]`
no frontmatter — assim ela destrava sozinha na fila quando o pai flipar `done`.

**Qualidade de decisão:** [decision-quality.md](../work-issue/decision-quality.md)
— caro vs barato, defer+gatilho, depth/YAGNI. Score sozinho não basta: classifique
o **tipo de decisão** na triage.

## Checklist

```
- [ ] 1. Colher candidatos da sessão (simplify)
- [ ] 2. Deduplicar contra código, Issues (`bun run issue all`) e planos
- [ ] 3. Pontuar importância e classificar destino
- [ ] 4. Mesclar relacionados (mesmo lote / mesma superfície)
- [ ] 5. Apresentar tabela de triage e obter confirmação
- [ ] 6. Registrar só o aprovado (agent:register / agent:file-miss; plano curto quando score ≥3)
```

## Passo 1 — Colher candidatos

Fontes (nesta ordem; não invente achados que não apareceram):

1. **Mensagens da sessão atual** — resumos finais de `/simplify` ("skipped", "recommend", "larger than cleanup").
2. **Diff local** — só para verificar se um achado já foi aplicado; não para minerar débitos novos.
3. **Transcripts** — só se a sessão atual for curta demais e o usuário apontar um chat anterior.

Para cada candidato, registre uma linha bruta:

| Campo       | Conteúdo                                            |
| ----------- | --------------------------------------------------- |
| `id`        | S1, S2…                                             |
| `origem`    | simplify quality\|perf\|reuse                       |
| `resumo`    | uma frase                                           |
| `evidência` | quote curto / path                                  |
| `já_feito?` | sim se o diff/código já resolve                     |

**Ignore na colheita:** elogios, sugestões hipotéticas sem achado, itens que o próprio simplify marcou como "fixed".

## Passo 2 — Deduplicar

Contra o repositório **antes** de pontuar:

| Check                                                  | Ação se verdadeiro                                              |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| Já no diff / código da sessão                          | → balde **já_resolvido** (não reabrir)                          |
| Já em `docs/plans/*.md` ou numa Issue (`bun run issue all`) | → **absorver** no plano existente ou **descartar** como coberto |
| Pré-existente em `main`, fora do escopo da entrega     | → **descartar** deste lote (bug separado só se o usuário pedir) |
| Intencional em `AGENTS.md` / decisão travada           | → **descartar**                                                  |

## Passo 3 — Pontuar e decidir destino

Para cada candidato restante, atribua **importância** (1–5):

| Score | Quando                                                                                      |
| ----- | ------------------------------------------------------------------------------------------- |
| 5     | Bloqueia feature dependente, hot path em produção, risco de segurança (token/WS/PII)        |
| 4     | Perf/DRY com ≥3 call sites ou custo herdado por lib core (ws/settings/messages)             |
| 3     | UX acionável, DRY claro 2 call sites, a11y outline                                          |
| 2     | Higiene/naming, polish cosmético                                                            |
| 1     | Preferência de estilo, rename de pureza, micro-otimização sem evidência                     |

**Bump caro de reverter:** protocolo WS / schema de storage / token handling → piso de score **4–5**.

**Tipo de decisão** (obrigatório — uma coluna na triage):

| Tipo               | Exemplos                                  | Destino típico              |
| ------------------ | ----------------------------------------- | --------------------------- |
| **expensive_lock** | protocolo WS, formato de storage, token   | registrar / absorver (nunca descartar por score baixo artificial) |
| **cheap_polish**   | copy, motion, rename, P3                  | descartar ou já_resolvido   |
| **defer_trigger**  | DRY <3 call sites, abstração prematura    | **não registrar** — anotar gatilho no plano-pai |

**Destino** (escolha exatamente um):

| Destino          | Critério                                                                              |
| ---------------- | ------------------------------------------------------------------------------------- |
| **registrar**    | Score ≥3 **e** não coberto **e** tipo ≠ defer_trigger puro; cabe num plano próprio ou lote mesclado |
| **absorver**     | Score ≥3 mas é fase natural de um plano existente                                     |
| **descartar**    | Score ≤2 **ou** rename de pureza **ou** "nice to have" sem dono **ou** skip explícito do simplify |
| **defer**        | Tipo defer_trigger: não cria ID novo; registra gatilho no plano-pai                   |
| **já_resolvido** | Feito no cleanup da sessão                                                            |

**Separação de tipos (não misturar num único plano):**

- **Engenharia / escala / DRY** → família `escala-dry-pos-<slug>.md`.
- **UX / produto pós-critique** → plano tipo `*-ux-pos-critique.md`.
- Nunca fundir "N+1 request do WS" com "copy do botão" no mesmo item.
- Nunca fundir **expensive_lock** com **cheap_polish** no mesmo lote sem fases ordenadas (lock primeiro).

## Passo 4 — Mesclar

Dentro do **mesmo tipo** (engenharia **ou** UX):

- Mesclar se compartilham **superfície** (mesmo componente/lib) **ou** **pai** (mesma Issue que acabou de ser entregue).
- Um plano, várias **fases** ordenadas por ROI (expensive_lock / perf antes de DRY cosmético; produto antes de P3 motion).
- Declarar **appetite** do lote (ex. `~1 dia eng fill-in`) para a Issue não virar epic sem teto.
- Não mesclar across pais não relacionados.
- Se sobrar um único achado score ≥3, ainda assim um plano curto é melhor que Issue órfã sem plano.

Alvo de merge: **1 plano engenharia + no máximo 1 plano UX** por sessão de entrega, salvo pais distintos.

## Passo 5 — Tabela de triage + confirmação

Mostre ao usuário **antes** de editar docs:

```markdown
| ID  | Resumo        | Origem           | Score | Tipo decisão    | Destino        | Lote mesclado    |
| --- | ------------- | ---------------- | ----- | --------------- | -------------- | ---------------- |
| S1  | …             | simplify/perf    | 4     | expensive_lock  | registrar      | Escala pós-X F1  |
| S2  | shared helper | simplify/reuse   | 3     | defer_trigger   | defer          | gatilho: 3º path |
| S3  | rename pureza | simplify/quality | 2     | cheap_polish    | descartar      | —                |
```

Inclua baldes **já_resolvido**, **descartar** e **defer** com uma linha de racional/gatilho cada (transparência > silêncio).

**Pare e confirme** — exceto em **modo autônomo** (`work-issue`): aí aplique a
seção Modo autônomo abaixo e pule o AskQuestion. Só avance ao Passo 6 com
aprovação explícita (humano) ou com as regras do modo autônomo. Sem isso = não
cria Issue nem toca `docs/plans/`.

## Passo 6 — Registrar via `agent:register` / `agent:file-miss`

Para cada lote com destino **registrar** ou **absorver**:

1. Lotes de engenharia/UX: `bun run agent:register -- --id <ID> --title "<título>" --prio <P> --kind chore --plan docs/plans/<slug>.md` — **um lote mesclado, não um item por achado micro**. Inclua appetite e rabbit holes do lote no plano curto. Com `--plan`, a Issue nasce `blocked` até o plano estar em `main` e `bun run agent:ready -- --issue <N>`.
2. Défice comportamental do fluxo de agentes: `bun run agent:file-miss` (`kind:agent-miss`).
3. Se **absorver** num plano existente: edite o plano (nova fase/seção). **Se a Issue dona do plano estiver `in-progress`, NÃO a edite** — registra como Issue nova com `--depends <id-do-pai>` (destrava sozinha quando o pai flipar `done`).
4. Se **defer**: anote o gatilho no plano-pai (Adiado com gatilho / Explicitamente fora) — não crie Issue só por isso.
5. No plano, seções obrigatórias além do template:
   - **Já resolvido no simplify (não reabrir)**
   - **Explicitamente fora** (skips dos revisores + descartes + defers com gatilho deste triage)

Não implemente as fases aqui. Execução é via `work-issue`, só se o usuário seguir.

**Próximo no fluxo de entrega:** após a triage (confirmada ou modo autônomo), o
fechamento segue o Passo 4 de `work-issue` (`bun run pr -- --head <branch>
--body "Closes #N" --automerge` → merge → CI).

## Modo autônomo (`work-issue`)

Quando não há humano no gate (Passo 5):

1. Faça colheita, dedup, score e tipo como de costume.
2. Decida o destino pela triage completa (Passos 3–4) — registre o que a triage
   manda (score ≥3 registrar, expensive_lock com piso 4–5), absorva em plano
   existente, defira com gatilho ou descarte o resto — **sem abrir AskQuestion**.
3. Resuma no comentário/fechamento o que registrou vs deferiu vs descartou.

## Anti-padrões (baseline)

| Desculpa                                 | Realidade                                                             |
| ---------------------------------------- | --------------------------------------------------------------------- |
| "Virou um item por achado"               | Mesclar no lote; backlog poluído é pior que débito omitido de score 2 |
| "Registro ad hoc, é só um bullet"        | Sempre `agent:register` com frontmatter completo (id/depends/priority/model) |
| "Rename PascalCase / pureza merece ID"   | Score ≤2 → descartar, a menos que desbloqueie reuso real já pedido    |
| "Junto DRY e UX num plano"               | Tipos separados (engenharia vs UX)                                    |
| "DRY com 1 call site vira escala-dry"    | defer_trigger + gatilho; não registrar epic YAGNI                     |
| "Não li o plano existente"               | Grep primeiro; absorver > duplicar                                    |
| "Registro sem perguntar"                 | Passo 5 é gate (humano-gated); em modo autônomo o agente decide e registra |
| "Corto token/WS do lote por tempo"       | expensive_lock nunca é cortável por appetite                          |

## Resumo ao usuário

1. Contagem: colhidos / já_resolvidos / descartados / deferidos / absorvidos / a registrar
2. Tabela de triage (final pós-confirmação), com coluna tipo de decisão
3. IDs/slugs criados ou planos estendidos (links) + appetite dos lotes
4. O que ficou de fora de propósito (e por quê / gatilho)
