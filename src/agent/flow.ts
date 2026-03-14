import { chromium, Browser, BrowserContext, Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const FLOW_URL = "https://labs.google/fx/tools/flow";
const COOKIES_PATH = path.join(process.cwd(), "google-cookies.json");
const FLOW_TIMEOUT = 120_000;
const NAV_TIMEOUT = 30_000;

let browser: Browser | null = null;
let context: BrowserContext | null = null;

// ========== COOKIES: env var + arquivo ==========

function loadCookiesFromEnv(): any[] | null {
  const envCookies = process.env.GOOGLE_COOKIES;
  if (envCookies) {
    try {
      const cookies = JSON.parse(Buffer.from(envCookies, "base64").toString());
      console.log("[Flow] Cookies carregados da env var");
      return cookies;
    } catch (e: any) {
      console.log("[Flow] Erro ao decodificar GOOGLE_COOKIES:", e.message);
    }
  }
  return null;
}

function loadCookiesFromFile(): any[] | null {
  if (fs.existsSync(COOKIES_PATH)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf-8"));
      console.log("[Flow] Cookies carregados do arquivo");
      return cookies;
    } catch (e: any) {
      console.log("[Flow] Erro ao ler cookies:", e.message);
    }
  }
  return null;
}

async function saveCookies(): Promise<void> {
  if (!context) return;
  try {
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    // Log base64 pra poder salvar como env var
    const b64 = Buffer.from(JSON.stringify(cookies)).toString("base64");
    console.log("[Flow] Cookies salvos. Para persistir, defina GOOGLE_COOKIES env var.");
    console.log(`[Flow] GOOGLE_COOKIES=${b64.substring(0, 50)}...`);
  } catch (e: any) {
    console.log("[Flow] Erro ao salvar cookies:", e.message);
  }
}

// ========== BROWSER ==========

async function getContext(): Promise<BrowserContext> {
  if (context) return context;

  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--single-process",
    ],
  });

  context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });

  // Carregar cookies (env var tem prioridade)
  const cookies = loadCookiesFromEnv() || loadCookiesFromFile();
  if (cookies) {
    await context.addCookies(cookies);
  }

  return context;
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await saveCookies();
    await context.close().catch(() => {});
    context = null;
  }
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

async function checkLogin(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes("accounts.google.com") || url.includes("signin")) {
    console.log("[Flow] Login necessário. URL:", url);
    return true;
  }
  return false;
}

// ========== EXTRAÇÃO DE IMAGEM ==========

async function waitForGeneratedImage(page: Page): Promise<Buffer | null> {
  try {
    await page.waitForTimeout(5000);

    // Esperar loading terminar
    try {
      await page.waitForFunction(
        `document.querySelectorAll('[role="progressbar"], .loading, [aria-busy="true"]').length === 0`,
        { timeout: FLOW_TIMEOUT }
      );
    } catch {
      console.log("[Flow] Timeout esperando loading");
    }

    await page.waitForTimeout(3000);

    // Estratégia 1: img/canvas
    const selectors = [
      'img[src^="blob:"]', 'img[src^="data:image"]',
      ".result img", '[data-testid="result"] img',
      "canvas", ".generated-image img", '[role="img"]',
    ];

    for (const selector of selectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        const el = elements[elements.length - 1];
        const tag = await el.evaluate((e) => e.tagName.toLowerCase());

        if (tag === "canvas") {
          const dataUrl = await el.evaluate((c: any) => c.toDataURL("image/png"));
          if (dataUrl?.startsWith("data:image")) {
            console.log("[Flow] Imagem do canvas");
            return Buffer.from(dataUrl.split(",")[1], "base64");
          }
        } else if (tag === "img") {
          const dataUrl = await el.evaluate((img: any) => {
            const doc = img.ownerDocument;
            const canvas = doc.createElement("canvas");
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx2d = canvas.getContext("2d");
            if (ctx2d) { ctx2d.drawImage(img, 0, 0); return canvas.toDataURL("image/png"); }
            return null;
          });
          if (dataUrl?.startsWith("data:image")) {
            console.log("[Flow] Imagem extraída");
            return Buffer.from(dataUrl.split(",")[1], "base64");
          }
        }
      }
    }

    // Estratégia 2: botão download
    const dlBtn = await page.$('button:has-text("Download"), [aria-label*="download" i]');
    if (dlBtn) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
        dlBtn.click(),
      ]);
      if (download) {
        const fp = await download.path();
        if (fp) { console.log("[Flow] Imagem via download"); return fs.readFileSync(fp); }
      }
    }

    // Estratégia 3: screenshot
    const area = await page.$('.result, [data-testid="result"], main');
    if (area) {
      const ss = await area.screenshot({ type: "png" });
      if (ss.length > 5000) { console.log("[Flow] Screenshot"); return Buffer.from(ss); }
    }

    return null;
  } catch (e: any) {
    console.log("[Flow] Erro imagem:", e.message);
    return null;
  }
}

// ========== EXTRAÇÃO DE VÍDEO ==========

