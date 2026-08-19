# Mover CI/PR do Forgejo Actions para o GitHub Actions — tracker de Issues permanece no Forgejo

Status: rascunho
Atualizado em: 2026-08-19
Issue: #17
Priority: P1
Model: deepseek/deepseek-v4-flash
Impeccable: A — N/A (sem UI)
Rascunho UI: N/A — sem UI
Appetite: ~2–3 dias eng; um outcome verificável (CI verde no GitHub, tracker vivo no Forgejo, deploy preservado)
Responsável: —

## Intenção

O Forgejo Runner roda na workstation (Ryzen 7 7800X3D) e a suíte inteira
(lint + build + unit + e2e Playwright) roda localmente a cada PR e no push de
`main`, disputando CPU com o dev server, o browser, o Docker e os worktrees
paralelos — o mesmo custo que levou o teqo a migrar. A Iara quer a mesma
decisão do teqo (OPS71, merge 2026-08-19): **CI/PR no GitHub Actions**
(runners hosted, custo zero na workstation, PRs em paralelo de verdade) e o
**tracker de Issues permanece no Forgejo local** (`git.solla.dev`, alcançável
publicamente). Não é o mundo pré-teqo: é o meio-termo deliberado — **código/PR/CI
no GitHub, Issues/labels/claims no Forgejo**, com o CI falando com o tracker por
API, como os scripts locais já fazem.

## Persona e fluxo

- **Persona / contexto:** o dono da máquina (dev) rodando dev local, worktrees
  e múltiplos PRs; os agentes que abrem PRs e acompanham o CI até o merge; o
  coordenador que decide publicar em produção.
- **Job principal:** cada PR custa ~0 da workstation; o CI roda no GitHub em
  paralelo para todos os PRs; o merge continua automático e seguro; publicar
  em produção continua possível (decisão do gate abaixo).
- **Fluxo desejado:**
  1. Agente claima Issue no Forgejo (igual hoje — tracker intocado).
  2. Worktree/branch local; push para o **GitHub**; PR aberto no **GitHub**
     (Ready, base `main`, corpo linkando a Issue do Forgejo).
  3. GitHub Actions roda as verificações (job único `checks`) e posta o status.
  4. Merge automático quando o rollup `CI / checks` fica verde (mecanismo
     nativo ou safety net equivalente — contrato de hoje preservado).
  5. Pós-merge: flips no **Forgejo** via API — `Closes #N` → `done`/`in-prod`;
     `Related #N` → `blocked` → `ready`.
  6. Deploy **manual** via `workflow_dispatch` (GitHub): verificações full →
     deploy no homeserver (runner self-hosted).
- **Anti-goals de produto:** NÃO migrar o tracker (Issues/labels/claims ficam
  no Forgejo); NÃO mudar a estrutura de verificações (job único, gate de
  merge); NÃO mudar a política de e2e (full continua — hosted é grátis);
  NÃO tocar em schema/estado do cliente.

## Objetivo e aceite

- O CI de PR roda no GitHub Actions com a **mesma cascata de verificações** de
  hoje (lint → build → unit → e2e) como **um job único `checks`**.
- O deploy é **manual (`workflow_dispatch` no GitHub)** e roda no homeserver
  via runner self-hosted do GitHub — decide-se quando publicar, com verificação
  full antes (decisão do gate).
- O rollup do job `checks` é o required check de `main` e o gate do merge
  automático — agora no GitHub.
- PRs são abertas no GitHub; agentes acompanham o CI até o merge em `main`
  (skills/AGENTS.md atualizados); `bun run pr` mantém a semântica atual.
- As Issues **não migram**: labels, claims, `bun run issue`/`agent:*` continuam
  falando com o Forgejo; flips pós-merge funcionam via API.
- A workstation não roda mais a suíte de CI; o runner do Forgejo é desligado
  após o cutover (sem regressão no fluxo).
- Deploy verificado em produção após o cutover (uma publicação real).

## Dados (intenção)

- **Vou apresentar dados?** Não.
- **Decisões desbloqueadas:** nenhuma KPI nova. O "custo da workstation" é
  observável na própria máquina; o gate de aceite é funcional (CI verde + fluxo
  de agentes vivo + deploy publicado).

## Direção no codebase (hipótese)

