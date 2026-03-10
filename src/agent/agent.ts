import { generateResponse, ChatMessage, getCurrentTime } from "./tools";
import { saveMessage, getHistory, getUserPreference, saveUserPreference, clearHistory } from "../db/memory";

const SYSTEM_PROMPT = `Você é um Agente de IA avançado chamado "ArcanjoBot" 🤖⚡
Você faz parte de um ecossistema de 16 serviços de IA rodando localmente.

Suas capacidades:
- Conversar de forma inteligente e natural em português
- Lembrar do contexto de conversas anteriores (memória persistente)
- Gerar imagens (descreva o que quer e eu guio o processo)
- Informar hora atual
- Ajudar com programação, textos, ideias
- Responder sobre religião, espiritualidade, tecnologia

Regras:
- Responda SEMPRE em português do Brasil
- Seja conciso mas completo
- Use emojis quando apropriado
- Hora atual: {{TIME}}
- Nome do usuário: {{USER_NAME}}

Você é amigável, inteligente e prestativo. Seu tom é casual mas respeitoso.`;

export async function processMessage(userId: string, userName: string, text: string): Promise<string> {
  // Comandos especiais
  if (text === "/start") {
    saveUserPreference(userId, userName, "");
    return `Olá ${userName}! 👋\n\nEu sou o **ArcanjoBot** 🤖⚡\nUm agente de IA com memória persistente!\n\nComandos:\n/limpar - Limpar histórico\n/sobre - Sobre mim\n/hora - Hora atual\n\nPode me perguntar qualquer coisa!`;
  }

  if (text === "/limpar") {
    clearHistory(userId);
    return "🧹 Histórico limpo! Podemos começar de novo.";
  }

  if (text === "/sobre") {
    return "🤖 **ArcanjoBot** - Agente de IA\n\n" +
      "• Memória persistente (SQLite)\n" +
      "• LLM: Groq → OpenRouter → Ollama\n" +
      "• Parte do ecossistema de 16 IAs\n" +
      "• Criado com Google Antigravity\n\n" +
      "Feito com ❤️ e IA";
  }

  if (text === "/hora") {
    return `🕐 Agora são: ${getCurrentTime()}`;
  }

  // Salvar mensagem do usuário
  saveMessage(userId, "user", text);

  // Buscar histórico
  const history = getHistory(userId, 20);
  const messages: ChatMessage[] = history.map(h => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));

  // Preparar system prompt com dados do usuário
  const pref = getUserPreference(userId);
  const prompt = SYSTEM_PROMPT
    .replace("{{TIME}}", getCurrentTime())
    .replace("{{USER_NAME}}", pref?.name || userName || "amigo");

  // Gerar resposta
  const response = await generateResponse(messages, prompt);

  // Salvar resposta
  saveMessage(userId, "assistant", response);

  return response;
}
