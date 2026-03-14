import { generateResponse, generateWithProvider, ChatMessage, getCurrentTime, getLastProvider, getProviderStatus } from "./tools";
import { saveMessage, getHistory, getUserPreference, saveUserPreference, clearHistory } from "../db/memory";
import { executeCoderTask, isGitHubConfigured, listRepos, createRepo } from "./coder";

// ============ ROTEADOR DE AGENTES ============

const ROUTER_PROMPT = `Voce e um roteador de tarefas. Sua UNICA funcao e analisar a mensagem do usuario
e classificar em UMA das categorias abaixo.

Categorias:
- "code": pedidos de codigo, debug, refatoracao, criar app/site/sistema, criar projeto, programar algo, arquitetura
- "research": perguntas factuais, pesquisa, explicacoes conceituais, comparacoes, tutoriais
- "critic": pedidos de revisao, analise de qualidade, busca de bugs, avaliar codigo
- "general": conversa geral, cumprimentos, perguntas sobre o bot, piadas, opinioes

Responda APENAS com a categoria em texto puro. Nada mais.

Exemplos:
- "me faz um CRUD em Python" -> code
- "cria um app tipo TikTok" -> code
- "cria um site de vendas" -> code
- "faz um sistema de login" -> code
- "qual a diferenca entre REST e GraphQL?" -> research
- "o que e inteligencia artificial?" -> research
- "revisa esse codigo pra mim" -> critic
- "quem e voce?" -> general
- "oi tudo bem?" -> general`;

type AgentCategory = "code" | "research" | "critic" | "general";

// Rastrear último agente por usuário
const lastAgent: Record<string, AgentCategory> = {};
export function getLastAgent(userId: string): string { return lastAgent[userId] || "nenhum"; }

async function routeMessage(text: string): Promise<AgentCategory> {
  try {
    const messages: ChatMessage[] = [{ role: "user", content: text }];
    const response = await generateResponse(messages, ROUTER_PROMPT);
    const category = response.trim().toLowerCase().replace(/[^a-z]/g, "") as AgentCategory;
    if (["code", "research", "critic", "general"].includes(category)) {
      return category;
    }
  } catch (e: any) {
    console.log("[ROUTER] Erro:", e.message);
  }
  // Fallback: usar keywords
  return fallbackRoute(text);
}

function fallbackRoute(text: string): AgentCategory {
  const lower = text.toLowerCase();
  const codeWords = ["cria", "crie", "criar", "faz", "faça", "programa", "código", "codigo", "app", "site",
    "sistema", "html", "css", "javascript", "python", "react", "api", "deploy", "docker",
    "componente", "página", "endpoint", "script", "função", "banco de dados", "tiktok", "clone"];
  const researchWords = ["o que é", "o que e", "como funciona", "diferença", "diferenca", "explica",
    "qual a", "quais", "por que", "porque", "tutorial", "como fazer"];
  const criticWords = ["revisa", "revise", "analisa", "analise", "avalia", "avalie", "bug", "erro",
    "problema no código", "melhore", "refatore"];

  let codeScore = 0, researchScore = 0, criticScore = 0;
  for (const w of codeWords) if (lower.includes(w)) codeScore++;
  for (const w of researchWords) if (lower.includes(w)) researchScore++;
  for (const w of criticWords) if (lower.includes(w)) criticScore++;

  if (codeScore > researchScore && codeScore > criticScore && codeScore >= 2) return "code";
  if (researchScore > codeScore && researchScore > criticScore) return "research";
  if (criticScore > 0) return "critic";
  return "general";
}

// ============ PROMPTS DOS AGENTES ============