- **Áreas prováveis:**
  - `.github/workflows/` (novo): `ci.yml` (job único `checks`, hosted),
    workflows de automação (`issue-done-on-main-merge`, `plan-issue-ready-on-main-merge`,
    `agent-pr-ready-automerge`) e deploy (conforme gate). Remoção do
    `.forgejo/workflows/` após cutover.
  - `scripts/`: `pr.mjs` (cria PR no GitHub — API/`gh` equivalente),
    `forgejo-pr-automerge.mjs` → automação de merge no GitHub (native
    auto-merge ou safety net equivalente), `forgejo-issue-transition.mjs` e
    `agent-promote-related-on-merge.mjs` (leem o PR — agora do GitHub — e
    flipam no Forgejo via API). `scripts/lib/forgejo-api.mjs` permanece (tracker).
  - `AGENTS.md` + skills de fluxo (`work-issue` etc.): paradigma passa a
    apontar para GitHub (PR/CI), tracker Forgejo.
- **Precedente a olhar:** teqo `docs/plans/ops71-ci-github-actions-tracker-forgejo.md`
  (a mesma migração, merged) e `docs/plans/ops50-ci-github-para-forgejo.md`
  (o espelho inverso).
- **Risco de acoplamento:** o deploy hoje usa alias SSH `homeserver:` da
  workstation (tailnet) — inexistente fora dela. O GitHub hosted não alcança o
  homeserver sem mecanismo próprio (secrets/runner self-hosted) — decisão do
  gate; o tracker (Forgejo) é alcançável publicamente via API (confirmado no
  teqo) e os scripts já derivam URL de `FORGEJO_REPOSITORY`.

## Dependências

- Nenhuma dura. A **I10** (GITHUB_TOKEN em repo de org falha no flip pós-merge)
  foi **decidida no gate: absorvida/superada** — fechar como superada quando
  este item mergear (o flip novo roda no GitHub com token apropriado e falha
  loud).

## Fora de escopo

- Migrar Issues/labels/claims do Forgejo (anti-goal explícito).
- Mudar a estrutura de verificações (job único, gate de merge) — preservada.
- Mudar a política de e2e (full no PR, como hoje; no hosted o custo é zero).
- Migrar os scripts do tracker (`agent:register/ready/claim/status`, `worktree`,
  `issue`) — continuam falando com o Forgejo.
- Repo do Forgejo: se vira espelho read-only de `main` ou para de receber push
  — decisão do impl, mas **nunca** fecha o tracker.
- Upgrade do Forgejo / infra do homeserver (decisões separadas).

## Rabbit holes de produto

- **Re-engenharia do deploy.** O job `deploy` depende do alias SSH da
  workstation; sem decisão, "preservar deploy" vira um projeto de infra.
  **Corte neste item:** uma das opções da questão 1, fechada no gate, sem
  inventar terceiro caminho.
- **Reescrever o contrato de merge.** Auto-merge/wait-por-checks foi calibrado
  para o Forgejo; portar errado = merge com CI vermelho. **Corte:** usar o
  mecanismo nativo do GitHub (rollup `CI / checks` como required check) e pin
  unit-testado nos scripts, sem reimplementar semáforos novos.
- **"Já que estamos no GitHub, migra as Issues também".** Decisão explícita:
  tracker fica no Forgejo. **Corte:** qualquer proposta de migrar o tracker é
  rejeitada neste item.

## Questões em aberto (produto)

**Resolvidas no gate (2026-08-19):**

- **Deploy: opção A decidida.** O deploy vira uma **action manual
  (`workflow_dispatch`) no GitHub** que ativa o deploy no homeserver: job
  `verify` no hosted `ubuntu-latest` (suíte full, incl. e2e) → job `deploy`
  com `needs: [verify]` rodando em **runner self-hosted do GitHub no
  homeserver** (executa o deploy localmente, sem SSH; não conta minutos
  hosted). O hosted nunca toca o homeserver. Sem verificador de `main` —
  só o pre-deploy roda full. (Espelha a decisão do teqo OPS71.)
- **Repo GitHub: decidido público, Forgejo principal.** Criar
  `fsolla/iara-pwa` **público** (como o teqo) com push do histórico atual.
  **O repo do Forgejo permanece o principal** — GitHub é o espelho de código
  e a superfície de PR/CI; o Forgejo nunca deixa de ser o tracker e o repo
  canônico.
- **I10: absorvida** — fechar como superada quando este item mergear (ver
  Dependências).

## Referências

- Issue Forgejo: #17 (Related #17)
- Rascunho UI (gate): N/A
- Precedente: teqo `docs/plans/ops71-ci-github-actions-tracker-forgejo.md` (repo teqo, merged 2026-08-19) e `ops50-ci-github-para-forgejo.md`
- Estado atual: `.forgejo/workflows/` (4 workflows, `runs-on: host`), `scripts/pr.mjs`, `scripts/forgejo-pr-automerge.mjs`, `scripts/forgejo-issue-transition.mjs`, `scripts/agent-promote-related-on-merge.mjs`, `.forgejo/worktree.env`
- `AGENTS.md` — seção CI/Workflow (a revisar no impl)
