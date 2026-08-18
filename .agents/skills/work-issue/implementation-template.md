# Template de plano de implementação (`docs/plans/<slug>-impl.md`)

Criado em Plan mode por `work-issue` / `agent-work-issue` a partir do plano de **intenção**. Aqui a engenharia é deliberada — Opções + Recomendação + rejeitadas ([decision-quality.md](decision-quality.md)).

O outcome de produto do plano de intenção é **inviolável**. A forma técnica é **livre** desde que mantenha aceite, appetite e invariantes do repo ([engineering-brief.md](engineering-brief.md)).

````markdown
# Impl: <mesmo título da intenção>

Status: rascunho | aprovado | em execução
Atualizado em: <YYYY-MM-DD>
Issue: #<N>
Intenção: docs/plans/<slug>.md
Appetite restante: <herdado / ajustado com corte explícito>

## Leitura da intenção

- **Outcome:** <1–2 frases, nas palavras do aceite de produto>
- **O que NÃO negociar:** <lockdowns de produto / access / LGPD citados na intenção>
- **O que reavaliar:** <hipóteses de “Direção no codebase” que podem estar erradas>

## Abordagem recomendada

\```mermaid
flowchart LR
  … 
\```

**Opções consideradas:** A | B | C  
**Recomendação:** <…> — porque …  
**Rejeitadas:** …

### Componentes / mudanças

- **`<símbolo>`** (`src/…`): <responsabilidade; o que reusa>
- **Migration:** <nome sugerido / “sem migration”>
- **Access / Consent:** <helpers; chave se houver; fail-closed>
- **UI:** <Impeccable A–D; shells a reusar; shape→craft→critique→polish se B/C/D>

### Dados → forma (se aplicável)

- Forma escolhida + por quê + rejeitadas (pergunta 3 de data-presentation)

## Fases verificáveis

1. **Tracer / schema+server** — <quota do appetite>
2. **UI** — <…>
3. **Gates** — `bun run gate`; push via `bun run push`

## Rabbit holes / Não escopo (engenharia)

- …

## Riscos e mitigação

- …

## Aceite de engenharia

- [ ] Aceite de produto da intenção ainda coberto
- [ ] Invariantes AGENTS/engineering-standards
- [ ] Testes de domínio previstos (unit/int) onde access/write paths mudam
````

Self-score decision-quality ≥4 antes de marcar `aprovado` ou executar.
