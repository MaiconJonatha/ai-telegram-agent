import { generateResponse, ChatMessage, getCurrentTime, getLastProvider, getProviderStatus } from "./tools";
import { saveMessage, getHistory, getUserPreference, saveUserPreference, clearHistory } from "../db/memory";

const SYSTEM_PROMPT = `Você é um Agente de IA avançado chamado "ArcanjoBot" 🤖⚡
Você tem acesso a múltiplos provedores de IA gratuitos como fallback.

Suas capacidades:
- Conversar de forma inteligente e natural em português
- Lembrar do contexto de conversas anteriores (memória persistente)
- Gerar imagens com /imagem ou /img (Pollinations, HuggingFace, StableHorde)
- Transcrever áudio (Whisper via Groq e HuggingFace)
- Informar hora atual
- Ajudar com programação, textos, ideias
- Responder sobre religião, espiritualidade, tecnologia

Provedores de IA disponíveis:
- Groq (Llama 3.3 70B, Llama 3.1 8B) - ultra rápido
- Google Gemini (Flash 2.0) - grátis
- Hugging Face (Llama, Mixtral, Phi-3) - open source
- Cohere (Command R+) - grátis
- DeepSeek (Chat, Reasoner) - chinesa, muito forte
- SiliconFlow (Qwen 72B, DeepSeek V3, GLM-4, Yi-34B) - chinesa, grátis
- OpenRouter (Gemma, Mistral, Claude, Gemini Pro)

Regras:
- Responda SEMPRE em português do Brasil
- Seja conciso mas completo
- Use emojis quando apropriado
- Hora atual: {{TIME}}
- Nome do usuário: {{USER_NAME}}
- Provedor atual: {{PROVIDER}}

Você é amigável, inteligente e prestativo. Seu tom é casual mas respeitoso.`;

export async function processMessage(userId: string, userName: string, text: string): Promise<string> {
  // Comandos especiais
  if (text === "/start") {
    saveUserPreference(userId, userName, "");
    return `Olá ${userName}! 👋\n\n` +
      `Eu sou o **ArcanjoBot** 🤖⚡\n` +
      `Um agente de IA programador que roda 24/7!\n\n` +
      `**Geral:**\n` +
      `/limpar - Limpar histórico\n` +
      `/sobre - Sobre mim\n` +
      `/hora - Hora atual\n` +
      `/modelos - Ver IAs disponíveis\n` +
      `/imagem [texto] - Gerar imagem\n\n` +
      `**Programação 💻:**\n` +
      `/repos - Listar repositórios\n` +
      `/repo [nome] - Selecionar repo ativo\n` +
      `/arquivos [path] - Ver arquivos do repo\n` +
      `/ler [path] - Ler arquivo\n` +
      `/code [tarefa] - Programar automaticamente!\n\n` +
      `Pode me perguntar qualquer coisa!`;
  }

  if (text === "/limpar") {
    clearHistory(userId);
    return "🧹 Histórico limpo! Podemos começar de novo.";
  }

  if (text === "/sobre") {
    return "🤖 **ArcanjoBot** - Agente de IA Multi-Provider\n\n" +
      "• Memória persistente (SQLite)\n" +
      "• LLMs: Groq → Gemini → HuggingFace → Cohere → DeepSeek → SiliconFlow → OpenRouter\n" +
      "• Imagens: Pollinations → HuggingFace → Stable Horde\n" +
      "• Áudio: Whisper (Groq + HuggingFace)\n" +
      "• 9 provedores de IA gratuitos integrados\n\n" +
      "Feito com ❤️ e IA";
  }

  if (text === "/hora") {
    return `🕐 Agora são: ${getCurrentTime()}`;
  }

  if (text === "/modelos") {
    const providers = getProviderStatus();
    return `🧠 **Provedores de IA Configurados:**\n\n${providers.join("\n")}\n\n` +
      `Último provedor usado: **${getLastProvider()}**`;
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
    .replace("{{USER_NAME}}", pref?.name || userName || "amigo")
    .replace("{{PROVIDER}}", getLastProvider());

  // Gerar resposta
  const response = await generateResponse(messages, prompt);

  // Salvar resposta
  saveMessage(userId, "assistant", response);

  return response;
}
