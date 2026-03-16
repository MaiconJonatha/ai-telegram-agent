"use strict";
/**
 * Automação de postagens no Instagram via Puppeteer
 * Usa puppeteer-core para automatizar o Instagram Web.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postToInstagram = postToInstagram;
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const COOKIES_PATH = path.join(__dirname, "../../instagram_cookies.json");
let browserInstance = null;
async function getBrowser() {
    if (browserInstance && browserInstance.connected)
        return browserInstance;
    browserInstance = await puppeteer_core_1.default.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--window-size=1280,720",
            "--disable-blink-features=AutomationControlled",
        ],
    });
    return browserInstance;
}
async function loadCookies(page) {
    if (!fs.existsSync(COOKIES_PATH)) {
        console.log("[Instagram] Cookies não encontrados:", COOKIES_PATH);
        return;
    }
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf-8"));
    const mapped = cookies
        .filter((c) => c.domain && c.name && c.value)
        .map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || "/",
        expires: c.expires && c.expires > 0 ? Math.floor(c.expires) : undefined,
        httpOnly: c.httpOnly || false,
        secure: c.secure || false,
        sameSite: c.sameSite === "None" ? "None" :
            c.sameSite === "Strict" ? "Strict" : "Lax",
    }));
    await page.setCookie(...mapped);
}
async function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}
async function clickByText(page, texts, tag = "button") {
    const elements = await page.$$(tag);
    for (const el of elements) {
        const text = await page.evaluate((e) => (e.textContent || "").trim(), el);
        for (const target of texts) {
            if (text.toLowerCase().includes(target.toLowerCase())) {
                await el.click();
                return true;
            }
        }
    }
    return false;
}
async function clickByAriaLabel(page, labels) {
    for (const label of labels) {
        const el = await page.$(`[aria-label="${label}"]`);
        if (el) {
            await el.click();
            return true;
        }
    }
    return false;
}
/**
 * Posts media (image or video) to Instagram.
 * @param mediaBuffer - The image/video buffer
 * @param caption - The caption text
 * @param isVideo - Whether the media is a video
 * @returns true if posted successfully
 */
