# Iara

**Chat PWA local-first para falar com o seu assistente de IA.**

A Iara é um cliente de chat web progressivo (PWA) que conecta qualquer pessoa ao seu
assistente de IA (gateways compatíveis com o protocolo ZeroClaw) — basta configurar a
URL do gateway e a chave de acesso. Seus dados ficam no seu dispositivo e na sua
infraestrutura; nada passa por servidores de terceiros.

## Recursos

- **Local-first**: configuração, sessões e histórico guardados apenas no dispositivo (localStorage).
- **Chat em tempo real**: streaming de respostas via WebSocket (protocolo `zeroclaw.v1`).
- **Aprovações embutidas**: quando o assistente pede confirmação para uma ação
  (enviar e-mail, apagar, etc.), o card de aprovação aparece direto na conversa.
- **Voz (opcional)**: botão de microfone (STT) e leitura de respostas em voz alta (TTS),
  com endpoints configuráveis.
- **PWA instalável**: adicione à tela inicial no celular/desktop (manifest + service worker).
- **Privado por padrão**: o token fica no seu dispositivo e é enviado apenas ao gateway configurado.

## Como usar

1. Acesse a instância hospedada (ou rode localmente — veja abaixo).
2. Na tela inicial, preencha:
   - **URL do gateway (WebSocket)** — ex.: `wss://app.seu-dominio.dev/ws/chat`
   - **Token / chave** — o token de acesso fornecido pelo seu gateway
   - **Agente** — alias do agente (ex.: `main`)
   - **STT / TTS (opcional)** — URLs de transcrição e síntese de voz
3. Converse! 🎙

### Desenvolvimento

```bash
bun install
bun run dev      # dev server
bun run build    # build de produção em dist/
bun run preview  # servir o build localmente
```

## Protocolo

O cliente fala o protocolo de chat WebSocket do gateway:

- Conecta em `<gateway>/ws/chat?token=<token>&agent=<agent>&name=<nome>` (subprotocolo `zeroclaw.v1`).
- Cliente → servidor: `{"type":"message","content":"..."}`, `{"type":"approval_response","request_id":"...","decision":"approve|deny|always"}`.
- Servidor → cliente: `session_start`, `chunk`, `chunk_reset`, `thinking`, `tool_call`,
  `tool_result`, `done`, `approval_request`, `error`, `aborted`.

Referência completa dos tipos em `src/lib/ws.ts`.

## Stack

Vite · React · TypeScript · assistant-ui (runtime + primitives) · Tailwind CSS v4 · vite-plugin-pwa

## Licença

AGPL-3.0 — código aberto, copyleft. Veja [LICENSE](LICENSE).

## Histórico

- v0.1.1 — deploy automático via Forgejo Actions (runner workstation).