async function waitForGeneratedVideo(page: Page): Promise<Buffer | null> {
  try {
    await page.waitForTimeout(5000);
    try {
      await page.waitForFunction(
        `document.querySelectorAll('[role="progressbar"], .loading, [aria-busy="true"]').length === 0`,
        { timeout: FLOW_TIMEOUT }
      );
    } catch { console.log("[Flow] Timeout vídeo loading"); }

    await page.waitForTimeout(5000);

    for (const selector of ["video source", "video", 'video[src^="blob:"]']) {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const tag = await el.evaluate((e) => e.tagName.toLowerCase());
        let src: string | null = null;
        if (tag === "source") src = await el.getAttribute("src");
        else {
          src = await el.getAttribute("src");
          if (!src) src = await el.evaluate((v: any) => v.querySelector("source")?.src || v.currentSrc || null);
        }
        if (src?.startsWith("blob:")) {
          const b64 = await page.evaluate(async (url: string) => {
            try {
              const r = await fetch(url);
              const b = await r.blob();
              const a = await b.arrayBuffer();
              const u8 = new Uint8Array(a);
              let s = ""; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
              return btoa(s);
            } catch { return ""; }
          }, src);
          if (b64 && b64.length > 100) { console.log("[Flow] Vídeo blob"); return Buffer.from(b64, "base64"); }
        }
      }
    }

    const dlBtn = await page.$('button:has-text("Download"), [aria-label*="download" i]');
    if (dlBtn) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
        dlBtn.click(),
      ]);
      if (download) {
        const fp = await download.path();
        if (fp) { console.log("[Flow] Vídeo download"); return fs.readFileSync(fp); }
      }
    }

    return null;
  } catch (e: any) {
    console.log("[Flow] Erro vídeo:", e.message);
    return null;
  }
}

// ========== GERAÇÃO ==========

async function flowGenerate(prompt: string, type: "image" | "video"): Promise<Buffer | null> {
  let page: Page | null = null;
  try {
    const ctx = await getContext();
    page = await ctx.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT);

    console.log(`[Flow] Navegando...`);
    await page.goto(FLOW_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(3000);

    if (await checkLogin(page)) {
      console.log("[Flow] Login necessário, abortando");
      return null;
    }

    await saveCookies();

    // Encontrar input
    const inputSels = ['textarea', 'input[type="text"]', '[contenteditable="true"]', '[role="textbox"]', 'input[placeholder]'];
    let inputEl = null;
    for (const sel of inputSels) {
      inputEl = await page.$(sel);
      if (inputEl) break;
    }

    if (!inputEl) {
      await page.click("body");
      await page.waitForTimeout(1000);
      for (const sel of inputSels) { inputEl = await page.$(sel); if (inputEl) break; }
    }

    if (!inputEl) {
      console.log("[Flow] Sem campo de input");
      await page.screenshot({ path: path.join(process.cwd(), "flow-debug.png"), fullPage: true });
      return null;
    }

    await inputEl.click();
    await page.waitForTimeout(500);
    await inputEl.fill(prompt);
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);

    // Botão submit
    for (const sel of ['button:has-text("Generate")', 'button:has-text("Create")', 'button[type="submit"]', 'button[aria-label*="generate" i]']) {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible().catch(() => false)) { await btn.click(); break; }
    }

    console.log(`[Flow] Aguardando ${type}...`);
    return type === "image" ? await waitForGeneratedImage(page) : await waitForGeneratedVideo(page);
  } catch (e: any) {
    console.log(`[Flow] Erro: ${e.message}`);
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

// ========== FALLBACKS GEMINI ==========

async function geminiGenerateImage(prompt: string): Promise<Buffer | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
      }
    );
    if (res.ok) {
      const data = await res.json() as any;
      const img = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (img?.inlineData?.data) { console.log("[Flow/Gemini] IMG OK"); return Buffer.from(img.inlineData.data, "base64"); }
    }
  } catch (e: any) { console.log("[Flow/Gemini] IMG erro:", e.message); }
  return null;
}

async function geminiGenerateVideo(prompt: string): Promise<Buffer | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { aspectRatio: "16:9", durationSeconds: 8, personGeneration: "allow_adult" },
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const op = data.name;
    if (!op) return null;

    for (let i = 0; i < 36; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const check = await fetch(`https://generativelanguage.googleapis.com/v1beta/${op}?key=${key}`);
      const status = await check.json() as any;
      if (status.done) {
        const b64 = status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.bytesBase64Encoded;
        if (b64) { console.log("[Flow/Gemini] VID OK"); return Buffer.from(b64, "base64"); }
        const uri = status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (uri) {
          const r = await fetch(uri);
          if (r.ok) { const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 1000) return buf; }
        }
        return null;
      }
      if (i % 6 === 0) console.log(`[Flow/Gemini] VID aguardando... ${i * 5}s`);
    }
  } catch (e: any) { console.log("[Flow/Gemini] VID erro:", e.message); }
  return null;
}

// ========== API PÚBLICA ==========

export async function generateFlowImage(prompt: string): Promise<Buffer | null> {
  console.log(`[Flow/IMG] ${prompt.substring(0, 60)}...`);
  try {
    const result = await flowGenerate(prompt, "image");
    if (result && result.length > 1000) return result;
  } catch (e: any) { console.log("[Flow/IMG] Falhou:", e.message); }

  const gemini = await geminiGenerateImage(prompt);
  if (gemini) return gemini;
  return null;
}

export async function generateFlowVideo(prompt: string): Promise<Buffer | null> {
  console.log(`[Flow/VID] ${prompt.substring(0, 60)}...`);
  try {
    const result = await flowGenerate(prompt, "video");
    if (result && result.length > 1000) return result;
  } catch (e: any) { console.log("[Flow/VID] Falhou:", e.message); }

  const gemini = await geminiGenerateVideo(prompt);
  if (gemini) return gemini;
  return null;
}
