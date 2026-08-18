# MCPs de engenharia de software para os agentes da Iara

Status: rascunho
Atualizado em: 2026-08-18
Issue: #5
Priority: P2
Model: deepseek/deepseek-v4-flash
Impeccable: A — N/A (sem UI)
Rascunho UI: N/A — sem UI
Appetite: ~0,5 dia; opencode.json de repo + documentação no AGENTS.md
Responsável: —

## Intenção

O teqo declara os MCPs do projeto num `opencode.json` na raiz (hoje: penpot, com
token em `.opencode/secrets/` gitignored), e o `worktree next` provisiona os secrets
nos worktrees. Além disso, os agentes usam o conjunto global de MCPs
(`~/.config/opencode/opencode.jsonc`: forgejo, playwright, jina, stalwart e um
postgres apontando para o banco local do teqo). A Iara não tem `opencode.json`
nenhum — o contrato de quais ferramentas o agente usa para desenvolver o app é
implícito (só os globais, incluindo o postgres do teqo que não faz sentido aqui).
Queremos o contrato explícito e versionado: um `opencode.json` de repo com o
conjunto de MCPs que serve ao desenvolvimento da Iara, e o AGENTS.md documentando a
harness (skills + MCPs).

## Persona e fluxo

- **Persona / contexto:** o agente trabalhando Issues da Iara (`work-issue`) e o
  humano supervisionando; terminal, worktrees.
- **Job principal:** o agente ter a ferramenta certa para o job — navegador
  (playwright) para inspecionar a UI em dev, web (jina) para pesquisar o protocolo
  ZeroClaw/gateways, Forgejo para Issues — sem arrastar MCPs de outros projetos.
- **Fluxo desejado:**
  1. `bun run worktree next` → opencode lança no worktree com o conjunto MCP do repo.
  2. O AGENTS.md diz, em uma seção curta, o que o agente pode usar (skills + MCPs).
  3. Decisões de NÃO incluir ficam registradas (comentário no arquivo), para
     ninguém re-adicionar por engano.

## Objetivo e aceite

- `opencode.json` na raiz da Iara declarando o conjunto MCP de engenharia do repo:
  seleção dos globais que servem à Iara (candidatos: forgejo, playwright, jina) e
  nada teqo-específico (sem postgres do teqo, sem penpot/secret). Forma exata
  (entradas com `enabled`, seleção por comentário, ou apenas documentação) fica com
  o plano de implementação — o contrato é "quais ferramentas, e quais não".
- Decisão explícita de NÃO incluir, registrada: `postgres` (Iara não tem backend —
  e o global aponta para o banco do teqo), `penpot` (sem fluxo de design; o
  `plan-issue` da Iara é textual), `stalwart` (e-mail pessoal).
- AGENTS.md ganha seção curta "Harness do agente" (skills + MCPs de repo + globais
  usados), sem virar inventário completo.
- Nenhum secret novo commitado; nenhum apontamento para infra do teqo.

## Dados (intenção)

- **Vou apresentar dados?** Não — item de infra do fluxo de agentes, sem superfície
  de dados de produto.

## Direção no codebase (hipótese)

- **Áreas prováveis:** `opencode.json` na raiz, `AGENTS.md` (seção Harness),
  `.forgejo/worktree.env` (nada a mudar — provisioning de secrets só se entrar MCP
  com token, que não é o caso).
- **Precedente a olhar:** `~/Code/teqo/opencode.json` (padrão repo-level),
  `~/.config/opencode/opencode.jsonc` (globais a selecionar), AGENTS.md da Iara
  (onde a seção nova encaixa).
- **Risco de acoplamento:** baixo; único cuidado é não quebrar o launch do opencode
  nos worktrees (referência a arquivos inexistentes, como o teqo já apanhou com o
  penpot-token).

## Dependências

- Nenhuma (independente da issue de skills; pode rodar em paralelo).

## Fora de escopo

- Mudanças nos MCPs globais (`~/.config/opencode/opencode.jsonc`) — o postgres do
  teqo lá é problema do teqo, não deste item.
- Provisionamento de secrets em worktrees (sem MCP com token neste conjunto).
- MCPs novos de engenharia que não existem hoje (ex.: servidor de docs do ZeroClaw)
  — se surgir necessidade, item separado.

## Rabbit holes de produto

- **Incluir postgres/penpot "para quando precisar".** Se alguém "só completar":
  arrasta infra do teqo para um app local-first sem backend. **Corte neste item:**
  só o que serve hoje; o resto nasce com a necessidade real.
- **Inventário completo no AGENTS.md.** Se alguém "só documentar": doc incha e
  desatualiza. **Corte neste item:** seção curta; o arquivo de config é a fonte.

## Questões em aberto (produto)

- **Playwright MCP vs "e2e só no CI"?** **Opções:** A) habilitar — o agente
  inspeciona a UI do dev server no worktree (a regra proíbe é rodar o suite
  `test:e2e` local no fluxo normal) | B) deixar desligado por consistência com a
  regra. **Recomendação:** A — a regra é sobre o suite de testes do CI; o MCP é
  verificação visual em dev, e o playwright.config.ts da Iara já existe.
  _(assumido — validar no gate)_
- **`opencode.json` de repo agora vs só documentação no AGENTS.md?** **Opções:**
  A) arquivo repo-level já (padrão teqo, contrato versionado, nasce onde um MCP
  futuro com secret encaixa) | B) só doc, já que os globais cobrem.
  **Recomendação:** A — explícito e versionado. _(assumido — validar no gate)_

## Referências

- `~/Code/teqo/opencode.json` — padrão de config repo-level do teqo.
- `~/.config/opencode/opencode.jsonc` — conjunto global de MCPs (a selecionar).
- `AGENTS.md` da Iara — onde a seção Harness encaixa.
- `docs/plans/README.md` — convenção de planos da Iara.
