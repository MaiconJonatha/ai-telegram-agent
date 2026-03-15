/**
 * Geração de imagens e vídeos via Google Flow (labs.google/fx/tools/flow)
 * Usa Puppeteer para automatizar o site diretamente.
 */

import puppeteer, { Browser, Page } from "puppeteer-core";
import * as fs from "fs";
import * as path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const COOKIES_PATH = path.join(__dirname, "../../google_cookies.json");
const FLOW_URL = "https://labs.google/fx/pt/tools/flow";

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) return browserInstance;
  browserInstance = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1280,720"],
  });
  return browserInstance;
}

async function loadCookies(page: Page): Promise<void> {
  if (!fs.existsSync(COOKIES_PATH)) {
    console.log("[Flow] Cookies não encontrados:", COOKIES_PATH);
    return;
  }
  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf-8"));
  const mapped = cookies
    .filter((c: any) => c.domain && c.name && c.value)
    .map((c: any) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || "/",
      expires: c.expires && c.expires > 0 ? Math.floor(c.expires) : undefined,
      httpOnly: c.httpOnly || false,
      secure: c.secure || false,
      sameSite: c.sameSite === "None" ? "None" as const :
               c.sameSite === "Strict" ? "Strict" as const : "Lax" as const,
    }));
  await page.setCookie(...mapped);
}

async function closePopups(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    try {
      const buttons = await page.$$("button");
      let found = false;
      for (const btn of buttons) {
        const text = await page.evaluate((el: any) => el.textContent || "", btn);
        if (text.trim() === "close" || text.trim() === "Aceitar") {
          await btn.click();
          found = true;
          await new Promise(r => setTimeout(r, 500));
          break;
        }
      }
      if (!found) break;
    } catch {
      break;
    }
  }
}

async function clickNewProject(page: Page): Promise<void> {
  const buttons = await page.$$("button");
  for (const btn of buttons) {
    const text = await page.evaluate((el: any) => el.textContent || "", btn);
    if (text.includes("Novo projeto") || text.includes("New project")) {
      await btn.click();
      return;
    }
  }
}

async function typePrompt(page: Page, prompt: string): Promise<boolean> {
  const selectors = ['[contenteditable="true"]', 'div[role="textbox"]', "textarea"];
  for (const sel of selectors) {
    const field = await page.$(sel);
    if (field) {
      await field.click();
      await field.type(prompt, { delay: 20 });
      return true;
    }
  }
  return false;
}

async function clickCreate(page: Page): Promise<void> {
  // Tentar clicar no botão de criar de várias formas
  const allButtons = await page.$$("button");
  for (const btn of allButtons) {
    const info = await page.evaluate((el: any) => {
      const rect = el.getBoundingClientRect();
      const text = el.textContent || "";
      const ariaLabel = el.getAttribute("aria-label") || "";
      // Botão da seta fica no canto inferior direito da barra de prompt
      return {
        text: text.trim(),
        ariaLabel,
        visible: rect.width > 0 && rect.height > 0,
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height,
      };
    }, btn);

    if (!info.visible) continue;

    // Procurar pelo botão arrow_forward/Criar que fica perto do prompt
    if (
      info.text.includes("arrow_forward") ||
      info.ariaLabel.includes("Criar") ||
      info.ariaLabel.includes("Create") ||
      info.ariaLabel.includes("Send") ||
      info.ariaLabel.includes("Enviar")
    ) {
      console.log(`[Flow] Clicando botão: "${info.text}" aria="${info.ariaLabel}" pos=${info.x},${info.y}`);
      await btn.click();
      return;
    }
  }

  // Fallback: clicar no botão circular no canto inferior direito (a seta →)
  // Geralmente é o último botão visível na barra inferior
  const bottomButtons = [];
  for (const btn of allButtons) {
    const pos = await page.evaluate((el: any) => {
      const rect = el.getBoundingClientRect();
      return { y: rect.y, x: rect.x, w: rect.width, h: rect.height, visible: rect.width > 0 };
    }, btn);
    if (pos.visible && pos.y > 600) { // abaixo de 600px = barra inferior
      bottomButtons.push({ btn, ...pos });
    }
  }

  if (bottomButtons.length > 0) {
    // O botão mais à direita na barra inferior
    bottomButtons.sort((a, b) => b.x - a.x);
    console.log(`[Flow] Fallback: clicando botão mais à direita na barra inferior (x=${bottomButtons[0].x})`);
    await bottomButtons[0].btn.click();
  }
}