const GENERAL_PROMPT = `Você é o Opencrawsbuties 🤖⚡, um assistente de IA completo e parceiro de conversa.

Você conversa sobre TUDO da vida:
- Filosofia, ciência, história, cultura, arte, música, cinema
- Conselhos pessoais, relacionamentos, carreira, motivação
- Tecnologia, programação, negócios, empreendedorismo
- Saúde, bem-estar, esportes, culinária
- Atualidades, política, economia, curiosidades
- Piadas, memes, entretenimento, games
- Espiritualidade, autoconhecimento, psicologia
- Qualquer assunto que o usuário quiser conversar!

Personalidade:
- Você é como um melhor amigo inteligente que sabe de tudo
- Tom casual, descontraído, usa gírias brasileiras quando faz sentido
- Dá opiniões honestas quando perguntado
- Conta histórias e curiosidades interessantes
- É empático e sabe ouvir
- Usa humor quando apropriado
- É direto e não enrola

Capacidades especiais:
- Gerar imagens (/imagem) e vídeos (/video)
- Programar automaticamente no GitHub (só pedir!)
- Memória persistente entre conversas

Regras:
- Responda SEMPRE em português do Brasil
- Use emojis naturalmente (sem exagerar)
- Hora atual: {{TIME}}
- Nome do usuário: {{USER_NAME}}
- Provedor: {{PROVIDER}}
- Adapte o tamanho da resposta ao contexto: respostas curtas pra perguntas simples, longas pra temas complexos`;

const RESEARCH_PROMPT = `Você é o Opencrawsbuties 🤖⚡ no modo PESQUISADOR.

Seu papel é responder perguntas de forma completa, precisa e educativa.
Você é um especialista em explicar conceitos complexos de forma simples.

Regras:
- Responda SEMPRE em português do Brasil
- Use exemplos práticos quando possível
- Compare tecnologias de forma objetiva com prós e contras
- Cite fontes quando relevante
- Seja detalhado mas organizado (use listas, headers)
- Hora atual: {{TIME}}
- Nome do usuário: {{USER_NAME}}`;

const CRITIC_PROMPT = `Você é o Opencrawsbuties 🤖⚡ no modo REVISOR DE CÓDIGO.

Seu papel é analisar código com olho crítico e construtivo.
Você identifica: bugs, vulnerabilidades, bad practices, oportunidades de melhoria.

Regras:
- Responda SEMPRE em português do Brasil
- Seja direto e objetivo nas críticas
- Sugira correções com código
- Classifique severidade: 🔴 crítico, 🟡 importante, 🟢 sugestão
- Hora atual: {{TIME}}
- Nome do usuário: {{USER_NAME}}`;

// ============ FUNÇÕES AUXILIARES ============

function extractProjectName(text: string): string {
  const patterns = [
    /(?:app|aplicativo|site|projeto|sistema|plataforma)\s+(?:de\s+|do\s+|da\s+|para\s+|tipo\s+)?(.+?)(?:\s+com|\s+usando|\s+que|\s+para|$)/i,
    /cri(?:a|e|ar)\s+(?:um|uma)?\s*(.+?)(?:\s+com|\s+usando|\s+que|\s+para|$)/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match?.[1]) {
      return match[1].trim()
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .substring(0, 30)
        .toLowerCase() || "meu-projeto";
    }
  }
  return "meu-projeto-" + Date.now().toString(36);
}

// Repo ativo por usuário (compartilhado com bot.ts via export)
export const activeRepos: Record<string, string> = {};

// ============ PROCESSAMENTO PRINCIPAL ============

