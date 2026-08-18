# Brief de engenharia (carregar antes do plano de implementação)

Leia o que for relevante **antes** de travar a abordagem no `*-impl.md`.

## Pinos do repo (sempre)

- `AGENTS.md` — convenções, stack, workflow, CI
- `src/lib/` — regras de domínio: `ws.ts` (protocolo `zeroclaw.v1`), `messages.ts`, `settings.ts` (localStorage), `voice.ts`
- `vite.config.ts` — base `/_app/`, PWA (manifest + service worker), background sync do WS

## Skills sob demanda (não tour)

| Situação | Skill / princípio |
| -------- | ----------------- |
| Onde colocar lógica / dependência | `clean-architecture` — Dependency Rule; core testável |
| Complexidade de módulo / API | `software-design-philosophy` — deep modules, anti-classitis |
| Escopo v1 / cortar especulação | `37signals-way` / `pragmatic-programmer` — build less, tracer bullet |
| KPI/mapa/série na UI | [data-presentation.md](../plan-issue/data-presentation.md) pergunta 3 no impl |
| Debug de fluxo assíncrono | `debugging-and-error-recovery` |

## Invariantes que o impl plan não pode violar

- **Local-first:** configuração, sessões e histórico guardados apenas no dispositivo (localStorage) — nada de servidor próprio para estado do cliente.
- **Token nunca logado/commitado** — vai apenas ao gateway configurado pelo usuário.
- **Protocolo `zeroclaw.v1`** — tipos de `src/lib/ws.ts` são contrato; mudança de protocolo é breaking (major) e precisa de plano próprio.
- **Aprovações**: ações que exigem confirmação do assistente passam pelo fluxo `approval_request` → `approval_response` (ApprovalCard) — nunca auto-aprovar.
- **Copy pt-BR / identificadores em inglês.**
- **PWA**: qualquer asset novo que precise de offline deve entrar em `globPatterns`/manifest do `vite.config.ts`.

## Sistema de UI

`src/components/` é enxuto: `Chat.tsx` (thread + composer), `Settings.tsx` (URL/key/agente/STT/TTS), `ApprovalCard.tsx`. Reuse os primitives do assistant-ui — não reinvente thread/composer. Antes de criar componente novo, confira se não cabe estender um dos três.