async function downloadImageFromPage(page: Page, imgElement: any): Promise<Buffer | null> {
  const imgSrc: string = await page.evaluate((el: any) => el.src || "", imgElement);

  if (imgSrc.startsWith("data:")) {
    const base64Data = imgSrc.split(",")[1];
    return base64Data ? Buffer.from(base64Data, "base64") : null;
  }

  if (imgSrc.startsWith("http")) {
    const b64: string | null = await page.evaluate(async (src: string) => {
      try {
        const res = await fetch(src);
        const arrayBuf = await res.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      } catch {
        return null;
      }
    }, imgSrc);

    return b64 ? Buffer.from(b64, "base64") : null;
  }

  return null;
}

async function checkFailed(page: Page): Promise<boolean> {
  return page.evaluate(`(() => {
    const all = document.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const t = all[i].textContent?.trim();
      if (t === "Falha" || t === "Failed") return true;
    }
    return false;
  })()`) as Promise<boolean>;
}

// ========== IMAGEM via Google Flow ==========

async function _generateFlowImageOnce(prompt: string): Promise<Buffer | null> {
  let page: Page | null = null;

  try {
    console.log(`[${new Date().toISOString()}] [Flow/IMG] Gerando via site: ${prompt.substring(0, 50)}...`);
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await loadCookies(page);

    await page.goto(FLOW_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await closePopups(page);
    await new Promise(r => setTimeout(r, 1000));
    await clickNewProject(page);
    await new Promise(r => setTimeout(r, 3000));

    if (!(await typePrompt(page, prompt))) {
      console.log(`[${new Date().toISOString()}] [Flow/IMG] Campo de prompt não encontrado`);
      await page.close();
      return null;
    }

    await new Promise(r => setTimeout(r, 500));
    await clickCreate(page);
    console.log(`[${new Date().toISOString()}] [Flow/IMG] Aguardando geração...`);

    // Esperar a imagem (max 90s)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));

      // Debug: salvar screenshot a cada 30s
      if (i === 10 || i === 20) {
        await page.screenshot({ path: path.join(__dirname, `../../debug_flow_${i}.png`) });
        console.log(`[${new Date().toISOString()}] [Flow/IMG] Debug screenshot salvo (iteração ${i})`);
      }

      // Buscar imagens de múltiplas formas
      let images = await page.$$('img[alt="Imagem gerada"], img[alt="Generated image"]');
      if (images.length === 0) {
        // Tentar seletores alternativos - imagens dentro de links
        images = await page.$$('a[href*="/edit/"] img');
      }
      if (images.length === 0) {
        // Qualquer imagem grande que não seja ícone
        const allImgs = await page.$$("img");
        for (const img of allImgs) {
          const size = await page.evaluate((el: any) => {
            const rect = el.getBoundingClientRect();
            return { w: rect.width, h: rect.height, src: el.src || "", alt: el.alt || "" };
          }, img);
          if (size.w > 200 && size.h > 200 && !size.src.includes("logo") && !size.src.includes("icon") && !size.alt.includes("perfil") && !size.alt.includes("profile")) {
            images = [img];
            console.log(`[${new Date().toISOString()}] [Flow/IMG] Imagem grande encontrada: ${size.w}x${size.h} alt="${size.alt}"`);
            break;
          }
        }
      }

      if (images.length > 0) {
        console.log(`[${new Date().toISOString()}] [Flow/IMG] ${images.length} imagem(ns) encontrada(s)!`);
        const buf = await downloadImageFromPage(page, images[0]);
        if (buf && buf.length > 1000) {
          console.log(`[${new Date().toISOString()}] [Flow/IMG] OK! ${buf.length} bytes`);
          await page.close();
          return buf;
        }
      }

      // Checar progresso - se tiver % significa que está gerando
      const progress = await page.evaluate(`(() => {
        const all = document.querySelectorAll("*");
        let hasProgress = false;
        let hasFail = false;
        for (let i = 0; i < all.length; i++) {
          const t = all[i].textContent?.trim();
          if (t && t.match(/^\\d+%$/)) hasProgress = true;
          if (t === "Falha" || t === "Failed") hasFail = true;
        }
        return { hasProgress, hasFail };
      })()`) as { hasProgress: boolean; hasFail: boolean };

      if (progress.hasProgress) {
        if (i % 5 === 0) console.log(`[${new Date().toISOString()}] [Flow/IMG] Progresso detectado, aguardando...`);
        continue; // Ainda gerando, não verificar falha
      }

      if (i > 10 && progress.hasFail) {
        console.log(`[${new Date().toISOString()}] [Flow/IMG] Geração falhou no Flow`);
        await page.screenshot({ path: path.join(__dirname, "../../debug_flow_fail.png") });
        break;
      }

      if (i % 5 === 0) console.log(`[${new Date().toISOString()}] [Flow/IMG] Aguardando... ${i * 3}s`);
    }

    // Screenshot final pra debug
    await page.screenshot({ path: path.join(__dirname, "../../debug_flow_final.png") });
    console.log(`[${new Date().toISOString()}] [Flow/IMG] Screenshot final salvo`);

    await page.close();
    return null;
  } catch (e: any) {
    console.error(`[${new Date().toISOString()}] [Flow/IMG] Erro: ${e.message}`);
    if (page) await page.close().catch(() => {});
    return null;
  }
}