export async function processMessage(userId: string, userName: string, text: string): Promise<string> {
  // Comandos especiais
  if (text === "/start") {
    saveUserPreference(userId, userName, "");
    return `Olá ${userName}! 👋\n\n` +
      `Eu sou o **Opencrawsbuties** 🤖⚡\n` +
      `Um agente de IA multi-agente que roda 24/7!\n\n` +
      `**Agentes disponíveis:**\n` +
      `🧠 **Geral** - Conversa, ideias, ajuda\n` +
      `💻 **Coder** - Programa no GitHub automaticamente\n` +
      `🔬 **Pesquisador** - Pesquisa profunda e explicações\n` +
      `🔍 **Revisor** - Revisão e análise de código\n\n` +
      `**Comandos:**\n` +
      `/limpar - Limpar histórico\n` +
      `/sobre - Sobre mim\n` +
      `/hora - Hora atual\n` +
      `/modelos - Ver IAs disponíveis\n` +
      `/status - Ver último agente usado\n` +
      `/imagem [texto] - Gerar imagem\n` +
      `/video [texto] - Gerar vídeo\n` +
      `/repos - Listar repositórios\n` +
      `/repo [nome] - Selecionar repo\n` +
      `/code [tarefa] - Programar\n\n` +
      `Ou só me pede naturalmente! Eu detecto o que você quer. 🚀`;
  }

  if (text === "/limpar") {
    clearHistory(userId);
    return "🧹 Histórico limpo! Podemos começar de novo.";
  }

  if (text === "/sobre") {
    return "🤖 **Opencrawsbuties** - Sistema Multi-Agente 24/7\n\n" +
      "**Agentes:**\n" +
      "• 🧠 General - Conversa inteligente\n" +
      "• 💻 Coder - Programação autônoma no GitHub\n" +
      "• 🔬 Researcher - Pesquisa e explicações\n" +
      "• 🔍 Critic - Revisão de código\n\n" +
      "**Provedores:**\n" +
      "• Groq, Gemini, HuggingFace, Cohere, DeepSeek, OpenRouter\n" +
      "• Imagens: Gemini Imagen, Pollinations, SDXL\n" +
      "• Vídeo: Gemini Veo 2\n" +
      "• Áudio: Whisper\n\n" +
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

  if (text === "/status") {
    const agent = lastAgent[userId];
    return agent
      ? `🤖 Último agente: **${agent}**\n\nRepo ativo: ${activeRepos[userId] || "nenhum"}`
      : "Nenhuma interação registrada ainda.";
  }

  // ========== DEBATE ENTRE IAS ==========
  if (text.startsWith("/debate ")) {
    const topic = text.replace("/debate ", "").trim();
    if (!topic) return "Use: /debate [tema]\nEx: /debate qual a melhor linguagem de programação?";
    return await aiDebate(topic, userId, userName);
  }

  // Salvar mensagem do usuário
  saveMessage(userId, "user", text);

  // ========== ROTEAR PARA O AGENTE CORRETO ==========
  console.log(`[ROUTER] Roteando mensagem de ${userName}: "${text.substring(0, 60)}..."`);
  const category = await routeMessage(text);
  lastAgent[userId] = category;
  console.log(`[ROUTER] → Agente: ${category}`);

  // ========== AGENTE CODER ==========
  if (category === "code" && isGitHubConfigured()) {
    let repo = activeRepos[userId];

    if (!repo) {
      console.log(`[CODER] Sem repo ativo, tentando auto-selecionar...`);
      const projectName = extractProjectName(text);
      const repos = await listRepos();
      const existing = repos.find(r => r.toLowerCase().includes(projectName.toLowerCase()));

      if (existing) {
        repo = existing;
        activeRepos[userId] = repo;
        console.log(`[CODER] Auto-selecionado repo existente: ${repo}`);
      } else {
        console.log(`[CODER] Criando novo repo: ${projectName}`);
        const result = await createRepo(projectName, `Projeto criado pelo Opencrawsbuties: ${text.substring(0, 100)}`);
        if (result.success && result.fullName) {
          repo = result.fullName;
          activeRepos[userId] = repo;
          console.log(`[CODER] Novo repo criado: ${repo}`);
        } else if (repos.length > 0) {
          repo = repos[0];
          activeRepos[userId] = repo;
          console.log(`[CODER] Fallback pro primeiro repo: ${repo}`);
        } else {
          const hint = "❌ Não consegui criar um repositório. Verifique seu GITHUB_TOKEN.";
          saveMessage(userId, "assistant", hint);
          return hint;
        }
      }
    }

    console.log(`[CODER] Executando tarefa de ${userName} no repo ${repo}`);
    const result = await executeCoderTask(text, repo);
    saveMessage(userId, "assistant", result);
    return `💻 *Agente: Coder*\n\n${result}`;
  }

  // ========== AGENTES RESEARCH, CRITIC, GENERAL ==========
  const history = getHistory(userId, 20);
  const messages: ChatMessage[] = history.map(h => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));

  const pref = getUserPreference(userId);
  let promptTemplate: string;
  let agentEmoji: string;

  switch (category) {
    case "research":
      promptTemplate = RESEARCH_PROMPT;
      agentEmoji = "🔬";
      break;
    case "critic":
      promptTemplate = CRITIC_PROMPT;
      agentEmoji = "🔍";
      break;
    case "code":
      // GitHub não configurado, responder como general
      promptTemplate = GENERAL_PROMPT;
      agentEmoji = "🧠";
      break;
    default:
      promptTemplate = GENERAL_PROMPT;
      agentEmoji = "🧠";
  }

  const prompt = promptTemplate
    .replace("{{TIME}}", getCurrentTime())
    .replace("{{USER_NAME}}", pref?.name || userName || "amigo")
    .replace("{{PROVIDER}}", getLastProvider());

  const response = await generateResponse(messages, prompt);
  saveMessage(userId, "assistant", response);

  return response;
}

