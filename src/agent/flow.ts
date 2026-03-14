import { chromium, Browser, BrowserContext, Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const FLOW_URL = "https://labs.google/fx/tools/flow";
const COOKIES_PATH = path.join(process.cwd(), "google-cookies.json");
const FLOW_TIMEOUT = 120_000; // 2 min max wait for generation
const NAV_TIMEOUT = 30_000;

let browser: Browser | null = null;
let context: BrowserContext | null = null;

/**
 * Get or create a persistent browser context with saved cookies.
 */
async function getContext(): Promise<BrowserContext> {
  if (context) return context;

  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });

  // Load saved cookies if available
  if (fs.existsSync(COOKIES_PATH)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf-8"));
      await context.addCookies(cookies);
      console.log("[Flow] Cookies carregados");
    } catch (e: any) {
      console.log("[Flow] Erro ao carregar cookies:", e.message);
    }
  }

  return context;
}

/**
 * Save current cookies to disk for session persistence.
 */
async function saveCookies(): Promise<void> {
  if (!context) return;
  try {
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log("[Flow] Cookies salvos");
  } catch (e: any) {
    console.log("[Flow] Erro ao salvar cookies:", e.message);
  }
}

/**
 * Close the browser instance (cleanup).
 */
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

/**
 * Check if the page requires Google login and handle it.
 * Returns true if login is needed but cannot be automated (user must provide cookies).
 */
async function checkLogin(page: Page): Promise<boolean> {
  // Check if we're redirected to a login page
  const url = page.url();
  if (url.includes("accounts.google.com") || url.includes("signin")) {
    console.log("[Flow] Login necessario. Pagina atual:", url);
    console.log(
      "[Flow] Para fazer login, execute o script com headless=false uma vez,"
    );
    console.log(
      "[Flow] faca login manualmente, e os cookies serao salvos automaticamente."
    );
    return true;
  }
  return false;
}

/**
 * Wait for and extract a generated image from Google Flow.
 */
async function waitForGeneratedImage(page: Page): Promise<Buffer | null> {
  try {
    // Wait for generation to complete - look for result images
    // Flow typically shows generated content in img tags or canvas elements
    await page.waitForTimeout(5000); // Initial wait for generation to start

    // Wait for loading indicators to disappear
    try {
      await page.waitForFunction(
        `document.querySelectorAll('[role="progressbar"], .loading, [aria-busy="true"]').length === 0`,
        { timeout: FLOW_TIMEOUT }
      );
    } catch {
      console.log("[Flow] Timeout esperando loading terminar");
    }

    await page.waitForTimeout(3000); // Extra wait for render

    // Try to find generated image - multiple strategies
    // Strategy 1: Look for result image containers
    const imageSelectors = [
      'img[src^="blob:"]',
      'img[src^="data:image"]',
      ".result img",
      '[data-testid="result"] img',
      "canvas",
      ".generated-image img",
      '[role="img"]',
    ];

    for (const selector of imageSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        // Get the last/newest image (likely the generated one)
        const el = elements[elements.length - 1];
        const tagName = await el.evaluate((e) => e.tagName.toLowerCase());

        if (tagName === "canvas") {
          // Extract from canvas
          const dataUrl = await el.evaluate(
            (canvas: any) => (canvas as any).toDataURL("image/png") as string
          );
          if (dataUrl && dataUrl.startsWith("data:image")) {
            const base64 = dataUrl.split(",")[1];
            console.log("[Flow] Imagem extraida do canvas");
            return Buffer.from(base64, "base64");
          }
        } else if (tagName === "img") {
          const src = await el.getAttribute("src");
          if (src && (src.startsWith("blob:") || src.startsWith("data:image"))) {
            // For blob URLs, we need to fetch through the page context
            const dataUrl = await el.evaluate((img: any) => {
              const doc = img.ownerDocument;
              const canvas = doc.createElement("canvas");
              canvas.width = img.naturalWidth || img.width;
              canvas.height = img.naturalHeight || img.height;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                return canvas.toDataURL("image/png") as string;
              }
              return null;
            });
            if (dataUrl && dataUrl.startsWith("data:image")) {
              const base64 = dataUrl.split(",")[1];
              console.log("[Flow] Imagem extraida de img element");
              return Buffer.from(base64, "base64");
            }
          }
        }
      }
    }

    // Strategy 2: Intercept download if there's a download button
    const downloadButtons = await page.$$(
      'button:has-text("Download"), button:has-text("download"), [aria-label*="download" i], [aria-label*="Download" i]'
    );
    if (downloadButtons.length > 0) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
        downloadButtons[0].click(),
      ]);
      if (download) {
        const filePath = await download.path();
        if (filePath) {
          const buf = fs.readFileSync(filePath);
          console.log("[Flow] Imagem obtida via download");
          return buf;
        }
      }
    }

    // Strategy 3: Take a screenshot of the result area as fallback
    const resultArea = await page.$(
      '.result, [data-testid="result"], main, [role="main"]'
    );
    if (resultArea) {
      const screenshot = await resultArea.screenshot({ type: "png" });
      if (screenshot.length > 5000) {
        console.log("[Flow] Usando screenshot da area de resultado");
        return Buffer.from(screenshot);
      }
    }

    return null;
  } catch (e: any) {
    console.log("[Flow] Erro ao extrair imagem:", e.message);
    return null;
  }
}

