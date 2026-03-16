import { Bot, Context } from "grammy";
import { processMessage, activeRepos, getLastAgent, setSendMessageCallback } from "../agent/agent";
import { transcribeAudio, generateImage, generateVideo, searchImages } from "../agent/tools";
import { generateFlowImage, generateFlowVideo } from "../agent/flow";
import { postToInstagram } from "../agent/instagram";
import { addMedia, getLastVideos, mergeVideos } from "../agent/media";
import { listRepos, getRepoTree, readFile, executeCoderTask, isGitHubConfigured } from "../agent/coder";
import { askQwenCoder, CODE_PATTERNS } from "../agent/qwen";
import { logMedia, logAgent, clearHistory } from "../db/memory";
import { InputFile } from "grammy";
import { broadcastEvent } from "../sse";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USER_IDS || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN não definido!");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// ========== RATE LIMITING ==========
const generationTimestamps: Map<string, number[]> = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(userId: string): { allowed: boolean; minutesLeft: number } {
  const now = Date.now();
  const timestamps = generationTimestamps.get(userId) || [];
  // Remove timestamps older than 1 hour
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  generationTimestamps.set(userId, recent);

  if (recent.length >= RATE_LIMIT_MAX) {
    const oldest = recent[0];
    const msLeft = RATE_LIMIT_WINDOW_MS - (now - oldest);
    return { allowed: false, minutesLeft: Math.ceil(msLeft / 60000) };
  }
  return { allowed: true, minutesLeft: 0 };
}

function recordGeneration(userId: string): void {
  const timestamps = generationTimestamps.get(userId) || [];
  timestamps.push(Date.now());
  generationTimestamps.set(userId, timestamps);
}

// Middleware: verificar usuários permitidos (se configurado)
bot.use(async (ctx: Context, next) => {
  if (ALLOWED_USERS.length > 0) {
    const userId = ctx.from?.id?.toString();
    if (!userId || !ALLOWED_USERS.includes(userId)) {
      await ctx.reply("⛔ Acesso não autorizado.");
      return;
    }
  }
  await next();
});

// Usar repo ativo compartilhado com agent.ts
const activeRepo = activeRepos;

// /start command - Welcome message
bot.command("start", async (ctx) => {
  await ctx.reply("🦀 Olá! Eu sou o Opencraws, seu assistente de IA!\n\nComandos:\n🎨 /flowimg [prompt] - Gerar imagem\n🎬 /flowvid [prompt] - Gerar vídeo\n💬 Fale normalmente - IA responde\n📱 \"posta no instagram\" - Postar mídia\nℹ️ /help - Todos os comandos");
});

