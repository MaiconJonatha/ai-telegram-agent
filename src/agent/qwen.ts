import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

const QWEN_CODER_SYSTEM_PROMPT = `Voce e o Qwen Coder, um assistente de programacao expert integrado ao bot Opencraws.
Voce escreve codigo limpo, eficiente e bem comentado.
Responde em portugues brasileiro.
Quando der codigo, use blocos de codigo markdown.
Seja direto e conciso.
Se o usuario pedir explicacao, explique de forma clara e didatica.
Voce domina: TypeScript, JavaScript, Python, Go, Rust, C/C++, Java, SQL, HTML/CSS, React, Node.js, e muito mais.
Quando possivel, sugira boas praticas e padroes de projeto.`;

// Code-related patterns for natural language detection
export const CODE_PATTERNS = /\b(como programar|escreve um c[oó]digo|faz um script|cria uma fun[cç][aã]o|c[oó]digo para|programa para|debug|debugar|corrigir c[oó]digo|explicar c[oó]digo|refatorar|refatora|como codar|me ajuda com c[oó]digo|erro no c[oó]digo|bug no|como fazer em|sintaxe de|algoritmo para|estrutura de dados|como implementar|compile|compilar)\b/i;

export async function askQwenCoder(prompt: string, context?: string): Promise<string> {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    {
      role: 'system' as const,
      content: QWEN_CODER_SYSTEM_PROMPT
    }
  ];

  if (context) {
    messages.push({ role: 'user' as const, content: `Contexto do codigo:\n${context}` });
  }

  messages.push({ role: 'user' as const, content: prompt });

  // Try Qwen model on Groq first
  const qwenModels = [
    'qwen-2.5-coder-32b',
    'qwen-coder-2.5-32b',
    'qwen2.5-coder-32b-instruct',
  ];

  for (const model of qwenModels) {
    try {
      console.log(`[QwenCoder] Tentando modelo: ${model}`);
      const response = await groq.chat.completions.create({
        model,
        messages,
        max_tokens: 4096,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        console.log(`[QwenCoder] Sucesso com modelo: ${model}`);
        return content;
      }
    } catch (e: any) {
      console.log(`[QwenCoder] Modelo ${model} nao disponivel: ${e.message?.substring(0, 80)}`);
    }
  }

  // Fallback to llama with coding-focused system prompt
  console.log('[QwenCoder] Fallback para llama-3.3-70b-versatile com prompt de codigo');
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: QWEN_CODER_SYSTEM_PROMPT + '\n\nVoce esta rodando como fallback do Qwen Coder via Llama 3.3. Mantenha a mesma qualidade de resposta para codigo.'
        },
        ...(context ? [{ role: 'user' as const, content: `Contexto do codigo:\n${context}` }] : []),
        { role: 'user' as const, content: prompt }
      ],
      max_tokens: 4096,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content || 'Sem resposta do assistente de codigo.';
  } catch (e2: any) {
    console.error('[QwenCoder] Fallback tambem falhou:', e2.message);
    return 'Erro ao processar codigo. Verifique se a GROQ_API_KEY esta configurada e tente novamente.';
  }
}
