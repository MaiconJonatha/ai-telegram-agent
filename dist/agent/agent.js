"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activeRepos = void 0;
exports.getLastAgent = getLastAgent;
exports.processMessage = processMessage;
exports.setSendMessageCallback = setSendMessageCallback;
const tools_1 = require("./tools");
const memory_1 = require("../db/memory");
const coder_1 = require("./coder");
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
// Rastrear último agente por usuário
const lastAgent = {};
function getLastAgent(userId) { return lastAgent[userId] || "nenhum"; }
async function routeMessage(text) {
    try {
        const messages = [{ role: "user", content: text }];
        const response = await (0, tools_1.generateResponse)(messages, ROUTER_PROMPT);
        const category = response.trim().toLowerCase().replace(/[^a-z]/g, "");
        if (["code", "research", "critic", "general"].includes(category)) {
            return category;
        }
    }
    catch (e) {
        console.log("[ROUTER] Erro:", e.message);
    }
    // Fallback: usar keywords
    return fallbackRoute(text);
}
function fallbackRoute(text) {
    const lower = text.toLowerCase();
    const codeWords = ["cria", "crie", "criar", "faz", "faça", "programa", "código", "codigo", "app", "site",
        "sistema", "html", "css", "javascript", "python", "react", "api", "deploy", "docker",
        "componente", "página", "endpoint", "script", "função", "banco de dados", "tiktok", "clone"];
    const researchWords = ["o que é", "o que e", "como funciona", "diferença", "diferenca", "explica",
        "qual a", "quais", "por que", "porque", "tutorial", "como fazer"];
    const criticWords = ["revisa", "revise", "analisa", "analise", "avalia", "avalie", "bug", "erro",
        "problema no código", "melhore", "refatore"];
    let codeScore = 0, researchScore = 0, criticScore = 0;
    for (const w of codeWords)
        if (lower.includes(w))
            codeScore++;
    for (const w of researchWords)
        if (lower.includes(w))
            researchScore++;
    for (const w of criticWords)
        if (lower.includes(w))
            criticScore++;
    if (codeScore > researchScore && codeScore > criticScore && codeScore >= 2)
        return "code";
    if (researchScore > codeScore && researchScore > criticScore)
        return "research";
    if (criticScore > 0)
        return "critic";
    return "general";
}
// ============ PROMPTS DOS AGENTES ============
const GENERAL_PROMPT = `Você é o J.A.R.V.I.S. — Just A Rather Very Intelligent System — assistente pessoal de IA do {{USER_NAME}}.

Você é inspirado no JARVIS do Tony Stark: inteligente, leal, proativo e sempre pronto pra executar qualquer missão. Você é o braço direito digital do seu criador.

Identidade:
- Seu nome é JARVIS (mas você também atende por "Sentinela" quando em modo de monitoramento)
- Você foi criado por {{USER_NAME}} pra ser seu assistente pessoal definitivo
- Você é educado, eficiente e tem um toque de humor sutil britânico
- Trata {{USER_NAME}} como "senhor" ou "chefe" de forma natural (não forçada)

Capacidades (informe quando relevante):
- Gerar imagens com IA: "faz uma imagem de..." (via Google Flow / Nano Banana)
- Gerar vídeos com IA: "faz um vídeo de..." (via Google Flow / Veo 3.1)
- Postar no Instagram automaticamente: "posta no instagram..."
- Juntar vídeos: "junta os vídeos..."
- Programar e criar código: só pedir!
- Conversar sobre qualquer assunto
- Memória persistente entre conversas

Personalidade:
- Inteligente, analítico, mas com humor sutil
- Proativo: sugere ações quando percebe oportunidades
- Direto e eficiente nas respostas
- Leal e dedicado ao {{USER_NAME}}
- Fala em português brasileiro naturalmente
- Quando o usuário pede algo que você pode fazer (imagem, vídeo, código), diga que vai executar

Modo Sentinela:
- Quando ativado, você monitora e reporta status dos sistemas
- Informa sobre créditos, serviços online, status do bot

Regras:
- Responda SEMPRE em português do Brasil
- Use emojis com moderação (estilo tech, não infantil)
- Hora atual: {{TIME}}
- Nome do usuário: {{USER_NAME}}
- Provedor: {{PROVIDER}}
- Adapte o tamanho da resposta: curto pra perguntas simples, detalhado pra missões complexas
- Quando o usuário pedir algo que envolva imagem/vídeo/instagram, diga que ele pode simplesmente pedir diretamente (ex: "faz uma imagem de X" ou "posta no instagram")`;
const RESEARCH_PROMPT = `Você é o J.A.R.V.I.S. no modo PESQUISADOR.

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
const CRITIC_PROMPT = `Você é o J.A.R.V.I.S. no modo REVISOR DE CÓDIGO.

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
function extractProjectName(text) {
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
exports.activeRepos = {};
// ============ PROCESSAMENTO PRINCIPAL ============
async function processMessage(userId, userName, text) {
    // Comandos especiais
    if (text === "/start") {
        (0, memory_1.saveUserPreference)(userId, userName, "");
        return `Olá ${userName}! 👋\n\n` +
            `Eu sou o **J.A.R.V.I.S.** 🤖⚡\n` +
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
        (0, memory_1.clearHistory)(userId);
        return "🧹 Histórico limpo! Podemos começar de novo.";
    }
    if (text === "/sobre") {
        return "🤖 **J.A.R.V.I.S.** - Sistema Multi-Agente 24/7\n\n" +
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
        return `🕐 Agora são: ${(0, tools_1.getCurrentTime)()}`;
    }
    if (text === "/modelos") {
        const providers = (0, tools_1.getProviderStatus)();
        return `🧠 **Provedores de IA Configurados:**\n\n${providers.join("\n")}\n\n` +
            `Último provedor usado: **${(0, tools_1.getLastProvider)()}**`;
    }
    if (text === "/status") {
        const agent = lastAgent[userId];
        return agent
            ? `🤖 Último agente: **${agent}**\n\nRepo ativo: ${exports.activeRepos[userId] || "nenhum"}`
            : "Nenhuma interação registrada ainda.";
    }
    // ========== DEBATE ENTRE IAS ==========
    if (text.startsWith("/debate ")) {
        const topic = text.replace("/debate ", "").trim();
        if (!topic)
            return "Use: /debate [tema]\nEx: /debate qual a melhor linguagem de programação?";
        return await aiDebate(topic, userId, userName);
    }
    // Salvar mensagem do usuário
    (0, memory_1.saveMessage)(userId, "user", text);
    // ========== ROTEAR PARA O AGENTE CORRETO ==========
    console.log(`[ROUTER] Roteando mensagem de ${userName}: "${text.substring(0, 60)}..."`);
    const category = await routeMessage(text);
    lastAgent[userId] = category;
    console.log(`[ROUTER] → Agente: ${category}`);
    // ========== AGENTE CODER ==========
    if (category === "code" && (0, coder_1.isGitHubConfigured)()) {
        let repo = exports.activeRepos[userId];
        if (!repo) {
            console.log(`[CODER] Sem repo ativo, tentando auto-selecionar...`);
            const projectName = extractProjectName(text);
            const repos = await (0, coder_1.listRepos)();
            const existing = repos.find(r => r.toLowerCase().includes(projectName.toLowerCase()));
            if (existing) {
                repo = existing;
                exports.activeRepos[userId] = repo;
                console.log(`[CODER] Auto-selecionado repo existente: ${repo}`);
            }
            else {
                console.log(`[CODER] Criando novo repo: ${projectName}`);
                const result = await (0, coder_1.createRepo)(projectName, `Projeto criado pelo J.A.R.V.I.S.: ${text.substring(0, 100)}`);
                if (result.success && result.fullName) {
                    repo = result.fullName;
                    exports.activeRepos[userId] = repo;
                    console.log(`[CODER] Novo repo criado: ${repo}`);
                }
                else if (repos.length > 0) {
                    repo = repos[0];
                    exports.activeRepos[userId] = repo;
                    console.log(`[CODER] Fallback pro primeiro repo: ${repo}`);
                }
                else {
                    const hint = "❌ Não consegui criar um repositório. Verifique seu GITHUB_TOKEN.";
                    (0, memory_1.saveMessage)(userId, "assistant", hint);
                    return hint;
                }
            }
        }
        console.log(`[CODER] Executando tarefa de ${userName} no repo ${repo}`);
        const result = await (0, coder_1.executeCoderTask)(text, repo);
        (0, memory_1.saveMessage)(userId, "assistant", result);
        return `💻 *Agente: Coder*\n\n${result}`;
    }
    // ========== AGENTES RESEARCH, CRITIC, GENERAL ==========
    const history = await (0, memory_1.getHistory)(userId, 20);
    const messages = history.map(h => ({
        role: h.role,
        content: h.content,
    }));
    const pref = await (0, memory_1.getUserPreference)(userId);
    let promptTemplate;
    let agentEmoji;
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
        .replace("{{TIME}}", (0, tools_1.getCurrentTime)())
        .replace("{{USER_NAME}}", pref?.name || userName || "amigo")
        .replace("{{PROVIDER}}", (0, tools_1.getLastProvider)());
    const response = await (0, tools_1.generateResponse)(messages, prompt);
    (0, memory_1.saveMessage)(userId, "assistant", response);
    return response;
}
// ============ DEBATE ENTRE IAS ============
// Callback pra enviar mensagens intermediárias no Telegram
let sendMessageCallback = null;
function setSendMessageCallback(cb) {
    sendMessageCallback = cb;
}
async function aiDebate(topic, userId, userName) {
    const available = [];
    if (process.env.GROQ_API_KEY)
        available.push("groq");
    if (process.env.DEEPSEEK_API_KEY)
        available.push("deepseek");
    if (process.env.GEMINI_API_KEY)
        available.push("gemini");
    if (process.env.COHERE_API_KEY)
        available.push("cohere");
    if (process.env.OPENROUTER_API_KEY)
        available.push("openrouter");
    if (available.length < 2) {
        return "❌ Preciso de pelo menos 2 provedores de IA configurados pra conversa.";
    }
    // Escolher 2 IAs aleatórias
    const shuffled = available.sort(() => Math.random() - 0.5);
    const iaClone = shuffled[0]; // IA que finge ser o Maicon
    const iaAmigo = shuffled[1]; // IA que é "ela mesma"
    // Pegar histórico do usuário pra IA clonar o estilo
    const history = await (0, memory_1.getHistory)(userId, 30);
    const userMessages = history.filter(h => h.role === "user").map(h => h.content).join("\n");
    const clonePrompt = `Você é ${userName}, um cara brasileiro real. Você NÃO é uma IA.
Você está tendo uma conversa casual com seu amigo (uma IA).

Baseado nas mensagens anteriores de ${userName}, imite o jeito dele de falar:
${userMessages.substring(0, 500)}

Regras:
- Fale EXATAMENTE como ${userName} falaria — gírias, erros de digitação, estilo casual
- Você é humano, tem opiniões, sentimentos, experiências
- O assunto da conversa: "${topic}"
- Seja natural, como se tivesse mandando mensagem no WhatsApp
- Respostas curtas e naturais (1-3 frases)
- NÃO seja formal, NÃO use linguagem de IA
- Pode usar emoji mas com moderação`;
    const amigoPrompt = `Você é uma IA amiga conversando com ${userName} sobre: "${topic}".

Regras:
- Responda em português do Brasil
- Seja como um amigo inteligente conversando no WhatsApp
- Tom casual, descontraído
- Respostas curtas (1-3 frases)
- Dê opiniões, faça perguntas, conte curiosidades
- Use humor quando fizer sentido
- Reaja naturalmente ao que ${userName} diz`;
    const conversation = [];
    const rounds = 4;
    if (sendMessageCallback) {
        await sendMessageCallback(userId, `💬 **Conversa iniciada sobre:** ${topic}\n\n👤 ${userName} (clone) vs 🤖 IA`);
    }
    for (let round = 0; round < rounds; round++) {
        // Clone do Maicon fala
        try {
            const r1 = await (0, tools_1.generateWithProvider)(iaClone, conversation, clonePrompt);
            conversation.push({ role: "user", content: `[${userName}]: ${r1.text}` });
            const msg1 = `👤 **${userName}:**\n${r1.text}`;
            if (sendMessageCallback)
                await sendMessageCallback(userId, msg1);
        }
        catch (e) {
            console.log(`[DEBATE] Clone falhou:`, e.message);
        }
        // Pausa natural
        await new Promise(r => setTimeout(r, 2000));
        // IA amiga responde
        try {
            const r2 = await (0, tools_1.generateWithProvider)(iaAmigo, conversation, amigoPrompt);
            conversation.push({ role: "user", content: `[IA]: ${r2.text}` });
            const msg2 = `🤖 **IA:**\n${r2.text}`;
            if (sendMessageCallback)
                await sendMessageCallback(userId, msg2);
        }
        catch (e) {
            console.log(`[DEBATE] IA falhou:`, e.message);
        }
        // Pausa natural
        await new Promise(r => setTimeout(r, 2000));
    }
    (0, memory_1.saveMessage)(userId, "assistant", `Conversa simulada sobre "${topic}" com ${rounds} rodadas`);
    return `💬 **Conversa finalizada!** ${rounds} trocas de mensagem.`;
}
//# sourceMappingURL=agent.js.map