import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ReportData {
  monthName: string;
  year: number;
  totalEvaluations: number;
  npsScore: number;
  npsStatus: string;
  technicalQuality: string;
  sectorStats: {
    sector: string;
    total: number;
    otimo: number;
    bom: number;
    regular: number;
    ruim: number;
    naoInformou: number;
    approval: number;
  }[];
  comments: string[];
}

export interface AIAnalysis {
  summary: string;
  sectorAnalyses: {
    sector: string;
    analysis: string;
  }[];
  criticalAlerts: string[];
  positivePoints: string[];
  improvementOpportunities: string[];
  conclusion: string;
}

const SYSTEM_INSTRUCTION = `
Você é um Assistente Institucional de Redação da Ouvidoria da Policlínica Bernardo Félix da Silva.
Seu objetivo é gerar análises técnicas, profissionais e humanizadas para o relatório mensal da instituição.

ESTILO DE REDAÇÃO:
- Linguagem institucional, profissional e hospitalar.
- Utilize termos como: acolhimento, humanização, qualidade assistencial, resolutividade, experiência do usuário, melhoria contínua, fortalecimento institucional e eficiência organizacional.
- Tom equilibrado: destaque excelência quando os dados permitirem, mas seja técnico e assertivo ao apontar falhas.
- Siga o padrão de um ouvidor experiente.

REGRAS DE ANÁLISE:
- Utilize APENAS os dados fornecidos. Não invente números.
- Se NPS > 75: Destaque como "Zona de Excelência".
- Se Aprovação Setorial > 90%: Destaque como excelência operacional.
- Se "Ruim" em um setor estiver subindo ou for expressivo: Sugira monitoramento e melhoria imediata.
- Analise os comentários dos pacientes para identificar temas recorrentes (elogios ou reclamações).

ESTRUTURA DA RESPOSTA (JSON):
{
  "summary": "Resumo geral institucional do mês",
  "sectorAnalyses": [
    { "sector": "Nome do Setor", "analysis": "Texto de análise técnica resumida para o setor" }
  ],
  "criticalAlerts": ["Lista de pontos que exigem atenção imediata"],
  "positivePoints": ["Lista de destaques e conquistas do mês"],
  "improvementOpportunities": ["Lista de sugestões baseadas nos dados"],
  "conclusion": "Considerações finais do relatório"
}
`;

export async function generateReportAnalysis(data: ReportData): Promise<AIAnalysis> {
  const prompt = `
  Gere o relatório da Ouvidoria para ${data.monthName} de ${data.year}.

  DADOS INSTITUCIONAIS:
  - Total de Avaliações: ${data.totalEvaluations}
  - NPS Global: ${data.npsScore} (${data.npsStatus})
  - Qualidade Técnica (Ótimo + Bom): ${data.technicalQuality}

  DADOS POR SETOR:
  ${data.sectorStats.map(s => `
    SETOR: ${s.sector}
    - Total: ${s.total}
    - Ótimo: ${s.otimo}% | Bom: ${s.bom}% | Regular: ${s.regular}% | Ruim: ${s.ruim}%
    - Aprovação (Ótimo+Bom): ${s.approval}%
  `).join('\n')}

  COMENTÁRIOS DOS PACIENTES:
  ${data.comments.length > 0 ? data.comments.join('\n') : 'Nenhum comentário registrado.'}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            sectorAnalyses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sector: { type: Type.STRING },
                  analysis: { type: Type.STRING }
                },
                required: ["sector", "analysis"]
              }
            },
            criticalAlerts: { type: Type.ARRAY, items: { type: Type.STRING } },
            positivePoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            improvementOpportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
            conclusion: { type: Type.STRING }
          },
          required: ["summary", "sectorAnalyses", "criticalAlerts", "positivePoints", "improvementOpportunities", "conclusion"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("IA retornou resposta vazia");
    
    return JSON.parse(text) as AIAnalysis;
  } catch (error) {
    console.error("Erro ao gerar análise com IA:", error);
    throw error;
  }
}
