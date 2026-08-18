import { expect, test } from "@playwright/test";

test("chat monta e tenta reconectar quando o WS falha", async ({ page }) => {
  // Config apontando para uma porta fechada → conexão falha e o cliente
  // entra no ciclo de reconexão (status "reconectando…").
  await page.addInitScript(() => {
    localStorage.setItem(
      "iara.settings.v1",
      JSON.stringify({
        gatewayUrl: "ws://127.0.0.1:1/ws/chat",
        token: "token-de-teste",
        agent: "main",
        sessionName: "Iara",
        sttUrl: "",
        ttsUrl: "",
      }),
    );
  });

  await page.goto("/");

  await expect(page.getByPlaceholder("Escreva sua mensagem…")).toBeVisible();
  await expect(page.getByText("reconectando…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
});
