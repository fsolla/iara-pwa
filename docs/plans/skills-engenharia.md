# Skills de engenharia de software para os agentes da Iara

Status: rascunho
Atualizado em: 2026-08-18
Issue: #4
Priority: P2
Model: deepseek/deepseek-v4-flash
Impeccable: A — N/A (sem UI)
Rascunho UI: N/A — sem UI
Appetite: ~0,5–1 dia; pack instalado + lockfile + integração no plan-issue
Responsável: —

## Intenção

Os agentes da Iara hoje só conhecem o fluxo: as 5 skills custom herdadas do teqo no
bootstrap (`plan-issue`, `work-issue`, `worktree-next-issue`, `capture-review-debts`,
`code-simplification`). Quando um executor precisa de craft — TDD, clean code,
segurança, performance, frontend, code review, debugging — ele improvisa ou vai ler o
repo do teqo. O teqo resolveu isso com um pack de skills de engenharia versionado
(`skills-lock.json` + skills de `addyosmani/agent-skills` e `wondelai/skills`).
Queremos a mesma infraestrutura na Iara: o pack de engenharia (não o de
produto/marketing), com lockfile commitado, e o `plan-issue` ensinado a absorver os
princípios dessas skills em silêncio (skills-map, como no teqo).

## Persona e fluxo

- **Persona / contexto:** o agente que executa Issues da Iara (`work-issue`,
  `/simplify`) e o humano que planeja (`/plan-issue`); terminal, sessions paralelas
  em worktrees.
- **Job principal:** ter o repertório de engenharia carregável sob demanda, sem
  depender do repo do teqo como referência viva.
- **Fluxo desejado:**
  1. No worktree de uma Issue, o executor carrega a skill certa quando precisa
     (ex.: `test-driven-development` antes de escrever testes,
     `security-and-hardening` ao tocar token/key, `frontend-ui-engineering` em UI).
  2. O `plan-issue` continua produzindo um artefato só (`docs/plans/<slug>.md`),
     mas absorve princípios de spec/planning/incremental/doubt em silêncio.
  3. Máquina nova ou CI: `bun install` e o pack já está lá (lockfile commitado).
- **Anti-goals de produto:** o planejamento não vira um tour de skills (o
  `plan-issue` não abre jornadas guiadas); não trazer o ruído de produto/marketing
  do teqo (hundred-million-offers, storybrand, traction-eos…); não criar
  dependência de ferramenta de sync no runtime do repo.

## Objetivo e aceite

- O pack de engenharia está em `.agents/skills/` com `skills-lock.json` commitado
  (mesmo formato do `~/Code/teqo/skills-lock.json`) — instalação reprodutível.
- Pack = `addyosmani/agent-skills` completo (24 skills: TDD, code review, debugging,
  performance, security, frontend UI, git workflow, CI/CD, docs/ADRs,
  context-engineering, spec-driven, incremental, etc.) + subset de engenharia do
  `wondelai/skills` (clean-code, clean-architecture, system-design, ddia-systems,
  domain-driven-design, pragmatic-programmer, refactoring-patterns, refactoring-ui,
  remove-technical-debt, software-design-philosophy, high-perf-browser, web-typography,
  ux-heuristics, microinteractions, working-with-legacy-code, team-topologies — lista
  exata validada na implementação pelo critério "relevante para Vite+React+TS+PWA+WS+
  local-first, time pequeno").
- As 5 skills de fluxo existentes continuam como estão (são custom, já adaptadas ao
  Forgejo); `code-simplification` já existe — não instalar duplicado.
- `plan-issue` ganha o `skills-map.md` (adaptado do teqo para Forgejo/`bun run`):
  o planejamento absorve spec-driven, planning-and-task-breakdown,
  incremental-implementation, doubt-driven-development, DDD/clean-architecture sob
  demanda — e o que fica fora (build/review = `work-issue`).
- Nada do pack de produto/marketing do wondelai na Iara. Referência do que foi
  cortado: `skills-lock.json` do teqo (86 skills no total).
- Textos de skills que referenciem GitHub/teqo ajustados para a convenção da Iara
  (Forgejo, `bun run`).

## Dados (intenção)

- **Vou apresentar dados?** Não — item de infra do fluxo de agentes, sem superfície
  de dados de produto.

## Direção no codebase (hipótese)

- **Áreas prováveis:** `.agents/skills/` (novas pastas de skill), `skills-lock.json`
  na raiz, `.agents/skills/plan-issue/skills-map.md`, `AGENTS.md` (menção única ao
  pack, sem virar inventário).
- **Precedente a olhar:** `~/Code/teqo/skills-lock.json`, `~/Code/teqo/.agents/skills/`
  (instalação real), `~/Code/teqo/.agents/skills/plan-issue/skills-map.md` (fonte do
  mapa), PR #1 da Iara (como o pack de skills de fluxo foi herdado).
- **Mecanismo de instalação:** hipótese — CLI de skills do ecossistema
  vercel-labs/skills (`npx skills add <owner/repo>`), mesma origem do lockfile do
  teqo; cópia a partir do teqo é alternativa aceitável. Decisão fica com o plano de
  implementação.
- **Risco de acoplamento:** nenhum com o produto; cuidado apenas para não duplicar
  as 5 skills existentes nem editar as de fluxo.

## Dependências

- Nenhuma (superfície independente da issue de MCPs; pode rodar em paralelo).

## Fora de escopo

- Pack de produto/marketing do wondelai (fica só no teqo; nada a portar).
- Skills específicas do teqo (`payload-migrations`, `local-database`, `solla-*`,
  agentes de design) — Iara não tem backend/design.
- Melhorias de conteúdo dos SKILL.md upstream (fork/edição) — se alguém quiser,
  vira débito separado com `depends` aqui.

## Rabbit holes de produto

- **Paridade total (86 skills).** Se alguém "só copiar o teqo": contexto de agente
  inflado com ruído de campanha/marketing. **Corte neste item:** só o pack de
  engenharia, critério de stack da Iara.
- **Aperfeiçoar os SKILL.md.** Se alguém "só melhorar": vira projeto de escrita e o
  lockfile quebra o rastreio. **Corte neste item:** copiar como vem; melhoria =
  débito separado.
- **Inventário no AGENTS.md.** Se alguém "só documentar": o AGENTS.md incha e
  desatualiza. **Corte neste item:** menção única + lockfile como fonte de verdade.

## Questões em aberto (produto)

- **Pack completo (86) vs engenharia-only?** **Opções:** A) só engenharia
  (addyosmani 24 + subset wondelai de engenharia) | B) paridade total com o teqo.
  **Recomendação:** A — a Iara é um app enxuto sem vertical de campanha; contexto de
  agente menor = decisões melhores. _(assumido — validar no gate)_
- **Integrar o skills-map no plan-issue agora?** **Opções:** A) sim, no mesmo item |
  B) depois, quando o pack assentar. **Recomendação:** A — é o que faz o pack ter
  efeito no fluxo (sem o mapa, as skills viram acervo morto). _(assumido — validar
  no gate)_

## Referências

- `~/Code/teqo/skills-lock.json` — lockfile de origem (86 skills, fontes + hashes).
- `~/Code/teqo/.agents/skills/plan-issue/skills-map.md` — mapa a adaptar.
- `~/Code/teqo/.agents/skills/` — instalação de referência.
- PR #1 da Iara (bootstrap do fluxo) — como as 5 skills de fluxo entraram.
- `docs/plans/README.md` — convenção de planos da Iara.
