# Shaping de intenção (plan-issue)

Filtros para fatiar e descrever o que o humano quer — **sem** travar engenharia. Inspirado em Shape Up / 37signals (appetite, build less) e no caro-vs-barato de produto. Decisão silenciosa de produto é defeito; decisão silenciosa de schema aqui é **erro** (isso pertence ao plano de implementação).

## Fatia mínima útil

Cada Issue deve:

1. Caber num **appetite** declarado (tempo fixo, escopo flexível).
2. Entregar **um** outcome verificável sozinho.
3. Ser compreensível sem ler o epic-pai.

Se o pedido humano misturar jobs (ex.: “mapa + CSV + invite”), **separe** — a menos que um sem o outro não tenha valor.

| Preferir separar | Preferir manter junto |
| ---------------- | --------------------- |
| Outcomes distintos para personas distintas | Mesmo fluxo, mesma tela, mesmo aceite |
| Um pedaço desbloqueia o outro depois | Separar criaria handoff inútil |
| Um pedaço é jurídico/LGPD e o outro não | — |

## Appetite

Declare quanto o slice vale, não estimativa aberta:

- Exemplos: `~0,5 dia, só copy/fluxo` · `~1 dia, um encaixe em lista existente` · `~1–2 dias, fluxo novo numa rota`
- Se a intenção não cabe → cortar rabbit holes / Fora de escopo, **não** inflar o item nem detalhar engenharia para “caber”.

## Caro de reverter (produto) vs barato

No plano de intenção, “travar” só o que é caro **de produto** e já é política do repo ou decisão humana explícita:

| Pode afirmar na intenção | Deixar para o plano de implementação |
| ------------------------ | ------------------------------------ |
| Leader lockdown / assimetria de votos | Collection nova, unicidade, shape do schema |
| Fail-closed de consentimento (conceito) | Chave `Consent` concreta, textos versionados |
| “Sem % estadual absoluto” | Chart vs tabela vs mapa |
| Appetite e fora de escopo | Nomes de utilities, signatures, migration |

## Rabbit holes de produto

Armadilhas se alguém “só completar” o desejo humano:

- Segundo cadastro de pessoa paralelo a `Contact`
- Spreadsheet mode / edição em massa sem pedido
- Dashboard de vaidade sem decisão nomeável
- Escopo que puxa redesign de paleta ou shell inteiro

## Self-score (0–5, gate ≥4)

1. Fatia = um outcome verificável?
2. Appetite declarado e a intenção cabe nele?
3. Persona + job + aceite claros (sem jargão de stack)?
4. Direção no codebase é hipótese (não contrato técnico)?
5. Zero decisões duras de engenharia no plano?

Se o item muda UI: rascunho HTML+Tailwind no gate ([ui-draft-html.md](ui-draft-html.md)) antes de registrar — não conta como “engenharia no plano”; é validação visual da intenção.

&lt;4 → corrigir antes de gravar / registrar Issue.