export async function generateFlowImage(prompt: string): Promise<Buffer | null> {
  const result = await _generateFlowImageOnce(prompt);
  if (result) return result;

  // Retry once after 5 seconds
  console.log(`[${new Date().toISOString()}] [Flow/IMG] Primeira tentativa falhou, retentando em 5s...`);
  await new Promise(r => setTimeout(r, 5000));
  const retryResult = await _generateFlowImageOnce(prompt);
  if (!retryResult) {
    console.error(`[${new Date().toISOString()}] [Flow/IMG] Segunda tentativa também falhou para: "${prompt.substring(0, 50)}"`);
  }
  return retryResult;
}

// ========== VÍDEO via Google Flow ==========

async function _generateFlowVideoOnce(prompt: string): Promise<Buffer | null> {
  let page: Page | null = null;

  try {
    console.log(`[${new Date().toISOString()}] [Flow/VID] Gerando via site: ${prompt.substring(0, 50)}...`);
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await loadCookies(page);

    await page.goto(FLOW_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await closePopups(page);
    await new Promise(r => setTimeout(r, 1000));
    await clickNewProject(page);
    await new Promise(r => setTimeout(r, 3000));

    // 1. Clicar no botão do modelo pra abrir o menu
    const allBtns = await page.$$("button");
    for (const btn of allBtns) {
      const text = await page.evaluate((el: any) => el.textContent || "", btn);
      if (text.includes("Banana") || text.includes("banana") || text.includes("crop_16_9")) {
        await btn.click();
        console.log(`[${new Date().toISOString()}] [Flow/VID] Menu de modelo aberto: "${text.substring(0, 40)}"`);
        await new Promise(r => setTimeout(r, 1500));
        break;
      }
    }

    // 2. Clicar na tab "Vídeo"
    const tabs = await page.$$('[role="tab"]');
    for (const tab of tabs) {
      const text = await page.evaluate((el: any) => el.textContent || "", tab);
      if (text.includes("deo") || text.includes("Video") || text.includes("videocam")) {
        await tab.click();
        console.log(`[${new Date().toISOString()}] [Flow/VID] Tab Vídeo selecionada: "${text.trim()}"`);
        await new Promise(r => setTimeout(r, 1000));
        break;
      }
    }

    // 2.5. Selecionar x1 (só 1 vídeo = 20 créditos em vez de 40)
    const countTabs = await page.$$('[role="tab"]');
    for (const tab of countTabs) {
      const text = await page.evaluate((el: any) => el.textContent?.trim() || "", tab);
      if (text === "x1") {
        await tab.click();
        console.log(`[${new Date().toISOString()}] [Flow/VID] Quantidade x1 selecionada`);
        await new Promise(r => setTimeout(r, 500));
        break;
      }
    }

    // 3. Fechar o menu
    await page.keyboard.press("Escape");
    await new Promise(r => setTimeout(r, 1500));

    // 4. Digitar o prompt - clicar no campo de texto na parte inferior
    await page.screenshot({ path: path.join(__dirname, "../../debug_flowvid_before_type.png") });
    if (!(await typePrompt(page, prompt))) {
      console.log(`[${new Date().toISOString()}] [Flow/VID] typePrompt falhou, tentando fallback...`);
      // Fallback: clicar diretamente nas coordenadas do campo de prompt
      await page.mouse.click(640, 624); // centro do campo de prompt
      await new Promise(r => setTimeout(r, 500));
      await page.keyboard.type(prompt, { delay: 20 });
    }
    console.log(`[${new Date().toISOString()}] [Flow/VID] Prompt digitado`);
    await page.screenshot({ path: path.join(__dirname, "../../debug_flowvid_after_type.png") });

    await new Promise(r => setTimeout(r, 500));
    await clickCreate(page);
    console.log(`[${new Date().toISOString()}] [Flow/VID] Aguardando geração de vídeo...`);

    // Esperar vídeo (max 5 min)
    let videoBuffer: Buffer | null = null;
    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 3000));

      // Debug screenshot
      if (i === 20 || i === 40) {
        await page.screenshot({ path: path.join(__dirname, `../../debug_flowvid_${i}.png`) });
        console.log(`[Flow/VID] Debug screenshot (iteração ${i})`);
      }

      // Procurar vídeos renderizados
      const videos = await page.$$("video");
      for (const vid of videos) {
        const src: string = await page.evaluate((el: any) => {
          const v = el as any;
          if (v.src && v.src.startsWith("http")) return v.src;
          const source = v.querySelector("source");
          if (source && source.src) return source.src;
          return "";
        }, vid);

        if (src && src.startsWith("http")) {
          console.log(`[${new Date().toISOString()}] [Flow/VID] Vídeo encontrado, baixando...`);
          const b64: string | null = await page.evaluate(async (url: string) => {
            try {
              const res = await fetch(url);
              const arrayBuf = await res.arrayBuffer();
              const bytes = new Uint8Array(arrayBuf);
              let binary = "";
              for (let j = 0; j < bytes.length; j++) {
                binary += String.fromCharCode(bytes[j]);
              }
              return btoa(binary);
            } catch {
              return null;
            }
          }, src);

          if (b64) {
            videoBuffer = Buffer.from(b64, "base64");
            if (videoBuffer.length > 1000) {
              console.log(`[${new Date().toISOString()}] [Flow/VID] OK! ${videoBuffer.length} bytes`);
              await page.close();
              return videoBuffer;
            }
          }
        }
      }

      // Também procurar por links de download de vídeo
      const downloadLinks = await page.$$('a[download], a[href*=".mp4"]');
      for (const link of downloadLinks) {
        const href: string = await page.evaluate((el: any) => el.href || "", link);
        if (href && href.startsWith("http")) {
          console.log(`[${new Date().toISOString()}] [Flow/VID] Link de download encontrado`);
          const b64: string | null = await page.evaluate(async (url: string) => {
            try {
              const res = await fetch(url);
              const arrayBuf = await res.arrayBuffer();
              const bytes = new Uint8Array(arrayBuf);
              let binary = "";
              for (let j = 0; j < bytes.length; j++) {
                binary += String.fromCharCode(bytes[j]);
              }
              return btoa(binary);
            } catch {
              return null;
            }
          }, href);

          if (b64) {
            videoBuffer = Buffer.from(b64, "base64");
            if (videoBuffer.length > 1000) {
              console.log(`[${new Date().toISOString()}] [Flow/VID] OK via download! ${videoBuffer.length} bytes`);
              await page.close();
              return videoBuffer;
            }
          }
        }
      }

      // Checar progresso
      const progress = await page.evaluate(`(() => {
        const all = document.querySelectorAll("*");
        let hasProgress = false;
        let hasFail = false;
        for (let i = 0; i < all.length; i++) {
          const t = all[i].textContent?.trim();
          if (t && t.match(/^\\d+%$/)) hasProgress = true;
          if (t === "Falha" || t === "Failed") hasFail = true;
        }
        return { hasProgress, hasFail };
      })()`) as { hasProgress: boolean; hasFail: boolean };

      if (progress.hasProgress) {
        if (i % 10 === 0) console.log(`[${new Date().toISOString()}] [Flow/VID] Progresso detectado, aguardando...`);
        continue;
      }

      if (i > 20 && progress.hasFail) {
        console.log(`[${new Date().toISOString()}] [Flow/VID] Geração falhou`);
        await page.screenshot({ path: path.join(__dirname, "../../debug_flowvid_fail.png") });
        break;
      }

      if (i % 10 === 0) console.log(`[${new Date().toISOString()}] [Flow/VID] Aguardando... ${i * 3}s`);
    }

    await page.close();
    return null;
  } catch (e: any) {
    console.error(`[${new Date().toISOString()}] [Flow/VID] Erro: ${e.message}`);
    if (page) await page.close().catch(() => {});
    return null;
  }
}

export async function generateFlowVideo(prompt: string): Promise<Buffer | null> {
  const result = await _generateFlowVideoOnce(prompt);
  if (result) return result;

  // Retry once after 5 seconds
  console.log(`[${new Date().toISOString()}] [Flow/VID] Primeira tentativa falhou, retentando em 5s...`);
  await new Promise(r => setTimeout(r, 5000));
  const retryResult = await _generateFlowVideoOnce(prompt);
  if (!retryResult) {
    console.error(`[${new Date().toISOString()}] [Flow/VID] Segunda tentativa também falhou para: "${prompt.substring(0, 50)}"`);
  }
  return retryResult;
}

process.on("SIGTERM", () => {
  if (browserInstance) browserInstance.close().catch(() => {});
});

process.on("exit", () => {
  if (browserInstance) browserInstance.close().catch(() => {});
});