// Handler para todas mensagens de texto
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const userName = ctx.from.first_name || "Usuário";
  const text = ctx.message.text;

  console.log(`[${new Date().toISOString()}] ${userName} (${userId}): ${text}`);

  // Broadcast message event to dashboard
  broadcastEvent({ type: 'message', data: { user: userName, userId, text, timestamp: new Date().toISOString() } });

  try {
    // ========== /help ==========
    if (text === "/help") {
      const helpMessage =
        `🤖 *Comandos do Opencraws:*\n\n` +
        `🎨 /flowimg [prompt] - Gerar imagem via Google Flow\n` +
        `🎬 /flowvid [prompt] - Gerar vídeo via Google Flow\n` +
        `🖼️ /img [prompt] - Gerar imagem (provedores alternativos)\n` +
        `🎥 /video [prompt] - Gerar vídeo\n` +
        `🧠 /qwen [pergunta] - Qwen Coder (IA programadora)\n` +
        `💻 /code [tarefa] - Programar (Qwen Coder ou GitHub)\n` +
        `💬 Fale normalmente - IA responde naturalmente\n` +
        `📱 "posta no instagram" - Posta mídia no Instagram\n` +
        `🔗 "junta os vídeos" - Merge vídeos com FFmpeg\n` +
        `❌ /clear - Limpar histórico\n` +
        `ℹ️ /help - Esta mensagem`;
      await ctx.reply(helpMessage, { parse_mode: "Markdown" }).catch(() => ctx.reply(helpMessage));
      return;
    }

    // ========== /clear ==========
    if (text === "/clear") {
      try {
        clearHistory(userId);
        await ctx.reply("🧹 Histórico limpo! Podemos começar de novo.");
      } catch (e: any) {
        console.error(`[${new Date().toISOString()}] [ERRO DB] clearHistory: ${e.message}`);
        await ctx.reply("❌ Erro ao limpar histórico. Tente novamente.");
      }
      return;
    }

    // ========== GOOGLE FLOW - IMAGEM ==========
    const flowImgMatch = text.match(/^\/flowimg\s+(.+)/i);
    if (flowImgMatch) {
      const rateCheck = checkRateLimit(userId);
      if (!rateCheck.allowed) {
        await ctx.reply(`⏳ Limite de gerações atingido. Tente novamente em ${rateCheck.minutesLeft} minutos.`);
        return;
      }
      const prompt = flowImgMatch[1];
      await ctx.reply("🎨 Gerando imagem via Google Flow... (pode levar ~30s)");
      await ctx.replyWithChatAction("upload_photo");
      logAgent(userId, "flow", "generateFlowImage", "started");
      const imgBuffer = await generateFlowImage(prompt);
      if (imgBuffer) {
        recordGeneration(userId);
        addMedia(userId, imgBuffer, "image", prompt);
        logMedia(userId, "image", prompt, "google-flow", imgBuffer.length);
        logAgent(userId, "flow", "generateFlowImage", "success");
        broadcastEvent({ type: 'media', data: { mediaType: 'image', prompt, provider: 'google-flow', user: userName, timestamp: new Date().toISOString() } });
        await ctx.replyWithPhoto(new InputFile(imgBuffer, "flow-image.png"), {
          caption: `🎨 Google Flow\n\n${prompt}`,
        });
      } else {
        logAgent(userId, "flow", "generateFlowImage", "failed");
        await ctx.reply("❌ Não consegui gerar a imagem via Flow. Tente /img para usar outros provedores.");
      }
      return;
    }

    // ========== GOOGLE FLOW - VIDEO ==========
    const flowVidMatch = text.match(/^\/flowvid\s+(.+)/i);
    if (flowVidMatch) {
      const rateCheck = checkRateLimit(userId);
      if (!rateCheck.allowed) {
        await ctx.reply(`⏳ Limite de gerações atingido. Tente novamente em ${rateCheck.minutesLeft} minutos.`);
        return;
      }
      const prompt = flowVidMatch[1];
      await ctx.reply("🎬 Gerando vídeo via Google Flow... (pode levar ~1-3 min)");
      await ctx.replyWithChatAction("upload_video");
      logAgent(userId, "flow", "generateFlowVideo", "started");
      const vidBuffer = await generateFlowVideo(prompt);
      if (vidBuffer) {
        recordGeneration(userId);
        addMedia(userId, vidBuffer, "video", prompt);
        logMedia(userId, "video", prompt, "google-flow", vidBuffer.length);
        logAgent(userId, "flow", "generateFlowVideo", "success");
        broadcastEvent({ type: 'media', data: { mediaType: 'video', prompt, provider: 'google-flow', user: userName, timestamp: new Date().toISOString() } });
        await ctx.replyWithVideo(new InputFile(vidBuffer, "flow-video.mp4"), {
          caption: `🎬 Google Flow\n\n${prompt}`,
        });
      } else {
        logAgent(userId, "flow", "generateFlowVideo", "failed");
        await ctx.reply("❌ Não consegui gerar o vídeo via Flow. Tente /video para usar Gemini Veo direto.");
      }
      return;
    }

    // ========== POSTAR NO SUPERFLOW TV ==========
    const flowMatch = text.match(/^\/flow\s+(.+)/i) || text.match(/^\/postar\s+(.+)/i);
    if (flowMatch) {
      const prompt = flowMatch[1];
      await ctx.reply("🎬 Gerando conteúdo pro SuperFlow TV...");
      await ctx.replyWithChatAction("upload_photo");

      // Gerar imagem
      const imgBuffer = await generateImage(prompt);
      if (!imgBuffer) {
        await ctx.reply("❌ Não consegui gerar a imagem.");
        return;
      }

      // Upload pro GitHub (repo tiktok)
      const { createOrUpdateFile } = await import("../agent/coder");
      const fileName = `content/img-${Date.now()}.png`;
      const b64 = imgBuffer.toString("base64");
      const uploadResult = await createOrUpdateFile(
        "MaiconJonatha/tiktok",
        fileName,
        imgBuffer.toString("binary"),
        `Novo conteúdo: ${prompt.substring(0, 50)}`
      );

      // Enviar imagem no Telegram
      await ctx.replyWithPhoto(new InputFile(imgBuffer, "superflow.png"), {
        caption: `🎬 **SuperFlow TV**\n\n${prompt}\n\n🌐 https://maiconjonatha.github.io/tiktok/`,
        parse_mode: "Markdown"
      });

      return;
    }

    // ========== BUSCAR IMAGENS NO GOOGLE ==========
    const searchMatch = text.match(/^\/buscar\s+(.+)/i) || text.match(/^\/google\s+(.+)/i);
    if (searchMatch) {
      await ctx.reply("🔍 Buscando imagens...");
      await ctx.replyWithChatAction("upload_photo");
      const urls = await searchImages(searchMatch[1], 3);
      if (urls.length > 0) {
        for (const url of urls) {
          try {
            await ctx.replyWithPhoto(url);
          } catch {
            await ctx.reply(`🖼️ ${url}`);
          }
        }
      } else {
        await ctx.reply("Nenhuma imagem encontrada. Tente outro termo.");
      }
      return;
    }

    // ========== COMANDOS DE IMAGEM ==========
    const imgMatch = text.match(/^\/imagem\s+(.+)/i) || text.match(/^\/img\s+(.+)/i);
    if (imgMatch) {
      const rateCheck = checkRateLimit(userId);
      if (!rateCheck.allowed) {
        await ctx.reply(`⏳ Limite de gerações atingido. Tente novamente em ${rateCheck.minutesLeft} minutos.`);
        return;
      }
      await ctx.reply("🎨 Gerando imagem... (pode levar ~30s)");
      await ctx.replyWithChatAction("upload_photo");
      logAgent(userId, "image-gen", "generateImage", "started");
      const imgBuffer = await generateImage(imgMatch[1]);
      if (imgBuffer) {
        recordGeneration(userId);
        addMedia(userId, imgBuffer, "image", imgMatch[1]);
        logMedia(userId, "image", imgMatch[1], "alternative", imgBuffer.length);
        logAgent(userId, "image-gen", "generateImage", "success");
        broadcastEvent({ type: 'media', data: { mediaType: 'image', prompt: imgMatch[1], provider: 'alternative', user: userName, timestamp: new Date().toISOString() } });
        await ctx.replyWithPhoto(new InputFile(imgBuffer, "image.png"), { caption: imgMatch[1] });
      } else {
        logAgent(userId, "image-gen", "generateImage", "failed");
        await ctx.reply("Não consegui gerar a imagem. Tente outro prompt.");
      }
      return;
    }

    // ========== COMANDO DE VÍDEO ==========
    const vidMatch = text.match(/^\/video\s+(.+)/i) || text.match(/^\/vídeo\s+(.+)/i);
    if (vidMatch) {
      const rateCheck = checkRateLimit(userId);
      if (!rateCheck.allowed) {
        await ctx.reply(`⏳ Limite de gerações atingido. Tente novamente em ${rateCheck.minutesLeft} minutos.`);
        return;
      }
      await ctx.reply("🎬 Gerando vídeo com Gemini Veo... (pode levar ~1-2 min)");
      await ctx.replyWithChatAction("upload_video");
      logAgent(userId, "video-gen", "generateVideo", "started");
      const vidBuffer = await generateVideo(vidMatch[1]);
      if (vidBuffer) {
        recordGeneration(userId);
        addMedia(userId, vidBuffer, "video", vidMatch[1]);
        logMedia(userId, "video", vidMatch[1], "gemini-veo", vidBuffer.length);
        logAgent(userId, "video-gen", "generateVideo", "success");
        broadcastEvent({ type: 'media', data: { mediaType: 'video', prompt: vidMatch[1], provider: 'gemini-veo', user: userName, timestamp: new Date().toISOString() } });
        await ctx.replyWithVideo(new InputFile(vidBuffer, "video.mp4"), { caption: vidMatch[1] });
      } else {
        logAgent(userId, "video-gen", "generateVideo", "failed");
        await ctx.reply("❌ Não consegui gerar o vídeo. Verifique se a GEMINI_API_KEY está configurada e tente outro prompt.");
      }
      return;
    }

    // ========== COMANDOS DE PROGRAMAÇÃO ==========

    // /repos - Listar repositórios
    if (text === "/repos") {
      if (!isGitHubConfigured()) {
        await ctx.reply("❌ GitHub não configurado. Adicione GITHUB_TOKEN nas variáveis de ambiente.");
        return;
      }
      await ctx.replyWithChatAction("typing");
      const repos = await listRepos();
      if (repos.length === 0) {
        await ctx.reply("Nenhum repositório encontrado.");
        return;
      }
      const current = activeRepo[userId];
      let msg = "📦 **Seus Repositórios:**\n\n";
      repos.forEach((r, i) => {
        msg += `${i + 1}. ${r === current ? "👉 " : ""}${r}\n`;
      });
      msg += `\n📌 Use \`/repo nome/repo\` pra selecionar um repo ativo`;
      await ctx.reply(msg, { parse_mode: "Markdown" }).catch(() => ctx.reply(msg));
      return;
    }

    // /repo [nome] - Selecionar repo ativo
    const repoMatch = text.match(/^\/repo\s+(.+)/i);
    if (repoMatch) {
      activeRepo[userId] = repoMatch[1].trim();
      await ctx.reply(`📌 Repo ativo: **${activeRepo[userId]}**\n\nAgora use:\n• \`/arquivos\` - ver arquivos\n• \`/ler caminho/arquivo\` - ler arquivo\n• \`/code tarefa\` - programar`, { parse_mode: "Markdown" }).catch(() =>
        ctx.reply(`📌 Repo ativo: ${activeRepo[userId]}`)
      );
      return;
    }

    // /arquivos [path] - Listar arquivos do repo
    const filesMatch = text.match(/^\/arquivos\s*(.*)/i);
    if (filesMatch !== null && text.startsWith("/arquivos")) {
      if (!activeRepo[userId]) {
        await ctx.reply("📌 Selecione um repo primeiro com `/repo nome/repo`", { parse_mode: "Markdown" });
        return;
      }
      await ctx.replyWithChatAction("typing");
      const path = filesMatch[1]?.trim() || "";
      const files = await getRepoTree(activeRepo[userId], path);
      if (files.length === 0) {
        await ctx.reply("Nenhum arquivo encontrado.");
        return;
      }
      await ctx.reply(`📁 **${activeRepo[userId]}${path ? "/" + path : ""}:**\n\n${files.join("\n")}`, { parse_mode: "Markdown" }).catch(() =>
        ctx.reply(files.join("\n"))
      );
      return;
    }

    // /ler [path] - Ler arquivo
    const readMatch = text.match(/^\/ler\s+(.+)/i);
    if (readMatch) {
      if (!activeRepo[userId]) {
        await ctx.reply("📌 Selecione um repo primeiro com `/repo nome/repo`", { parse_mode: "Markdown" });
        return;
      }
      await ctx.replyWithChatAction("typing");
      const content = await readFile(activeRepo[userId], readMatch[1].trim());
      const preview = content.length > 3500 ? content.substring(0, 3500) + "\n\n... (truncado)" : content;
      await ctx.reply(`📄 **${readMatch[1].trim()}:**\n\n\`\`\`\n${preview}\n\`\`\``, { parse_mode: "Markdown" }).catch(() =>
        ctx.reply(preview)
      );
      return;
    }

    // /qwen [pergunta] - Qwen Coder (assistente de programação direto)
    const qwenMatch = text.match(/^\/qwen\s+(.+)/si);
    if (qwenMatch) {
      const prompt = qwenMatch[1].trim();
      await ctx.reply("🧠 Qwen Coder processando...");
      await ctx.replyWithChatAction("typing");

      try {
        const response = await askQwenCoder(prompt);
        broadcastEvent({ type: 'agent', data: { agent: 'qwen-coder', action: 'askQwenCoder', user: userName, timestamp: new Date().toISOString() } });
        // Split long messages (Telegram limit 4096 chars)
        if (response.length > 4000) {
          const parts = response.match(/.{1,4000}/gs) || [response];
          for (const part of parts) {
            await ctx.reply(part, { parse_mode: "Markdown" }).catch(() => ctx.reply(part));
          }
        } else {
          await ctx.reply(response, { parse_mode: "Markdown" }).catch(() => ctx.reply(response));
        }
      } catch (e) {
        await ctx.reply("Erro no Qwen Coder. Tente novamente.");
      }
      return;
    }

    // /code [tarefa] - Executar tarefa de programação (GitHub) ou Qwen Coder (sem repo)
    const codeMatch = text.match(/^\/code\s+(.+)/si);
    if (codeMatch) {
      // If no GitHub or no repo, use Qwen Coder directly
      if (!isGitHubConfigured() || !activeRepo[userId]) {
        const prompt = codeMatch[1].trim();
        await ctx.reply("🧠 Qwen Coder processando...");
        await ctx.replyWithChatAction("typing");
        try {
          const response = await askQwenCoder(prompt);
          broadcastEvent({ type: 'agent', data: { agent: 'qwen-coder', action: 'askQwenCoder', user: userName, timestamp: new Date().toISOString() } });
          if (response.length > 4000) {
            const parts = response.match(/.{1,4000}/gs) || [response];
            for (const part of parts) {
              await ctx.reply(part, { parse_mode: "Markdown" }).catch(() => ctx.reply(part));
            }
          } else {
            await ctx.reply(response, { parse_mode: "Markdown" }).catch(() => ctx.reply(response));
          }
        } catch (e) {
          await ctx.reply("Erro no Qwen Coder. Tente novamente.");
        }
        return;
      }
      await ctx.reply(`🤖 Trabalhando na tarefa...\n📦 Repo: ${activeRepo[userId]}\n\nIsso pode levar alguns segundos.`);
      await ctx.replyWithChatAction("typing");

      broadcastEvent({ type: 'agent', data: { agent: 'coder', action: 'executeTask', repo: activeRepo[userId], user: userName, timestamp: new Date().toISOString() } });
      const result = await executeCoderTask(codeMatch[1].trim(), activeRepo[userId]);

      // Dividir resposta longa
      if (result.length > 4000) {
        const parts = result.match(/.{1,4000}/gs) || [result];
        for (const part of parts) {
          await ctx.reply(part, { parse_mode: "Markdown" }).catch(() => ctx.reply(part));
        }
      } else {
        await ctx.reply(result, { parse_mode: "Markdown" }).catch(() => ctx.reply(result));
      }
      return;
    }

    // ========== JUNTAR / MERGE VÍDEOS ==========
    const mergeMatch = text.match(/\b(junta|juntar|merge|combina|combinar|une|unir)\b.*\b(v[ií]deos?|videos?|os\s*2|os\s*dois)\b/i);
    if (mergeMatch) {
      const wantsInstagram = /\b(e\s+)?(posta|publica|postar|publicar)\b.*\b(no\s+)?(instagram|insta)\b/i.test(text);
      // Detect count: default 2
      const countMatch = text.match(/\b(\d+)\b/);
      const count = countMatch ? parseInt(countMatch[1], 10) : 2;

      const lastVideos = getLastVideos(userId, count);
      if (lastVideos.length < 2) {
        await ctx.reply("Nenhum vídeo gerado recentemente. Gere pelo menos 2 vídeos antes de juntar.");
        return;
      }

      await ctx.reply(`🎬 Juntando ${lastVideos.length} vídeos...`);
      await ctx.replyWithChatAction("upload_video");

      try {
        const mergedBuffer = await mergeVideos(lastVideos);

        if (wantsInstagram) {
          await ctx.reply("📤 Vídeos juntados! Postando no Instagram...");
          const posted = await postToInstagram(mergedBuffer, "Vídeo combinado", true);
          if (posted) {
            await ctx.replyWithVideo(new InputFile(mergedBuffer, "merged-video.mp4"), {
              caption: "✅ Vídeo combinado postado no Instagram!",
            });
          } else {
            await ctx.replyWithVideo(new InputFile(mergedBuffer, "merged-video.mp4"), {
              caption: "⚠️ Vídeo combinado gerado, mas houve um problema ao postar no Instagram.",
            });
          }
        } else {
          await ctx.replyWithVideo(new InputFile(mergedBuffer, "merged-video.mp4"), {
            caption: `🎬 ${lastVideos.length} vídeos combinados!`,
          });
        }
      } catch (e: any) {
        console.error("[Merge] Erro:", e.message);
        await ctx.reply("❌ Erro ao juntar os vídeos. Verifique se o ffmpeg está instalado.");
      }
      return;
    }

    // ========== POSTAR NO INSTAGRAM ==========
    const instagramMatch = text.match(/\b(posta|postar|publica|publicar|posta(r)?)\b.*\b(no |no\s)?(instagram|insta)\b/i) ||
                           text.match(/\b(instagram|insta)\b.*\b(posta|postar|publica|publicar)\b/i);
    if (instagramMatch) {
      // Extract the prompt - remove the instagram-related words
      const prompt = text
        .replace(/\b(posta|postar|publica|publicar|poste|publique)\b/gi, "")
        .replace(/\b(no |na |pro |pra |para o |para a )?\b(instagram|insta)\b/gi, "")
        .replace(/\b(uma |um |a |o |esse |esta |este )?\b(imagem|foto|image|video|vídeo|filme)\b/gi, "")
        .replace(/\b(de |do |da |com |sobre |essa |esse )\b/gi, "")
        .trim() || text;

      // Detect if user wants video
      const wantsVideo = /\b(video|vídeo|filme|animação|animacao|clip)\b/i.test(text);

      const rateCheck = checkRateLimit(userId);
      if (!rateCheck.allowed) {
        await ctx.reply(`⏳ Limite de gerações atingido. Tente novamente em ${rateCheck.minutesLeft} minutos.`);
        return;
      }

      if (wantsVideo) {
        await ctx.reply("🎬 Gerando vídeo via Google Flow e postando no Instagram... (pode levar ~2-4 min)");
        await ctx.replyWithChatAction("upload_video");
        logAgent(userId, "instagram", "generateFlowVideo+post", "started");
        const vidBuffer = await generateFlowVideo(prompt);
        if (!vidBuffer) {
          logAgent(userId, "instagram", "generateFlowVideo+post", "failed");
          await ctx.reply("❌ Não consegui gerar o vídeo via Flow.");
          return;
        }
        recordGeneration(userId);
        addMedia(userId, vidBuffer, "video", prompt);
        logMedia(userId, "video", prompt, "google-flow+instagram", vidBuffer.length);
        await ctx.reply("📤 Vídeo gerado! Postando no Instagram...");
        const posted = await postToInstagram(vidBuffer, prompt, true);
        logAgent(userId, "instagram", "postToInstagram-video", posted ? "success" : "failed");
        broadcastEvent({ type: 'instagram', data: { status: posted ? 'success' : 'failed', mediaType: 'video', prompt, user: userName, timestamp: new Date().toISOString() } });
        if (posted) {
          await ctx.replyWithVideo(new InputFile(vidBuffer, "instagram-video.mp4"), {
            caption: `✅ Vídeo postado no Instagram!\n\n${prompt}`,
          });
        } else {
          await ctx.replyWithVideo(new InputFile(vidBuffer, "instagram-video.mp4"), {
            caption: `⚠️ Vídeo gerado, mas houve um problema ao postar no Instagram.\n\n${prompt}`,
          });
        }
      } else {
        await ctx.reply("🎨 Gerando imagem via Google Flow e postando no Instagram... (pode levar ~1-2 min)");
        await ctx.replyWithChatAction("upload_photo");
        logAgent(userId, "instagram", "generateFlowImage+post", "started");
        const imgBuffer = await generateFlowImage(prompt);
        if (!imgBuffer) {
          logAgent(userId, "instagram", "generateFlowImage+post", "failed");
          await ctx.reply("❌ Não consegui gerar a imagem via Flow.");
          return;
        }
        recordGeneration(userId);
        addMedia(userId, imgBuffer, "image", prompt);
        logMedia(userId, "image", prompt, "google-flow+instagram", imgBuffer.length);
        await ctx.reply("📤 Imagem gerada! Postando no Instagram...");
        const posted = await postToInstagram(imgBuffer, prompt, false);
        logAgent(userId, "instagram", "postToInstagram-image", posted ? "success" : "failed");
        broadcastEvent({ type: 'instagram', data: { status: posted ? 'success' : 'failed', mediaType: 'image', prompt, user: userName, timestamp: new Date().toISOString() } });
        if (posted) {
          await ctx.replyWithPhoto(new InputFile(imgBuffer, "instagram-image.png"), {
            caption: `✅ Imagem postada no Instagram!\n\n${prompt}`,
          });
        } else {
          await ctx.replyWithPhoto(new InputFile(imgBuffer, "instagram-image.png"), {
            caption: `⚠️ Imagem gerada, mas houve um problema ao postar no Instagram.\n\n${prompt}`,
          });
        }
      }
      return;
    }

    // ========== DETECÇÃO NATURAL DE IMAGEM/VÍDEO ==========
    const lowerText = text.toLowerCase();
    const imageKeywords = /\b(gera|cria|faz|faça|faca|gere|crie|desenh|pint|imagina|mostr).*\b(imagem|foto|picture|image|desenho|ilustra|arte|retrato|pintura)\b|\b(imagem|foto|image|desenho)\b.*\b(de |do |da |dos |das |um |uma )\b/i;
    const videoKeywords = /\b(gera|cria|faz|faça|faca|gere|crie|mostr).*\b(video|vídeo|filme|animação|animacao|clip)\b|\b(video|vídeo|filme)\b.*\b(de |do |da |um |uma )\b/i;

    if (videoKeywords.test(text)) {
      const rateCheck = checkRateLimit(userId);
      if (!rateCheck.allowed) {
        await ctx.reply(`⏳ Limite de gerações atingido. Tente novamente em ${rateCheck.minutesLeft} minutos.`);
        return;
      }
      const prompt = text.replace(/^(gera|cria|faz|faça|faca|gere|crie|mostra?|me\s)?\s*(um |uma |o |a )?\s*(video|vídeo|filme|animação|animacao|clip)\s*(de |do |da |dos |das |com |sobre )?\s*/i, "").trim() || text;
      await ctx.reply("🎬 Gerando vídeo via Google Flow... (pode levar ~1-3 min)");
      await ctx.replyWithChatAction("upload_video");
      logAgent(userId, "flow", "generateFlowVideo-natural", "started");
      const vidBuffer = await generateFlowVideo(prompt);
      if (vidBuffer) {
        recordGeneration(userId);
        addMedia(userId, vidBuffer, "video", prompt);
        logMedia(userId, "video", prompt, "google-flow", vidBuffer.length);
        logAgent(userId, "flow", "generateFlowVideo-natural", "success");
        broadcastEvent({ type: 'media', data: { mediaType: 'video', prompt, provider: 'google-flow', user: userName, timestamp: new Date().toISOString() } });
        await ctx.replyWithVideo(new InputFile(vidBuffer, "flow-video.mp4"), {
          caption: `🎬 Google Flow\n\n${prompt}`,
        });
      } else {
        logAgent(userId, "flow", "generateFlowVideo-natural", "failed");
        await ctx.reply("❌ Não consegui gerar o vídeo. Pode ser falta de créditos no Flow.");
      }
      return;
    }

    if (imageKeywords.test(text)) {
      const rateCheck = checkRateLimit(userId);
      if (!rateCheck.allowed) {
        await ctx.reply(`⏳ Limite de gerações atingido. Tente novamente em ${rateCheck.minutesLeft} minutos.`);
        return;
      }
      const prompt = text.replace(/^(gera|cria|faz|faça|faca|gere|crie|desenha?|pinta?|mostra?|me\s)?\s*(um |uma |o |a )?\s*(imagem|foto|picture|image|desenho|ilustração|ilustracao|arte|retrato|pintura)\s*(de |do |da |dos |das |com |sobre )?\s*/i, "").trim() || text;
      await ctx.reply("🎨 Gerando imagem via Google Flow... (pode levar ~30s)");
      await ctx.replyWithChatAction("upload_photo");
      logAgent(userId, "flow", "generateFlowImage-natural", "started");
      const imgBuffer = await generateFlowImage(prompt);
      if (imgBuffer) {
        recordGeneration(userId);
        addMedia(userId, imgBuffer, "image", prompt);
        logMedia(userId, "image", prompt, "google-flow", imgBuffer.length);
        logAgent(userId, "flow", "generateFlowImage-natural", "success");
        broadcastEvent({ type: 'media', data: { mediaType: 'image', prompt, provider: 'google-flow', user: userName, timestamp: new Date().toISOString() } });
        await ctx.replyWithPhoto(new InputFile(imgBuffer, "flow-image.png"), {
          caption: `🎨 ${prompt}`,
        });
      } else {
        logAgent(userId, "flow", "generateFlowImage-natural", "failed");
        await ctx.reply("❌ Não consegui gerar a imagem.");
      }
      return;
    }

    // ========== DETECCAO NATURAL DE CODIGO (Qwen Coder) ==========
    if (CODE_PATTERNS.test(text)) {
      await ctx.reply("🧠 Qwen Coder processando...");
      await ctx.replyWithChatAction("typing");
      try {
        const response = await askQwenCoder(text);
        broadcastEvent({ type: 'agent', data: { agent: 'qwen-coder', action: 'natural-detect', user: userName, timestamp: new Date().toISOString() } });
        if (response.length > 4000) {
          const parts = response.match(/.{1,4000}/gs) || [response];
          for (const part of parts) {
            await ctx.reply(part, { parse_mode: "Markdown" }).catch(() => ctx.reply(part));
          }
        } else {
          await ctx.reply(response, { parse_mode: "Markdown" }).catch(() => ctx.reply(response));
        }
      } catch (e) {
        await ctx.reply("Erro no Qwen Coder. Tente novamente.");
      }
      return;
    }

    // ========== CONVERSA NORMAL ==========
    await ctx.replyWithChatAction("typing");

    const response = await processMessage(userId, userName, text);

    if (response.length > 4000) {
      const parts = response.match(/.{1,4000}/gs) || [response];
      for (const part of parts) {
        await ctx.reply(part, { parse_mode: "Markdown" }).catch(() =>
          ctx.reply(part)
        );
      }
    } else {
      await ctx.reply(response, { parse_mode: "Markdown" }).catch(() =>
        ctx.reply(response)
      );
    }
  } catch (error: any) {
    console.error(`[ERRO] ${error.message}`);
    await ctx.reply("❌ Ocorreu um erro. Tente novamente.");
  }
});

