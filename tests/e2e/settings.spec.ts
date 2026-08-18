import { expect, test } from "@playwright/test";

test("tela de configuração salva e abre o chat", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Converse com o seu assistente de IA")).toBeVisible();
  await page.getByPlaceholder("wss://app.exemplo.dev/ws/chat").fill("ws://127.0.0.1:1/ws/chat");
  await page.getByPlaceholder("seu token de acesso").fill("token-de-teste");
  await page.getByRole("button", { name: "Conectar" }).click();

  await expect(page.getByPlaceholder("Escreva sua mensagem…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Configurações" })).toBeVisible();
  await expect(page.getByText("Fale com a Iara — pergunte, peça para criar eventos, tarefas, notas e e-mails.")).toBeVisible();
});
