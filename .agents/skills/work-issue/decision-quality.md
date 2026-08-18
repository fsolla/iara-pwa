# Qualidade de decisão (plano de implementação)

Aplique ao escrever `docs/plans/<slug>-impl.md` em `work-issue` / `agent-work-issue`. O plano de **intenção** já fixou o outcome — aqui se escolhe a engenharia. Decisão silenciosa é defeito.

## Caro vs barato

Delibere e registre só o **caro de reverter**. O barato vira Não escopo, fill-in, ou “mais simples que funciona” com **gatilho de revisitação**.

| Caro (decidir agora + rejeitadas) | Barato (adiar / mais simples) |
| --------------------------------- | ----------------------------- |
| Collection nova, unicidade, access | Polish cosmético, 2º estilo de card |
| Nova chave `Consent` / PII | Copy, motion, a11y P3 |
| Semântica multi-collection / locks | Prefetch, ordem de colunas |
| URL pública / slug imutável | Rename de pureza |
| Fronteira de módulo em volatilidade real | Adapter com 1 call site |

## Forma obrigatória

Toda decisão não trivial de engenharia:

```text
Opções: A | B | C
Recomendação: B — porque …
Alternativas rejeitadas: A porque …; C porque …
```

No `*-impl.md`: **Decisões de engenharia** = decisão + por quê + rejeitadas.

## Appetite e tracer bullet

Respeite o appetite do plano de intenção. Se a abordagem estoura → cortar rabbit holes, não inflar. Preferir **tracer bullet** cedo (schema mínimo → uma action → uma superfície) antes de polish paralelo.

## Depth check

Antes de propor arquivo/utility/componente novo:

1. Já existe módulo profundo? (`campaignAccess`, shells de lista, `withPayloadTransaction`, …) → **reusar**
2. Pass-through raso? → **não criar**
3. Conhecimento vazaria em N módulos? → **encapsular uma vez**

## Rabbit holes Teqo

Layers/cerimônia sem volatilidade; cadastro paralelo a `Contact`; Consent por ID hardcoded; DRY &lt;3 call sites; redesign de paleta fora de `campaign`.

## Self-score (0–5, gate ≥4)

1. Decisões caras têm rejeitadas?
2. Abordagem cabe no appetite da intenção?
3. Rabbit holes nomeados?
4. Depth check: reusa shells/helpers existentes?
5. Intenção (aceite de produto) permanece satisfeita — engenharia não reescreveu o outcome?
