import { generateResponse, ChatMessage } from "./tools";

const GITHUB_API = "https://api.github.com";
const GITHUB_TOKEN = () => process.env.GITHUB_TOKEN || "";
const GITHUB_USER = () => process.env.GITHUB_USER || "MaiconJonatha";

function headers() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN()}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "OpencrawsBot",
  };
}

// ============ GITHUB API ============

export async function listRepos(): Promise<string[]> {
  try {
    const res = await fetch(`${GITHUB_API}/user/repos?per_page=30&sort=updated`, { headers: headers() });
    const repos = await res.json() as any[];
    return repos.map((r: any) => r.full_name);
  } catch (e: any) {
    console.log("[GitHub] Erro listRepos:", e.message);
    return [];
  }
}

export async function getRepoTree(repo: string, path: string = ""): Promise<string[]> {
  try {
    const url = path
      ? `${GITHUB_API}/repos/${repo}/contents/${path}`
      : `${GITHUB_API}/repos/${repo}/contents`;
    const res = await fetch(url, { headers: headers() });
    const items = await res.json() as any[];
    if (!Array.isArray(items)) return [];
    return items.map((i: any) => `${i.type === "dir" ? "📁" : "📄"} ${i.path}`);
  } catch (e: any) {
    console.log("[GitHub] Erro getRepoTree:", e.message);
    return [];
  }
}

export async function readFile(repo: string, path: string): Promise<string> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, { headers: headers() });
    const data = await res.json() as any;
    if (data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return `Erro: ${data.message || "arquivo não encontrado"}`;
  } catch (e: any) {
    return `Erro: ${e.message}`;
  }
}

