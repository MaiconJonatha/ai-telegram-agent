import { Bot, Context } from "grammy";
import { processMessage } from "../agent/agent";
import { transcribeAudio } from "../agent/tools";

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

// Handler para todas mensagens de texto
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const userName = ctx.from.first_name || "Usuário";
  const text = ctx.message.text;

  console.log(`[${new Date().toISOString()}] ${userName} (${userId}): ${text}`);

  try {
    // Mostrar "digitando..."
    await ctx.replyWithChatAction("typing");

    const response = await processMessage(userId, userName, text);

    // Dividir resposta longa em partes (Telegram limit: 4096 chars)
    if (response.length > 4000) {
      const parts = response.match(/.{1,4000}/gs) || [response];
      for (const part of parts) {
        await ctx.reply(part, { parse_mode: "Markdown" }).catch(() => 
          ctx.reply(part) // fallback sem markdown se falhar
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

    // Download audio file
    const file = await ctx.getFile();
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const res = await fetch(url);
    const buffer = Buffer.from(await res.arrayBuffer());

    console.log(`[${new Date().toISOString()}] ${userName} (${userId}): [AUDIO ${buffer.length} bytes]`);

    // Transcribe with Whisper
    const text = await transcribeAudio(buffer);
    if (!text) {
      await ctx.reply("Não consegui entender o áudio. Tente novamente.");
      return;
    }

    console.log(`[TRANSCRICAO] ${text}`);
    await ctx.reply(`🎤 *Transcrição:* ${text}`, { parse_mode: "Markdown" }).catch(() => {});

    // Process transcribed text
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