/**
 * Wait for and extract a generated video from Google Flow.
 */
async function waitForGeneratedVideo(page: Page): Promise<Buffer | null> {
  try {
    await page.waitForTimeout(5000);

    // Wait longer for video generation
    try {
      await page.waitForFunction(
        `document.querySelectorAll('[role="progressbar"], .loading, [aria-busy="true"]').length === 0`,
        { timeout: FLOW_TIMEOUT }
      );
    } catch {
      console.log("[Flow] Timeout esperando video loading terminar");
    }

    await page.waitForTimeout(5000);

    // Look for video elements
    const videoSelectors = [
      "video source",
      "video",
      'video[src^="blob:"]',
      'video[src^="data:"]',
    ];

    for (const selector of videoSelectors) {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const tagName = await el.evaluate((e) => e.tagName.toLowerCase());
        let src: string | null = null;

        if (tagName === "source") {
          src = await el.getAttribute("src");
        } else if (tagName === "video") {
          src = await el.getAttribute("src");
          if (!src) {
            // Try to get from source child
            src = await el.evaluate((v: any) => {
              const source = v.querySelector("source");
              return source?.src || v.currentSrc || null;
            });
          }
        }

        if (src && src.startsWith("blob:")) {
          // Fetch blob URL from page context
          const base64 = await page.evaluate(async (blobUrl: string) => {
            try {
              const response = await fetch(blobUrl);
              const blob = await response.blob();
              const arrayBuffer = await blob.arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              let binary = "";
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              return btoa(binary);
            } catch {
              return "";
            }
          }, src);

          if (base64 && base64.length > 100) {
            console.log("[Flow] Video extraido de blob URL");
            return Buffer.from(base64, "base64");
          }
        }
      }
    }

    // Try download button
    const downloadButtons = await page.$$(
      'button:has-text("Download"), button:has-text("download"), [aria-label*="download" i]'
    );
    if (downloadButtons.length > 0) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
        downloadButtons[0].click(),
      ]);
      if (download) {
        const filePath = await download.path();
        if (filePath) {
          const buf = fs.readFileSync(filePath);
          console.log("[Flow] Video obtido via download");
          return buf;
        }
      }
    }

    return null;
  } catch (e: any) {
    console.log("[Flow] Erro ao extrair video:", e.message);
    return null;
  }
}

/**
 * Navigate to Flow, input prompt, and wait for generation.
 */
async function flowGenerate(
  prompt: string,
  type: "image" | "video"
): Promise<Buffer | null> {
  let page: Page | null = null;

  try {
    const ctx = await getContext();
    page = await ctx.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT);

    console.log(`[Flow] Navegando para ${FLOW_URL}...`);
    await page.goto(FLOW_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(3000);

    // Check login
    if (await checkLogin(page)) {
      console.log("[Flow] Login necessario, abortando");
      return null;
    }

    // Save cookies after successful page load
    await saveCookies();

    console.log(`[Flow] Pagina carregada: ${page.url()}`);

    // Find the prompt input - try multiple selectors
    const inputSelectors = [
      'textarea',
      'input[type="text"]',
      '[contenteditable="true"]',
      '[role="textbox"]',
      'input[placeholder]',
      'textarea[placeholder]',
    ];

    let inputEl = null;
    for (const sel of inputSelectors) {
      inputEl = await page.$(sel);
      if (inputEl) {
        console.log(`[Flow] Input encontrado: ${sel}`);
        break;
      }
    }

    if (!inputEl) {
      // Try clicking on the page to reveal input
      await page.click("body");
      await page.waitForTimeout(1000);
      for (const sel of inputSelectors) {
        inputEl = await page.$(sel);
        if (inputEl) break;
      }
    }

    if (!inputEl) {
      console.log("[Flow] Nao encontrou campo de input");
      // Take debug screenshot
      const debugPath = path.join(process.cwd(), "flow-debug.png");
      await page.screenshot({ path: debugPath, fullPage: true });
      console.log(`[Flow] Screenshot debug salvo em: ${debugPath}`);
      return null;
    }

    // Type the prompt
    await inputEl.click();
    await page.waitForTimeout(500);
    await inputEl.fill(prompt);
    await page.waitForTimeout(500);

    console.log("[Flow] Prompt inserido, enviando...");

    // Submit - try multiple approaches
    // 1. Press Enter
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);

    // 2. If there's a submit/generate button, click it
    const submitSelectors = [
      'button:has-text("Generate")',
      'button:has-text("Create")',
      'button:has-text("Submit")',
      'button:has-text("Go")',
      'button[type="submit"]',
      'button[aria-label*="send" i]',
      'button[aria-label*="generate" i]',
      'button[aria-label*="submit" i]',
    ];

    for (const sel of submitSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        const isVisible = await btn.isVisible().catch(() => false);
        if (isVisible) {
          console.log(`[Flow] Clicando botao: ${sel}`);
          await btn.click();
          break;
        }
      }
    }

    console.log(`[Flow] Aguardando geracao de ${type}...`);

    // Wait for and extract result
    if (type === "image") {
      return await waitForGeneratedImage(page);
    } else {
      return await waitForGeneratedVideo(page);
    }
  } catch (e: any) {
    console.log(`[Flow] Erro geral: ${e.message}`);
    return null;
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

// ========== Gemini API Fallbacks ==========

async function geminiGenerateImage(prompt: string): Promise<Buffer | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  try {
    console.log(`[Flow/Gemini-IMG] Fallback: ${prompt.substring(0, 50)}...`);
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
      const data = (await res.json()) as any;
      const parts = data.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find((p: any) => p.inlineData);
      if (imgPart?.inlineData?.data) {
        console.log("[Flow/Gemini-IMG] Fallback OK!");
        return Buffer.from(imgPart.inlineData.data, "base64");
      }
    }
  } catch (e: any) {
    console.log("[Flow/Gemini-IMG] Erro:", e.message);
  }
  return null;
}

