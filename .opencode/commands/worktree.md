---
description: Claima a próxima Issue (next [--issue N] [--stay]), cria o worktree dela e provisiona o ambiente; também cria worktree de planejamento (plan [bag] [--stay]), worktree neutro (new [bag] [--stay]) ou destrói o atual (kill [--force])
---

Rode o script determinístico abaixo (não improvise a lógica) e reporte o resultado de forma concisa.

- `next [--issue N] [--stay]`: **claima** a próxima Issue claimável da fila (mesma fila/ordem e lock otimista de `bun run agent:claim`) e cria (ou reutiliza) o worktree dela. Claim falhou → reporte o motivo — não há worktree. `--issue N` claima a Issue direcionada (`ready`) ou **reabre** uma já claimada (`in-progress`, sem re-claim). A saída avisa "já claimada — NÃO rodar `bun run agent:claim`". Por padrão o script imprime `cd <dir>` na última linha — aplique-o na sessão de shell atual (`cd <dir>`) e reporte o novo diretório. `--stay` suprime o `cd` (não troque de diretório) mas o claim ainda acontece. `--go` explícito continua aceito como no-op.
- `plan [bag] [--stay]`: cria um worktree de planejamento **diferente a cada invocação** (branch `plans/plan-issue-<bag>`, ou `plans/plan-issue-<n>` sequencial sem bag; sufixo `-2`/`-3` em colisão) para rodar `/plan-issue` sem ocupar o main; nunca conflita com `next`. Não claima nada. Mesmo contrato de `cd` do `next`: aplique a última linha `cd <dir>` por padrão; `--stay` suprime.
- `new [bag] [--stay]`: cria um worktree **neutro** (sem função pré-definida — explorar ideia, conversar, planejar sem registrar nada) **diferente a cada invocação** (branch `work/<bag>`, ou `work/<n>` sequencial sem bag; sufixo `-2`/`-3` em colisão); o prefixo minúsculo `work/…` nunca conflita com `next` nem `plan`. Não claima nada. Mesmo contrato de `cd` do `plan`.
- `kill [--force]`: destrói o worktree em que você está. O script imprime `cd <main>` na última linha — aplique-o (`cd <main>`) para a sessão sair do diretório destruído.

> **Este comando roda SEM o marcador `TEQO_WORKTREE_TERMINAL`, então nunca recebe a diretiva `launch`** — só o `cd`. O launch do opencode acontece apenas na função `worktree()` do roteador global (`~/.config/shell/worktree.sh`, terminal interativo); nunca abra um TUI aninhado a partir daqui.

!`node scripts/worktree.mjs $ARGUMENTS`