// Handler para fotos
bot.on("message:photo", async (ctx) => {
  await ctx.reply("📸 Recebi sua foto! Por enquanto só processo texto, mas em breve terei visão!");
});

// Handler para voice
bot.on("message:voice", async (ctx) => {
  const userId = ctx.from.id.toString();
  const userName = ctx.from.first_name || "Usuário";

  try {
    await ctx.replyWithChatAction("typing");

    const file = await ctx.getFile();
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const res = await fetch(url);
    const buffer = Buffer.from(await res.arrayBuffer());

    console.log(`[${new Date().toISOString()}] ${userName} (${userId}): [AUDIO ${buffer.length} bytes]`);

    const text = await transcribeAudio(buffer);
    if (!text) {
      await ctx.reply("Não consegui entender o áudio. Tente novamente.");
      return;
    }

    console.log(`[TRANSCRICAO] ${text}`);
    await ctx.reply(`🎤 *Transcrição:* ${text}`, { parse_mode: "Markdown" }).catch(() => {});

    await ctx.replyWithChatAction("typing");
    const response = await processMessage(userId, userName, text);

    if (response.length > 4000) {
      const parts = response.match(/.{1,4000}/gs) || [response];
      for (const part of parts) {
        await ctx.reply(part, { parse_mode: "Markdown" }).catch(() => ctx.reply(part));
      }
    } else {
      await ctx.reply(response, { parse_mode: "Markdown" }).catch(() => ctx.reply(response));
    }
  } catch (error: any) {
    console.error(`[ERRO AUDIO] ${error.message}`);
    await ctx.reply("Erro ao processar áudio. Tente novamente.");
  }
});

// Registrar callback pra debate entre IAs mandar mensagens intermediárias
setSendMessageCallback(async (chatId: string, text: string) => {
  try {
    await bot.api.sendMessage(chatId, text, { parse_mode: "Markdown" });
  } catch {
    await bot.api.sendMessage(chatId, text).catch(() => {});
  }
});

export default bot;
