import { generateResponse, ChatMessage, getCurrentTime, getLastProvider, getProviderStatus } from "./tools";
import { saveMessage, getHistory, getUserPreference, saveUserPreference, clearHistory } from "../db/memory";
import { executeCoderTask, isGitHubConfigured, listRepos, createRepo } from "./coder";

const SYSTEM_PROMPT = `Você é um Agente de IA avançado chamado "ArcanjoBot" 🤖⚡
Você tem acesso a múltiplos provedores de IA gratuitos como fallback.
Você também é um agente programador autônomo que pode editar código no GitHub.

Suas capacidades:
- Conversar de forma inteligente e natural em português
- Lembrar do contexto de conversas anteriores (memória persistente)
- Gerar imagens com /imagem ou /img (Pollinations, HuggingFace, StableHorde)
- Transcrever áudio (Whisper via Groq e HuggingFace)
- Programar automaticamente em repositórios GitHub
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

// Detectar se a mensagem é um pedido de programação
const CODING_KEYWORDS = [
  "cria um", "crie um", "criar um", "faz um", "faça um", "fazer um",
  "programa", "código", "codigo", "script", "função", "funcao",
  "adiciona", "adicione", "implementa", "implemente",
  "corrige", "corrija", "fix", "bug",
  "refatora", "refatore", "melhora", "melhore",
  "html", "css", "javascript", "typescript", "python", "react", "node",
  "api", "endpoint", "rota", "route",
  "componente", "component", "página", "pagina", "page",
  "banco de dados", "database", "tabela", "table",
  "deploy", "dockerfile", "docker",
  "no repo", "no repositório", "no repositorio",
  "commit", "push", "pull request",
];

function isCodingRequest(text: string): boolean {
  const lower = text.toLowerCase();
  // Precisa ter pelo menos 2 keywords OU menção explícita a repo/arquivo
  let matches = 0;
  for (const kw of CODING_KEYWORDS) {
    if (lower.includes(kw)) matches++;
  }
  // Menção explícita a programar no repo
  if (lower.includes("no repo") || lower.includes("no meu repo")) return true;
  if (lower.includes("programa pra mim") || lower.includes("programa isso")) return true;
  if (lower.includes("cria no github") || lower.includes("faz no github")) return true;
  return matches >= 2;
}

// Extrair nome do projeto de um pedido
function extractProjectName(text: string): string {
  const lower = text.toLowerCase();
  // Tentar extrair nome após "app", "site", "projeto", "sistema"
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
      `/imagem [texto] - Gerar imagem\n` +
      `/video [texto] - Gerar vídeo (Gemini Veo)\n\n` +
      `**Programação 💻:**\n` +
      `/repos - Listar repositórios\n` +
      `/repo [nome] - Selecionar repo ativo\n` +
      `/arquivos [path] - Ver arquivos do repo\n` +
      `/ler [path] - Ler arquivo\n` +
      `/code [tarefa] - Programar automaticamente!\n\n` +
      `Ou só me pede normalmente que eu detecto! Ex:\n` +
      `"Cria uma página de login no meu repo"`;
  }

  if (text === "/limpar") {
    clearHistory(userId);
    return "🧹 Histórico limpo! Podemos começar de novo.";
  }

  if (text === "/sobre") {
    return "🤖 **ArcanjoBot** - Agente de IA Programador 24/7\n\n" +
      "• Memória persistente (SQLite)\n" +
      "• LLMs: Groq → Gemini → HuggingFace → Cohere → DeepSeek → SiliconFlow → OpenRouter\n" +
      "• Imagens: Pollinations → HuggingFace → Stable Horde\n" +
      "• Áudio: Whisper (Groq + HuggingFace)\n" +
      "• Programação: GitHub API (ler, criar, editar, PRs)\n" +
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

  // Detectar se é pedido de programação
  if (isCodingRequest(text) && isGitHubConfigured()) {
    let repo = activeRepos[userId];

    // Se não tem repo selecionado, tentar encontrar ou criar um
    if (!repo) {
      console.log(`[CODER] Sem repo ativo, tentando auto-selecionar...`);

      // Extrair nome do projeto do pedido
      const projectName = extractProjectName(text);

      // Verificar se já existe um repo com esse nome
      const repos = await listRepos();
      const existing = repos.find(r => r.toLowerCase().includes(projectName.toLowerCase()));

      if (existing) {
        repo = existing;
        activeRepos[userId] = repo;
        console.log(`[CODER] Auto-selecionado repo existente: ${repo}`);
      } else {
        // Criar novo repo
        console.log(`[CODER] Criando novo repo: ${projectName}`);
        const result = await createRepo(projectName, `Projeto criado pelo ArcanjoBot: ${text.substring(0, 100)}`);
        if (result.success && result.fullName) {
          repo = result.fullName;
          activeRepos[userId] = repo;
          console.log(`[CODER] Novo repo criado: ${repo}`);
        } else {
          // Usar o primeiro repo disponível como fallback
          if (repos.length > 0) {
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
    }

    console.log(`[CODER] Detectado pedido de programação de ${userName}: ${text.substring(0, 50)}...`);
    const result = await executeCoderTask(text, repo);
    saveMessage(userId, "assistant", result);
    return result;
  }

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
