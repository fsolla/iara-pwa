# Skills de planejamento ↔ plan-issue

Inventário das skills de **planejamento de desenvolvimento de software** do pack de engenharia (`.agents/skills/`, proveniência em `skills-lock.json` na raiz), e o que o `plan-issue` **absorve em silêncio** vs. o que fica fora (outra skill / `work-issue`).

**Regra:** `plan-issue` é o shaping + registro Forgejo (plano em `docs/plans/` + Issue). Não vira tour das skills abaixo. Aplique princípios; não abra jornadas guiadas.

## Pipeline genérico (referência)

De `using-agent-skills` — só para orientar o *handoff*, não para reexecutar aqui:

```
interview-me → idea-refine → spec-driven → planning-and-task-breakdown
  → (implement: incremental + source-driven + doubt + TDD …)
```

Na Iara: **idea-refine / interview** antes se vago; **spec + plan + tasks** = esta skill (um artefato); **implement+** = `work-issue`.

## Mapa

| Skill | O que emprestar ao plan-issue | NÃO fazer no plan-issue |
| ----- | ----------------------------- | ----------------------- |
| **idea-refine** | Se a ideia for vaga: HMW + 3–5 sharpening Qs + Not Doing + assumptions a validar **antes** do plano. Gate: "ainda não dá para registrar". | Sessão divergente completa (5–8 variações); salvar em `docs/ideas/` |
| **interview-me** | Só se o usuário não sabe o que quer (rotear). | Extrair requirements longos aqui |
| **spec-driven-development** | Premissas explícitas; objetivos como critérios de aceite testáveis; Boundaries Always/Ask/Never da Iara; reframing de pedido vago → sucesso mensurável | Spec de 6 seções / fase IMPLEMENT |
| **planning-and-task-breakdown** | Fatias **verticais**; fases com aceite + verificação; grafo de deps; high-risk cedo; XL → bipartir `{id}-plan`/`{id}-exec` | Checkpoint humano entre cada fase na implementação |
| **incremental-implementation** | Tracer bullet = 1ª fase; risco-primeiro se incerteza; cada fase deixa o sistema compilável | Ciclo implement→test→commit (é `work-issue`) |
| **doubt-driven-development** | Em decisão **cara** (protocolo WS, schema de settings, URL/contrato imutável): CLAIM curto + adversarial self-check antes de travar | Doubt em cada bullet; cross-model CLI; doubt pós-código |
| **source-driven-development** | Se a Abordagem depende de API externa (gateway ZeroClaw, Web Speech): anotar "verificar docs na implementação" + versão em `package.json` | Fetch de docs e citações no plano |
| **documentation-and-adrs** | Decisões travadas = ADR-lite do item (contexto + rejeitadas). Repo-wide → apontar follow-up em `docs/` | Criar `docs/decisions/` novo sem precedente |
| **domain-driven-design** / **clean-architecture** / **software-design-philosophy** | Vocabulário, Dependency Rule, deep modules — via [decision-quality.md](../work-issue/decision-quality.md) sob demanda | Modelar bounded contexts do zero num item de lista |
| **test-driven-development** | Na fase: "Verify: pin unit/int …" | RED/GREEN no planning |
| **api-and-interface-design** | Contratos de action/URL no Abordagem quando há API nova | Desenhar OpenAPI completo |
| **context-engineering** | Plano cita arquivos reais (não dump do repo) | Carregar contexto de implementação aqui |

**Nota:** o que o teqo emprestava de `37signals-way` (appetite, rabbit holes, no-gos) e de `design-code-architecture` (caro/barato, depth) já está destilado em [shaping.md](shaping.md) e [decision-quality.md](../work-issue/decision-quality.md) — essas skills não estão no pack da Iara (sem produto/marketing).

## Skills de build/review (fora do escopo de planejamento)

`frontend-ui-engineering`, `security-and-hardening`, `performance-optimization`, `code-review-and-quality`, `code-simplification`, `observability-and-instrumentation`, `shipping-and-launch`, `ci-cd-and-automation`, `git-workflow-and-versioning`, `deprecation-and-migration`, `debugging-and-error-recovery`, `browser-testing-with-devtools` — entram em `work-issue` / gates do repo, não no registro da Issue.

## Precedência quando conflita

1. Convenções Iara (`AGENTS.md`: invariantes local-first, token nunca logado, aprovações nunca auto-aprovadas, copy pt-BR)
2. Esta skill + [decision-quality.md](../work-issue/decision-quality.md) (do `work-issue`)
3. Princípios das skills acima
4. Templates genéricos — **não** usamos; o artefato canônico é `docs/plans/<slug>.md`
