import { Bot, Context } from "grammy";
import { processMessage } from "../agent/agent";
import { transcribeAudio, generateImage } from "../agent/tools";
import { listRepos, getRepoTree, readFile, executeCoderTask, isGitHubConfigured } from "../agent/coder";
import { InputFile } from "grammy";

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

// Repo ativo por usuário (para não precisar digitar toda vez)
const activeRepo: Record<string, string> = {};

// Handler para todas mensagens de texto
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const userName = ctx.from.first_name || "Usuário";
  const text = ctx.message.text;

  console.log(`[${new Date().toISOString()}] ${userName} (${userId}): ${text}`);

  try {
    // ========== COMANDOS DE IMAGEM ==========
    const imgMatch = text.match(/^\/imagem\s+(.+)/i) || text.match(/^\/img\s+(.+)/i);
    if (imgMatch) {
      await ctx.reply("🎨 Gerando imagem... (pode levar ~30s)");
      await ctx.replyWithChatAction("upload_photo");
      const imgBuffer = await generateImage(imgMatch[1]);
      if (imgBuffer) {
        await ctx.replyWithPhoto(new InputFile(imgBuffer, "image.png"), { caption: imgMatch[1] });
      } else {
        await ctx.reply("Não consegui gerar a imagem. Tente outro prompt.");
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

    // /code [tarefa] - Executar tarefa de programação
    const codeMatch = text.match(/^\/code\s+(.+)/si);
    if (codeMatch) {
      if (!isGitHubConfigured()) {
        await ctx.reply("❌ GitHub não configurado. Adicione GITHUB_TOKEN nas variáveis de ambiente.");
        return;
      }
      if (!activeRepo[userId]) {
        await ctx.reply("📌 Selecione um repo primeiro com `/repo nome/repo`", { parse_mode: "Markdown" });
        return;
      }
      await ctx.reply(`🤖 Trabalhando na tarefa...\n📦 Repo: ${activeRepo[userId]}\n\nIsso pode levar alguns segundos.`);
      await ctx.replyWithChatAction("typing");

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

export default bot;