async function geminiGenerateVideo(prompt: string): Promise<Buffer | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  try {
    console.log(`[Flow/Gemini-VID] Fallback: ${prompt.substring(0, 50)}...`);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            aspectRatio: "16:9",
            durationSeconds: 8,
            personGeneration: "allow_adult",
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.log("[Flow/Gemini-VID] Erro ao iniciar:", err);
      return null;
    }

    const data = (await res.json()) as any;
    const operationName = data.name;
    if (!operationName) return null;

    // Poll for completion (max 3 min)
    for (let i = 0; i < 36; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const check = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${key}`
      );
      const status = (await check.json()) as any;

      if (status.done) {
        const videoB64 =
          status.response?.generateVideoResponse?.generatedSamples?.[0]?.video
            ?.bytesBase64Encoded;
        if (videoB64) {
          console.log("[Flow/Gemini-VID] Fallback OK!");
          return Buffer.from(videoB64, "base64");
        }

        const videoUri =
          status.response?.generateVideoResponse?.generatedSamples?.[0]?.video
            ?.uri;
        if (videoUri) {
          const vidRes = await fetch(videoUri);
          if (vidRes.ok) {
            const buf = Buffer.from(await vidRes.arrayBuffer());
            if (buf.length > 1000) {
              console.log("[Flow/Gemini-VID] Fallback OK via URI!");
              return buf;
            }
          }
        }
        return null;
      }

      if (i % 6 === 0) console.log(`[Flow/Gemini-VID] Aguardando... ${i * 5}s`);
    }

    console.log("[Flow/Gemini-VID] Timeout");
    return null;
  } catch (e: any) {
    console.log("[Flow/Gemini-VID] Erro:", e.message);
    return null;
  }
}

// ========== Public API ==========

/**
 * Generate an image using Google Flow (labs.google/fx/tools/flow).
 * Falls back to Gemini API if Flow fails.
 */
export async function generateFlowImage(
  prompt: string
): Promise<Buffer | null> {
  console.log(`[Flow/IMG] Gerando imagem: ${prompt.substring(0, 60)}...`);

  // 1. Try Google Flow via Playwright
  try {
    const result = await flowGenerate(prompt, "image");
    if (result && result.length > 1000) {
      console.log("[Flow/IMG] Sucesso via Flow!");
      return result;
    }
  } catch (e: any) {
    console.log("[Flow/IMG] Flow falhou:", e.message);
  }

  // 2. Fallback to Gemini API
  console.log("[Flow/IMG] Tentando fallback Gemini...");
  const geminiResult = await geminiGenerateImage(prompt);
  if (geminiResult) return geminiResult;

  console.log("[Flow/IMG] Todos os metodos falharam");
  return null;
}

/**
 * Generate a video using Google Flow (labs.google/fx/tools/flow).
 * Falls back to Gemini Veo API if Flow fails.
 */
export async function generateFlowVideo(
  prompt: string
): Promise<Buffer | null> {
  console.log(`[Flow/VID] Gerando video: ${prompt.substring(0, 60)}...`);

  // 1. Try Google Flow via Playwright
  try {
    const result = await flowGenerate(prompt, "video");
    if (result && result.length > 1000) {
      console.log("[Flow/VID] Sucesso via Flow!");
      return result;
    }
  } catch (e: any) {
    console.log("[Flow/VID] Flow falhou:", e.message);
  }

  // 2. Fallback to Gemini Veo API
  console.log("[Flow/VID] Tentando fallback Gemini Veo...");
  const geminiResult = await geminiGenerateVideo(prompt);
  if (geminiResult) return geminiResult;

  console.log("[Flow/VID] Todos os metodos falharam");
  return null;
}