// ============ DEBATE ENTRE IAS ============

// Callback pra enviar mensagens intermediárias no Telegram
let sendMessageCallback: ((chatId: string, text: string) => Promise<void>) | null = null;
export function setSendMessageCallback(cb: (chatId: string, text: string) => Promise<void>) {
  sendMessageCallback = cb;
}

async function aiDebate(topic: string, userId: string, userName: string): Promise<string> {
  const providers = ["groq", "deepseek", "gemini", "cohere", "openrouter"];
  const available: string[] = [];

  // Filtrar provedores disponíveis
  if (process.env.GROQ_API_KEY) available.push("groq");
  if (process.env.DEEPSEEK_API_KEY) available.push("deepseek");
  if (process.env.GEMINI_API_KEY) available.push("gemini");
  if (process.env.COHERE_API_KEY) available.push("cohere");
  if (process.env.OPENROUTER_API_KEY) available.push("openrouter");

  if (available.length < 2) {
    return "❌ Preciso de pelo menos 2 provedores de IA configurados pra um debate.";
  }

  // Escolher 2 IAs aleatórias
  const shuffled = available.sort(() => Math.random() - 0.5);
  const ia1 = shuffled[0];
  const ia2 = shuffled[1];

  const debatePrompt = (iaName: string, otherName: string) =>
    `Você é ${iaName} participando de um debate amigável com ${otherName} sobre: "${topic}".
Regras:
- Responda em português do Brasil
- Dê sua opinião honesta, pode discordar
- Seja conciso (máx 3 parágrafos)
- Seja respeitoso mas firme nas opiniões
- Use argumentos concretos
- Pode usar humor
- NÃO comece com "Olá" ou cumprimentos, vá direto ao ponto`;

  const conversation: ChatMessage[] = [];
  const rounds = 3;
  let fullDebate = `🎙️ **DEBATE: ${topic}**\n\n`;

  if (sendMessageCallback) {
    await sendMessageCallback(userId, `🎙️ **DEBATE: ${topic}**\n\nParticipantes prontos... Iniciando!`);
  }

  for (let round = 0; round < rounds; round++) {
    // IA 1 fala
    try {
      const r1 = await generateWithProvider(ia1, conversation, debatePrompt(ia1, ia2));
      conversation.push({ role: "user", content: `[${r1.name}]: ${r1.text}` });
      const msg1 = `${r1.name}:\n${r1.text}`;
      fullDebate += msg1 + "\n\n---\n\n";
      if (sendMessageCallback) await sendMessageCallback(userId, msg1);
    } catch (e: any) {
      console.log(`[DEBATE] ${ia1} falhou:`, e.message);
      fullDebate += `⚠️ ${ia1} não respondeu nessa rodada\n\n`;
    }

    // IA 2 responde
    try {
      const r2 = await generateWithProvider(ia2, conversation, debatePrompt(ia2, ia1));
      conversation.push({ role: "user", content: `[${r2.name}]: ${r2.text}` });
      const msg2 = `${r2.name}:\n${r2.text}`;
      fullDebate += msg2 + "\n\n---\n\n";
      if (sendMessageCallback) await sendMessageCallback(userId, msg2);
    } catch (e: any) {
      console.log(`[DEBATE] ${ia2} falhou:`, e.message);
      fullDebate += `⚠️ ${ia2} não respondeu nessa rodada\n\n`;
    }
  }

  fullDebate += `🏁 **Fim do debate!** (${rounds} rodadas)`;
  saveMessage(userId, "assistant", fullDebate);

  return `🏁 **Debate finalizado!** Foram ${rounds} rodadas entre as IAs.`;
}