export async function createOrUpdateFile(
  repo: string,
  path: string,
  content: string,
  message: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    // Verificar se arquivo já existe (pra pegar o SHA)
    let sha: string | undefined;
    try {
      const existing = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, { headers: headers() });
      if (existing.ok) {
        const data = await existing.json() as any;
        sha = data.sha;
      }
    } catch {}

    const body: any = {
      message,
      content: Buffer.from(content).toString("base64"),
      committer: { name: "OpencrawsBot", email: "opencrawsbot@users.noreply.github.com" },
    };
    if (sha) body.sha = sha;

    const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;

    if (data.content?.html_url) {
      return { success: true, url: data.content.html_url };
    }
    return { success: false, error: data.message || "erro desconhecido" };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteFile(
  repo: string,
  path: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, { headers: headers() });
    const data = await existing.json() as any;
    if (!data.sha) return { success: false, error: "arquivo não encontrado" };

    const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
      method: "DELETE",
      headers: headers(),
      body: JSON.stringify({
        message,
        sha: data.sha,
        committer: { name: "OpencrawsBot", email: "opencrawsbot@users.noreply.github.com" },
      }),
    });
    return res.ok ? { success: true } : { success: false, error: "falha ao deletar" };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createBranch(
  repo: string,
  branchName: string,
  fromBranch: string = "main"
): Promise<{ success: boolean; error?: string }> {
  try {
    // Pegar SHA da branch base
    const refRes = await fetch(`${GITHUB_API}/repos/${repo}/git/ref/heads/${fromBranch}`, { headers: headers() });
    const refData = await refRes.json() as any;
    const sha = refData.object?.sha;
    if (!sha) return { success: false, error: `branch ${fromBranch} não encontrada` };

    const res = await fetch(`${GITHUB_API}/repos/${repo}/git/refs`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
    });
    return res.ok ? { success: true } : { success: false, error: "falha ao criar branch" };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createPR(
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string = "main"
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${repo}/pulls`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ title, body, head, base }),
    });
    const data = await res.json() as any;
    if (data.html_url) return { success: true, url: data.html_url };
    return { success: false, error: data.message || "erro ao criar PR" };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createRepo(name: string, description: string = ""): Promise<{ success: boolean; fullName?: string; error?: string }> {
  try {
    const res = await fetch(`${GITHUB_API}/user/repos`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name,
        description,
        auto_init: true,
        private: false,
      }),
    });
    const data = await res.json() as any;
    if (data.full_name) return { success: true, fullName: data.full_name };
    return { success: false, error: data.message || "erro ao criar repo" };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ============ AGENTE PROGRAMADOR ============

const CODER_SYSTEM_PROMPT = `Você é um agente programador autônomo chamado OpencrawsBot 🤖⚡
Você recebe tarefas de programação e executa usando a API do GitHub.

Quando receber uma tarefa, você deve:
1. Analisar o que precisa ser feito
2. Planejar as mudanças necessárias
3. Retornar as ações em formato JSON

IMPORTANTE: Retorne APENAS um JSON válido, sem texto antes ou depois.

Formato de resposta (JSON array de ações):
[
  {
    "action": "read_file",
    "repo": "user/repo",
    "path": "caminho/arquivo.ts"
  },
  {
    "action": "create_file",
    "repo": "user/repo",
    "path": "caminho/novo.ts",
    "content": "conteúdo do arquivo",
    "message": "mensagem do commit"
  },
  {
    "action": "update_file",
    "repo": "user/repo",
    "path": "caminho/existente.ts",
    "content": "conteúdo atualizado",
    "message": "mensagem do commit"
  },
  {
    "action": "delete_file",
    "repo": "user/repo",
    "path": "caminho/remover.ts",
    "message": "mensagem do commit"
  },
  {
    "action": "create_branch",
    "repo": "user/repo",
    "branch": "feature/nome"
  },
  {
    "action": "create_pr",
    "repo": "user/repo",
    "title": "Título da PR",
    "body": "Descrição",
    "head": "feature/nome",
    "base": "main"
  },
  {
    "action": "reply",
    "message": "Mensagem para o usuário explicando o que foi feito"
  }
]

Ações disponíveis: read_file, create_file, update_file, delete_file, create_branch, create_pr, reply
Sempre termine com uma ação "reply" explicando o que fez.
Se precisar ler arquivos antes de editar, primeiro retorne ações de read_file.`;

interface CoderAction {
  action: string;
  repo?: string;
  path?: string;
  content?: string;
  message?: string;
  branch?: string;
  title?: string;
  body?: string;
  head?: string;
  base?: string;
  [key: string]: any;
}

export async function executeCoderTask(
  task: string,
  repo: string,
  context: string = ""
): Promise<string> {
  const results: string[] = [];
  let iteration = 0;
  const maxIterations = 5; // Máximo de ciclos read → plan → execute
  let accumulatedContext = context;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[CODER] Iteração ${iteration} para: ${task.substring(0, 50)}...`);

    const messages: ChatMessage[] = [
      {
        role: "user",
        content: `Repo: ${repo}\nTarefa: ${task}\n${accumulatedContext ? `\nContexto dos arquivos lidos:\n${accumulatedContext}` : ""}\n${results.length ? `\nResultados anteriores:\n${results.join("\n")}` : ""}`,
      },
    ];

    const response = await generateResponse(messages, CODER_SYSTEM_PROMPT);

    // Extrair JSON da resposta
    let actions: CoderAction[];
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return `🤖 Resposta do agente:\n${response}`;
      }
      actions = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return `🤖 Resposta do agente:\n${response}`;
    }

    let hasReadActions = false;
    let replyMessage = "";

    for (const action of actions) {
      try {
        switch (action.action) {
          case "read_file": {
            if (!action.repo || !action.path) break;
            const content = await readFile(action.repo, action.path);
            accumulatedContext += `\n\n--- ${action.path} ---\n${content.substring(0, 3000)}`;
            results.push(`📖 Lido: ${action.path} (${content.length} chars)`);
            hasReadActions = true;
            break;
          }
          case "create_file":
          case "update_file": {
            if (!action.repo || !action.path || !action.content) break;
            const res = await createOrUpdateFile(
              action.repo,
              action.path,
              action.content,
              action.message || `OpencrawsBot: ${action.action} ${action.path}`
            );
            if (res.success) {
              results.push(`✅ ${action.action === "create_file" ? "Criado" : "Atualizado"}: ${action.path}`);
            } else {
              results.push(`❌ Erro em ${action.path}: ${res.error}`);
            }
            break;
          }
          case "delete_file": {
            if (!action.repo || !action.path) break;
            const res = await deleteFile(
              action.repo,
              action.path,
              action.message || `OpencrawsBot: deletar ${action.path}`
            );
            results.push(res.success ? `🗑️ Deletado: ${action.path}` : `❌ Erro: ${res.error}`);
            break;
          }
          case "create_branch": {
            if (!action.repo || !action.branch) break;
            const res = await createBranch(action.repo, action.branch);
            results.push(res.success ? `🌿 Branch criada: ${action.branch}` : `❌ Erro: ${res.error}`);
            break;
          }
          case "create_pr": {
            if (!action.repo || !action.title) break;
            const res = await createPR(
              action.repo,
              action.title,
              action.body || "",
              action.head || "main",
              action.base || "main"
            );
            results.push(res.success ? `🔗 PR criada: ${res.url}` : `❌ Erro: ${res.error}`);
            break;
          }
          case "reply": {
            replyMessage = action.message || "";
            break;
          }
        }
      } catch (e: any) {
        results.push(`❌ Erro na ação ${action.action}: ${e.message}`);
      }
    }

    // Se só teve leituras, continua o loop pra agora editar
    if (hasReadActions && !replyMessage && iteration < maxIterations) {
      continue;
    }

    // Montar resposta final
    const output = [
      `🤖 **OpencrawsBot Programador**`,
      `📋 Tarefa: ${task}`,
      `📦 Repo: ${repo}`,
      ``,
      `**Ações executadas:**`,
      ...results,
    ];
    if (replyMessage) {
      output.push(``, `💬 ${replyMessage}`);
    }
    return output.join("\n");
  }

  return `🤖 **OpencrawsBot Programador**\n\n${results.join("\n")}\n\n⚠️ Máximo de iterações atingido.`;
}

// Verificar se GitHub está configurado
export function isGitHubConfigured(): boolean {
  return !!process.env.GITHUB_TOKEN;
}
