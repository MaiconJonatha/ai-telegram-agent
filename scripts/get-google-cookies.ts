/**
 * Script para fazer login no Google e salvar cookies.
 * Execute: npx ts-node scripts/get-google-cookies.ts
 *
 * Vai abrir um navegador real, faça login no Google,
 * depois feche o navegador. Os cookies serão salvos.
 */
import { chromium } from "playwright";
import * as fs from "fs";

async function main() {
  console.log("🌐 Abrindo navegador para login no Google...");
  console.log("📌 Faça login na sua conta Google e depois FECHE o navegador.\n");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://accounts.google.com");

  // Esperar o usuário fechar o navegador
  await new Promise<void>((resolve) => {
    browser.on("disconnected", () => resolve());
  });

  // Salvar cookies
  const cookies = await context.cookies().catch(() => []);

  // Salvar como arquivo
  fs.writeFileSync("google-cookies.json", JSON.stringify(cookies, null, 2));
  console.log("\n✅ Cookies salvos em google-cookies.json");

  // Gerar base64 pra env var
  const b64 = Buffer.from(JSON.stringify(cookies)).toString("base64");
  console.log("\n📋 Cole isso como GOOGLE_COOKIES no Render:");
  console.log(`\n${b64}\n`);
}

main().catch(console.error);
