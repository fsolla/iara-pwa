---
name: worktree-next-issue
description: >-
  Claima deterministicamente a próxima Issue da fila (ou a direcionada com
  --issue N), cria o worktree git dela a partir de main com branch legível no
  formato <código>-<slug> (slug pt-BR do título sem acentos) e provisiona o
  ambiente (bun install). Usar quando o usuário pedir "worktree da próxima
  issue", "cria o worktree para o próximo da fila", "prepara o ambiente do
  próximo item".
---

# Worktree da próxima Issue claimável

Prepara o ambiente git para a próxima Issue da fila de claim — **o claim é parte do `next`**: mesma fila/ordem e lock otimista do `bun run agent:claim`, rodado **antes** de criar o worktree; claim falhou → motivo e saída sem worktree. Reabrir uma Issue já claimada (`--issue N` com `in-progress`) não re-claima.

## Fonte canônica: `bun run worktree` (script)

A lógica determinística (fila → código+slug → branch → worktree) vive em **`scripts/worktree.mjs`** — fonte única. Não a reescreva à mão aqui.

```bash
bun run worktree next [--issue N] [--stay]  # CLAIMA a Issue + cria worktree de origin/main + bun install
bun run worktree plan [bag] [--stay]        # worktree de PLANEJAMENTO (/plan-issue): um DIFERENTE por invocação
bun run worktree new [bag] [--stay]         # worktree NEUTRO (sem função pré-definida): um DIFERENTE por invocação
bun run worktree kill [--force]             # destrói o worktree atual + volta ao main
```

No opencode, isso é o comando **`/worktree next`** / **`/worktree kill`** (`.opencode/commands/worktree.md`), que só repassa `$ARGUMENTS` para o script.

`plan` é o primo do `next`: worktree de **planejamento** para rodar a skill `/plan-issue` sem ocupar o main. **Cada invocação cria um DIFERENTE** (sessões paralelas): com `bag` opcional → branch `plans/plan-issue-<bag>` (sufixo `-2`/`-3` se o nome já estiver vivo); sem `bag` → próximo sequencial `plans/plan-issue-<n>` livre. `new` é o irmão **neutro** (sem função pré-definida): branch `work/<bag>` ou `work/<n>` sequencial, prefixo que não colide com `next` nem `plan`. O fluxo desta skill (fila → próxima Issue → implementação) é só `next`.

**Default-go:** `next`, `plan` e `new` imprimem `cd <dir>` na última linha **por padrão**; `--stay` suprime. No terminal interativo, use a função `worktree()` do **roteador global** (`~/.config/shell/worktree.sh` — escopado pelo projeto atual via `git rev-parse`) para o `cd` ser aplicado de verdade no shell que te chamou. `kill` também imprime `cd <main>` no fim.

**Launch do opencode:** só a função shell marca `TEQO_WORKTREE_TERMINAL=1`; com o marcador, `next`/`plan`/`new` imprimem também a diretiva `launch opencode <dir> --model deepseek/deepseek-v4-flash --auto [--prompt "/work-issue --issue <N>"]` **antes** do `cd`, e a função a executa depois do cd — `next` abre o TUI com `/work-issue --issue <N>` já enviado; `plan` abre com `/plan-issue` já enviado; `new` abre sem `--prompt`. **O comando `/worktree` do opencode (e qualquer automação sem o marcador) nunca lança o TUI.**

## Fluxo quando invocado como skill

1. Rode `bun run worktree next` e leia a saída inteira. Se a fila estiver vazia, ele para sozinho — não crie worktree sem Issue.
2. Se a saída reclamar de conflito (worktree/branch já existentes), o script já reporta o que reutilizar.
3. Reporte ao usuário: código, `#<N>`, branch (`<code>-<slug>`), path — e que a Issue **já foi claimada** pelo próprio `next` (não rodar `bun run agent:claim`).

## O que o script garante (contrato)

- **Claim determinístico primeiro:** a próxima `ready` desbloqueada (mesma fila/ordem do `bun run agent:claim` — por `prio:P*` e mais antiga primeiro) é claimada com o **mesmo lock otimista** antes de qualquer `git`; race → o script para com o motivo, **sem worktree órfão**. `--issue N` claima a Issue direcionada (`ready`) ou **reabre** uma já claimada (`in-progress` — sem re-claim, idempotente; worktree reutilizado/criado). A saída imprime o brief do claim e avisa "já claimada — NÃO rodar `bun run agent:claim`".
- **Branch `<code>-<slug>`:** `code` = `id` do frontmatter; `slug` = título pt-BR slugificado (acentos fora, não-alfanumérico → hífen); truncamento só no slug, nunca no código; valida com `git check-ref-format --allow-onelevel`.
- **Base `origin/main`** (com `git fetch` antes); dir em `WORKTREES_ROOT` do `.forgejo/worktree.env` (default `~/.worktrees/<repo>`).
- **Provisiona o ambiente do worktree:** `bun install` (Iara é SPA sem banco — não há DB/porta/migrations).
- **`kill`:** recusa destruir o worktree principal (main); recusa worktree sujo sem `--force`; remove e apaga o branch.
- **NUNCA usa `--force` no `add`**, não inventa código de Issue, e nunca desfaz claim.

## NÃO faz

- Não roda `bun run agent:claim` por conta própria (o `next` claima sozinho).
- Não usa `git worktree add --force` nem destrói worktrees existentes (isso é `kill`, explícito).
- Não desfaz claim (reverter `in-progress` → `ready` é outra entrega).
- Não duplica a lógica: se o script falhar ou faltar (API fora do ar), reporte e pare.