async function postToInstagram(mediaBuffer, caption, isVideo) {
    let page = null;
    try {
        console.log(`[Instagram] Iniciando postagem (${isVideo ? "vídeo" : "imagem"}, ${mediaBuffer.length} bytes)...`);
        // Save media to a temp file for upload
        const ext = isVideo ? "mp4" : "png";
        const tempFile = path.join(os.tmpdir(), `instagram_upload_${Date.now()}.${ext}`);
        fs.writeFileSync(tempFile, mediaBuffer);
        console.log(`[Instagram] Arquivo temporário: ${tempFile}`);
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        // Set user agent to look like a real browser
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        await loadCookies(page);
        // Navigate to Instagram
        console.log("[Instagram] Navegando para instagram.com...");
        await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
        await delay(3000);
        // Close any notification popups
        await closeInstagramPopups(page);
        await delay(1000);
        await page.screenshot({ path: path.join(__dirname, "../../debug_instagram_home.png") });
        // Click "New post" button (the + icon in the sidebar)
        console.log("[Instagram] Procurando botão de novo post...");
        let newPostClicked = false;
        // Try aria-label variants
        newPostClicked = await clickByAriaLabel(page, [
            "New post",
            "Nova publicação",
            "Novo post",
            "New Post",
            "Create",
            "Criar",
        ]);
        if (!newPostClicked) {
            // Try finding SVG create icon in the sidebar
            const svgButtons = await page.$$('a[href*="/create/"], div[role="button"]');
            for (const btn of svgButtons) {
                const info = await page.evaluate((el) => {
                    const rect = el.getBoundingClientRect();
                    const text = (el.textContent || "").trim().toLowerCase();
                    const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
                    const href = el.getAttribute("href") || "";
                    return { text, ariaLabel, href, visible: rect.width > 0, x: rect.x, y: rect.y };
                }, btn);
                if (info.href.includes("/create/") || info.text.includes("criar") || info.text.includes("create")) {
                    await btn.click();
                    newPostClicked = true;
                    console.log(`[Instagram] Botão criar encontrado via href/text: "${info.text}" href="${info.href}"`);
                    break;
                }
            }
        }
        if (!newPostClicked) {
            // Try the sidebar navigation links
            const links = await page.$$("a");
            for (const link of links) {
                const href = await page.evaluate((el) => el.getAttribute("href") || "", link);
                if (href === "/create/" || href.includes("create")) {
                    await link.click();
                    newPostClicked = true;
                    console.log("[Instagram] Botão criar encontrado via link /create/");
                    break;
                }
            }
        }
        if (!newPostClicked) {
            // Fallback: try clicking by known sidebar icon positions
            // The create button is usually a "+" icon in the left sidebar
            const allButtons = await page.$$('div[role="button"], button, span[role="link"]');
            for (const btn of allButtons) {
                const text = await page.evaluate((el) => {
                    const t = (el.textContent || "").trim();
                    return t;
                }, btn);
                if (text === "Criar" || text === "Create") {
                    await btn.click();
                    newPostClicked = true;
                    console.log("[Instagram] Botão 'Criar' encontrado por texto");
                    break;
                }
            }
        }
        if (!newPostClicked) {
            console.log("[Instagram] Não encontrou botão de novo post");
            await page.screenshot({ path: path.join(__dirname, "../../debug_instagram_nobutton.png") });
            await page.close();
            cleanupTempFile(tempFile);
            return false;
        }
        await delay(2000);
        await page.screenshot({ path: path.join(__dirname, "../../debug_instagram_create_dialog.png") });
        // Click "Post" in the Create submenu (Instagram now shows a dropdown)
        console.log("[Instagram] Procurando opção 'Post' no submenu...");
        let postMenuClicked = false;
        // Try clicking the "Post" menu item - it's a div/span with text "Post"
        const allElements = await page.$$('div, span, a, button');
        for (const el of allElements) {
            const info = await page.evaluate((e) => {
                const text = (e.textContent || "").trim();
                const rect = e.getBoundingClientRect();
                return { text, x: rect.x, y: rect.y, w: rect.width, h: rect.height, visible: rect.width > 0 };
            }, el);
            if (info.visible && info.text === "Post" && info.w < 200) {
                await el.click();
                postMenuClicked = true;
                console.log(`[Instagram] Clicou em 'Post' (${info.x}, ${info.y})`);
                break;
            }
        }
        if (!postMenuClicked) {
            // Fallback: click by coordinates based on the screenshot (Post is ~first item under Create)
            console.log("[Instagram] Tentando clicar 'Post' por coordenadas...");
            await page.mouse.click(80, 362);
            postMenuClicked = true;
        }
        await delay(3000);
        await page.screenshot({ path: path.join(__dirname, "../../debug_instagram_after_post_click.png") });
        // Upload the media file via hidden file input
        console.log("[Instagram] Fazendo upload do arquivo...");
        let uploaded = false;
        // First try: click "Select from computer" / "Selecionar do computador" button
        for (let attempt = 0; attempt < 3; attempt++) {
            const selectClicked = await clickByText(page, [
                "Select from computer",
                "Selecionar do computador",
                "Select from Computer",
                "Selecionar no computador",
                "Drag photos and videos here",
            ]) || await clickByText(page, [
                "Select from computer",
                "Selecionar do computador",
            ], "span");
            if (selectClicked) {
                console.log("[Instagram] Botão 'Selecionar do computador' clicado");
                await delay(1000);
                break;
            }
            await delay(2000);
        }
        // Now find the file input (hidden or visible)
        for (let attempt = 0; attempt < 10; attempt++) {
            // Look for all file inputs, including hidden ones
            const fileInputs = await page.$$('input[type="file"]');
            console.log(`[Instagram] Tentativa ${attempt + 1}: encontrados ${fileInputs.length} input(s) de arquivo`);
            for (const fileInput of fileInputs) {
                try {
                    await page.evaluate((el) => {
                        el.removeAttribute("accept");
                        el.style.display = "block";
                        el.style.visibility = "visible";
                    }, fileInput);
                    await delay(200);
                    await fileInput.uploadFile(tempFile);
                    uploaded = true;
                    console.log("[Instagram] Arquivo enviado via input file");
                    break;
                }
                catch (e) {
                    console.log(`[Instagram] Erro no upload: ${e.message}`);
                }
            }
            if (uploaded)
                break;
            await delay(1500);
        }
        if (!uploaded) {
            // Legacy fallback
            const selectClicked = await clickByText(page, [
                "Select from computer",
                "Selecionar do computador",
            ]);
            if (selectClicked) {
                await delay(1000);
                const fileInput = await page.$('input[type="file"]');
                if (fileInput) {
                    await page.evaluate((el) => {
                        el.removeAttribute("accept");
                    }, fileInput);
                    await delay(200);
                    await fileInput.uploadFile(tempFile);
                    uploaded = true;
                    console.log("[Instagram] Arquivo enviado após clicar 'Selecionar'");
                }
            }
        }
        if (!uploaded) {
            console.log("[Instagram] Não conseguiu fazer upload");
            await page.screenshot({ path: path.join(__dirname, "../../debug_instagram_noupload.png") });
            await page.close();
            cleanupTempFile(tempFile);
            return false;
        }
        // Wait for media to process
        console.log("[Instagram] Aguardando processamento da mídia...");
        await delay(3000);
        // Close "Video posts are now shared as reels" popup if present
        for (let attempt = 0; attempt < 5; attempt++) {
            const okClicked = await page.evaluate(`(() => {
        const btns = document.querySelectorAll("button");
        for (let i = 0; i < btns.length; i++) {
          if ((btns[i].textContent || "").trim() === "OK") {
            btns[i].click();
            return true;
          }
        }
        return false;
      })()`);
            if (okClicked) {
                console.log("[Instagram] Popup 'Reels' fechado");
                await delay(2000);
                break;
            }
            await delay(1000);
        }
        await page.screenshot({ path: path.join(__dirname, "../../debug_instagram_after_upload.png") });
        // Helper: click element by text using page.evaluate (more robust)
        async function clickTextElement(pg, texts) {
            return pg.evaluate(`((searchTexts) => {
        const all = document.querySelectorAll("div, span, button, a");
        for (let i = 0; i < all.length; i++) {
          const el = all[i];
          const text = (el.textContent || "").trim();
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.width < 200 && rect.height > 0 && rect.height < 60) {
            for (const target of searchTexts) {
              if (text === target) {
                el.click();
                return true;
              }
            }
          }
        }
        return false;
      })(${JSON.stringify(texts)})`);
        }
        // Helper: click button by aria-label
        async function clickAriaButton(pg, labels) {
            for (const label of labels) {
                const btn = await pg.$(`button[aria-label="${label}"]`);
                if (btn) {
                    const visible = await pg.evaluate((el) => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    }, btn);
                    if (visible) {
                        await btn.click();
                        return true;
                    }
                }
            }
            return false;
        }
        // Helper: find the coordinates of a dialog header button and click with page.mouse
        // This works with React's synthetic event system
        async function clickDialogHeaderButton(pg, texts) {
            // Find the coordinates of the target element
            const coords = await pg.evaluate(`((searchTexts) => {
        // Find all elements with matching text
        const candidates = [];
        const all = document.querySelectorAll("div, span, button, a");
        for (let i = 0; i < all.length; i++) {
          const el = all[i];
          const t = (el.textContent || "").trim();
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;

          let matches = false;
          for (const target of searchTexts) {
            if (t === target) { matches = true; break; }
          }
          if (!matches) continue;

          candidates.push({
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            w: rect.width,
            h: rect.height,
            tag: el.tagName,
          });
        }

        // Filter: prefer candidates near the center-top of the page (dialog header area)
        // Dialog is centered, so x should be between 300-1000, y between 60-130
        // Exclude very large elements (they're containers, not buttons)
        const filtered = candidates.filter(c =>
          c.w < 200 && c.h < 80 && c.x > 300 && c.x < 1110 && c.y > 20 && c.y < 150
        );

        // If multiple matches, prefer the one closest to the right side of the dialog
        // (Next/Share buttons are on the right side of the header)
        if (filtered.length > 0) {
          filtered.sort((a, b) => b.x - a.x); // rightmost first
          return { x: filtered[0].x, y: filtered[0].y };
        }

        return null;
      })(${JSON.stringify(texts)})`);
            if (coords) {
                console.log(`[Instagram] Clicando em (${Math.round(coords.x)}, ${Math.round(coords.y)})`);
                await pg.mouse.click(coords.x, coords.y);
                return true;
            }
            return false;
        }
        // Helper: close popups like "Video posts are now shared as reels"
        // The OK button is a large button (width > 200px) so clickTextElement won't work
        async function closePopupOK(pg) {
            return pg.evaluate(`(() => {
        const btns = document.querySelectorAll("button");
        for (let i = 0; i < btns.length; i++) {
          const t = (btns[i].textContent || "").trim();
          if (t === "OK") {
            btns[i].click();
            return true;
          }
        }
        return false;
      })()`);
        }
        // Click "Next" - step 1 (Crop → next step)
        console.log("[Instagram] Clicando Next/Avançar (passo 1 - Crop)...");
        for (let attempt = 0; attempt < 5; attempt++) {
            // First close any popup blocking the dialog
            const popupClosed = await closePopupOK(page);
            if (popupClosed) {
                console.log("[Instagram] Popup OK fechado");
                await delay(2000);
            }
            const clicked = await clickDialogHeaderButton(page, ["Next", "Avançar", "Próximo"]);
            if (clicked) {
                console.log("[Instagram] Next clicado (passo 1)");
                break;
            }
            await delay(1500);
        }
        await delay(4000);
        // Close popup that may appear after Next
        const popup1 = await closePopupOK(page);
        if (popup1) {
            console.log("[Instagram] Popup OK fechado após Next 1");
            await delay(2000);
        }
        await page.screenshot({ path: path.join(__dirname, "../../debug_instagram_after_next1.png") });
        // Click "Next" - step 2 if available
        console.log("[Instagram] Tentando Next/Avançar (passo 2)...");
        const next2 = await clickDialogHeaderButton(page, ["Next", "Avançar", "Próximo"]);
        if (next2) {
            console.log("[Instagram] Next clicado (passo 2)");
            await delay(4000);
            const popup2 = await closePopupOK(page);
            if (popup2) {
                console.log("[Instagram] Popup OK fechado após Next 2");
                await delay(2000);
            }
        }
        else {
            console.log("[Instagram] Sem segundo Next, continuando...");
        }
        await page.screenshot({ path: path.join(__dirname, "../../debug_instagram_after_next2.png") });
        // Wait for caption field to fully render and try to find it
        console.log("[Instagram] Procurando campo de legenda...");
        let captionAdded = false;
        const captionSelectors = [
            'div[aria-label*="Write a caption" i]',
            'div[aria-label*="Escreva uma legenda" i]',
            'div[aria-label*="caption" i]',
            'div[aria-label*="legenda" i]',
            'div[role="textbox"][contenteditable="true"]',
            'div[role="textbox"]',
            '[contenteditable="true"][spellcheck]',
            'p[contenteditable="true"]',
            '[contenteditable="true"]',
            "textarea",
        ];
        // Try multiple times with increasing wait
        for (let attempt = 0; attempt < 6 && !captionAdded; attempt++) {
            await delay(2000);
            // Debug: count available elements
            const counts = await page.evaluate(`(() => {
        return {
          ce: document.querySelectorAll('[contenteditable="true"]').length,
          tb: document.querySelectorAll('[role="textbox"]').length,
          ta: document.querySelectorAll('textarea').length,
        };
      })()`);
            console.log(`[Instagram] Tentativa ${attempt + 1}: ce=${counts.ce} tb=${counts.tb} ta=${counts.ta}`);
            if (counts.ce === 0 && counts.tb === 0 && counts.ta === 0) {
                if (attempt < 5)
                    continue; // Wait more
            }
            for (const sel of captionSelectors) {
                const fields = await page.$$(sel);
                for (const field of fields) {
                    const size = await page.evaluate((el) => {
                        const rect = el.getBoundingClientRect();
                        return { w: rect.width, h: rect.height };
                    }, field);
                    if (size.w < 50 || size.h < 10)
                        continue;
                    try {
                        await field.click();
                        await delay(500);
                        await page.keyboard.type(caption, { delay: 10 });
                        captionAdded = true;
                        console.log(`[Instagram] Legenda adicionada via ${sel} (${size.w}x${size.h})`);
                        break;
                    }
                    catch (e) {
                        console.log(`[Instagram] Erro via ${sel}: ${e.message}`);
                    }
                }
                if (captionAdded)
                    break;
            }
        }
        await page.screenshot({ path: path.join(__dirname, "../../debug_instagram_caption_step.png") });
        if (!captionAdded) {
            console.log("[Instagram] Não encontrou campo de legenda, continuando sem legenda...");
        }
        await delay(1000);
        await page.screenshot({ path: path.join(__dirname, "../../debug_instagram_before_share.png") });
        // Click "Share" / "Compartilhar" in the dialog header
        console.log("[Instagram] Clicando Share/Compartilhar...");
        let shared = false;
        for (let attempt = 0; attempt < 5; attempt++) {
            shared = await clickDialogHeaderButton(page, ["Share", "Compartilhar", "Publicar"]);
            if (shared) {
                console.log("[Instagram] Botão Share clicado");
                break;
            }
            await delay(1500);
        }
        if (!shared) {
            console.log("[Instagram] Não encontrou botão de compartilhar");
            await page.screenshot({ path: path.join(__dirname, "../../debug_instagram_noshare.png") });
            await page.close();
            cleanupTempFile(tempFile);
            return false;
        }
        // Wait for post to complete
        console.log("[Instagram] Aguardando publicação...");
        let postSuccess = false;
        for (let i = 0; i < 30; i++) {
            await delay(2000);
            // Check for success indicators
            const result = await page.evaluate(`(() => {
        const all = document.querySelectorAll("*");
        for (let i = 0; i < all.length; i++) {
          const t = (all[i].textContent || "").trim().toLowerCase();
          if (t.includes("your post has been shared") ||
              t.includes("sua publicação foi compartilhada") ||
              t.includes("post shared") ||
              t.includes("publicação compartilhada") ||
              t.includes("reel shared") ||
              t.includes("reel compartilhado")) {
            return "success";
          }
        }
        if (!window.location.href.includes("create")) {
          return "maybe_success";
        }
        return "waiting";
      })()`);
            if (result === "success") {
                postSuccess = true;
                console.log("[Instagram] Post publicado com sucesso!");
                break;
            }
            if (result === "maybe_success" && i > 5) {
                postSuccess = true;
                console.log("[Instagram] Parece que o post foi publicado (URL mudou)");
                break;
            }
            if (i % 5 === 0) {
                console.log(`[Instagram] Aguardando publicação... ${i * 2}s`);
                await page.screenshot({ path: path.join(__dirname, `../../debug_instagram_posting_${i}.png`) });
            }
        }
        await page.screenshot({ path: path.join(__dirname, "../../debug_instagram_final.png") });
        await page.close();
        cleanupTempFile(tempFile);
        if (postSuccess) {
            console.log("[Instagram] Postagem concluída com sucesso!");
            return true;
        }
        else {
            console.log("[Instagram] Timeout aguardando confirmação de postagem");
            return false;
        }
    }
    catch (e) {
        console.log("[Instagram] Erro:", e.message);
        if (page)
            await page.close().catch(() => { });
        return false;
    }
}
async function closeInstagramPopups(page) {
    // Close "Turn on notifications" popup
    await clickByText(page, ["Not Now", "Agora não", "Not now", "Agora Não"], "button");
    await delay(500);
    // Close cookie consent
    await clickByText(page, ["Allow all cookies", "Permitir todos os cookies", "Allow essential and optional cookies", "Aceitar"], "button");
    await delay(500);
}
function cleanupTempFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
    catch {
        // ignore cleanup errors
    }
}
process.on("SIGTERM", () => {
    if (browserInstance)
        browserInstance.close().catch(() => { });
});
process.on("exit", () => {
    if (browserInstance)
        browserInstance.close().catch(() => { });
});
//# sourceMappingURL=instagram.js.map