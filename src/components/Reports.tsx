import { useState, useEffect, useRef, FormEvent } from 'react';
import { collection, query, onSnapshot, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Rating, RATINGS, FIXED_SECTORS } from '../constants';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid, AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, BarChart3, PieChart as PieChartIcon, Info,
  Download, Filter, AlertCircle, TrendingDown, ClipboardList,
  FileText, ArrowRight, CheckCircle2, AlertTriangle, ShieldCheck,
  Sparkles, Bot, Save, RefreshCw, Send, Trash2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { format, subMonths, eachMonthOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import { toJpeg } from 'html-to-image';
import { generateReportAnalysis, AIAnalysis, ReportData, refineReportAnalysis, ChatMessage } from '../services/aiService';

const RATING_HEX: Record<Rating, string> = {
  "Ótimo": "#10b981",
  "Bom": "#3b82f6",
  "Regular": "#f59e0b",
  "Ruim": "#ef4444",
  "Não informou": "#94a3b8"
};

const CustomTooltip = ({ active, payload, label, suffix = "" }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-white/10 backdrop-blur-md">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{label}</p>
        {payload.map((item: any, index: number) => (
          <div key={index} className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color || item.fill }} />
            <span className="text-sm font-bold">{item.name}:</span>
            <span className="text-sm font-black">{item.value}{suffix}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function Reports() {
  const [rawData, setRawData] = useState<any[]>([]);
  const [formsData, setFormsData] = useState<any[]>([]);
  const [formsCount, setFormsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isEditingAi, setIsEditingAi] = useState(false);
  const [editedAnalysis, setEditedAnalysis] = useState<AIAnalysis | null>(null);

  // Assistant IA chat refinement states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userChatInput, setUserChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);

  const reportsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const qEvals = query(collection(db, 'evaluations'), orderBy('date', 'desc'), limit(5000));
    const unsubscribeEvals = onSnapshot(qEvals, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: (doc.data().date as Timestamp).toDate()
      }));
      setRawData(records);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'evaluations');
      setLoading(false);
    });

    const qForms = query(collection(db, 'forms'));
    const unsubscribeForms = onSnapshot(qForms, (snapshot) => {
      const allForms = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: (doc.data().date as Timestamp).toDate()
      }));
      setFormsData(allForms);
      
      const filteredForms = allForms.filter(f => 
        f.date.getMonth() === selectedMonth && f.date.getFullYear() === selectedYear
      );
      setFormsCount(filteredForms.length);
    });

    return () => {
      unsubscribeEvals();
      unsubscribeForms();
    };
  }, [selectedMonth, selectedYear]);

  if (loading) {
    return (
      <div className="flex justify-center p-20">
        <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  const filteredData = rawData.filter(d => {
    const date = d.date;
    return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
  });

  const ratingCounts = RATINGS.reduce((acc, r) => {
    acc[r] = filteredData.filter(d => d.rating === r).length;
    return acc;
  }, {} as Record<Rating, number>);

  const detailedSectorStats = FIXED_SECTORS.map(sectorName => {
    const sectorEvaluations = filteredData.filter(d => d.sector === sectorName);
    const total = sectorEvaluations.length;
    
    const distribution = RATINGS.reduce((acc, r) => {
      const count = sectorEvaluations.filter(d => d.rating === r).length;
      acc[r] = total > 0 ? Math.round((count / total) * 100) : 0;
      acc[`${r}_count`] = count;
      return acc;
    }, {} as any);

    const positivePcnt = distribution['Ótimo'] + distribution['Bom'];
    
    let analysis = {
      title: "Desempenho Estável",
      text: "O setor apresenta indicadores dentro da média institucional. Recomenda-se manter o monitoramento padrão dos processos.",
      status: 'neutral' as 'success' | 'warning' | 'error' | 'neutral',
      icon: Info
    };

    if (total === 0) {
      analysis = { title: "Sem Dados", text: "Nenhum registro encontrado para este setor no período.", status: 'neutral', icon: ClipboardList };
    } else if (distribution['Ótimo'] >= 80) {
      analysis = { title: "Excelência Operacional", text: "O setor demonstra alto nível de satisfação, com forte predomínio de avaliações 'Ótimo'. Referência para os demais setores.", status: 'success', icon: ShieldCheck };
    } else if (positivePcnt >= 75) {
      analysis = { title: "Resultado Positivo", text: "A maioria dos usuários reportou experiências satisfatórias. O foco deve ser na conversão de 'Bom' para 'Ótimo'.", status: 'success', icon: CheckCircle2 };
    } else if (distribution['Ruim'] >= 15) {
      analysis = { title: "Alerta Crítico", text: "Índice de insatisfação acima do limite tolerável. Requer intervenção imediata e revisão dos processos de atendimento.", status: 'error', icon: AlertTriangle };
    } else if (distribution['Regular'] >= 30) {
      analysis = { title: "Necessidade de Melhoria", text: "Volume expressivo de avaliações 'Regular' indica inconsistência no serviço. Monitoramento intensivo solicitado.", status: 'warning', icon: AlertCircle };
    }

    return {
      sector: sectorName,
      total,
      ...distribution,
      analysis
    };
  });

  const last6Months = eachMonthOfInterval({
    start: subMonths(new Date(), 5),
    end: new Date()
  });

  const evolutionData = last6Months.map(monthDate => {
    const month = monthDate.getMonth();
    const year = monthDate.getFullYear();
    const monthRecords = rawData.filter(d => d.date.getMonth() === month && d.date.getFullYear() === year);
    const total = monthRecords.length;
    const positive = monthRecords.filter(d => d.rating === 'Ótimo' || d.rating === 'Bom').length;
    return {
      name: format(monthDate, 'MMM', { locale: ptBR }),
      satisfacao: total > 0 ? Math.round((positive / total) * 100) : 0
    };
  });

  const totalEvaluations = filteredData.length;
  const positivePcnt = totalEvaluations > 0 
    ? Math.round(((ratingCounts['Ótimo'] + ratingCounts['Bom']) / totalEvaluations) * 100) 
    : 0;
    
  const negativePcnt = totalEvaluations > 0
    ? Math.round((ratingCounts['Ruim'] / totalEvaluations) * 100)
    : 0;

  const exportPDF = async () => {
    if (!reportsRef.current) return;
    setIsExporting(true);
    setExportProgress(5);
    
    try {
      // Delay para garantir que a UI está estável e os gráficos carregados
      await new Promise(resolve => setTimeout(resolve, 800));
      setExportProgress(15);

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const contentWidth = pdfWidth - (2 * margin);
      
      // Busca todas as seções marcadas prioritárias para o PDF
      const sections = Array.from(reportsRef.current.querySelectorAll('[data-report-section]')) as HTMLElement[];
      
      let currentY = margin;
      setExportProgress(25);

      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        
        // Captura a seção individualmente
        const sectionImg = await toJpeg(section, {
          quality: 0.95,
          backgroundColor: "#f8fafc",
          pixelRatio: 2,
        });

        // Calcula a altura da imagem proporcional à largura do PDF
        const imgProps = pdf.getImageProperties(sectionImg);
        const sectionHeightMm = (imgProps.height * contentWidth) / imgProps.width;

        // Verifica se cabe na página atual
        if (currentY + sectionHeightMm > pdfHeight - margin) {
          pdf.addPage();
          currentY = margin;
          
          // Se for uma página nova e tivermos um "PDF Header" fixo, poderíamos repetir ele aqui
        }

        pdf.addImage(sectionImg, 'JPEG', margin, currentY, contentWidth, sectionHeightMm, undefined, 'FAST');
        currentY += sectionHeightMm + 8; // Espaçamento entre seções no PDF

        setExportProgress(25 + Math.round(((i + 1) / sections.length) * 70));
      }
      
      setExportProgress(100);
      const fileName = `Relatorio_Policlinica_${selectedMonth + 1}_${selectedYear}.pdf`;
      pdf.save(fileName);
    } catch (error: any) {
      console.error("Export error logic:", error);
      alert("Erro ao exportar PDF. Tente novamente em alguns instantes.");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const filteredForms = formsData.filter(f => 
    f.date.getMonth() === selectedMonth && f.date.getFullYear() === selectedYear
  );

  // NPS Calculation
  const scores = filteredForms.map(f => f.recommendationScore).filter(s => s !== undefined);
  const totalScores = scores.length;
  const detractors = scores.filter(s => s <= 6).length;
  const passives = scores.filter(s => s >= 7 && s <= 8).length;
  const promoters = scores.filter(s => s >= 9).length;
  
  const detractorsPcnt = totalScores > 0 ? Math.round((detractors / totalScores) * 100) : 0;
  const passivesPcnt = totalScores > 0 ? Math.round((passives / totalScores) * 100) : 0;
  const promotersPcnt = totalScores > 0 ? Math.round((promoters / totalScores) * 100) : 0;
  
  const npsScore = promotersPcnt - detractorsPcnt;
  
  const getNpsLabel = (score: number) => {
    if (score >= 75) return { label: "Excelente", color: "text-emerald-600", bg: "bg-emerald-50" };
    if (score >= 50) return { label: "Muito Bom", color: "text-blue-600", bg: "bg-blue-50" };
    if (score >= 0) return { label: "Razoável", color: "text-amber-600", bg: "bg-amber-50" };
    return { label: "Crítico", color: "text-rose-600", bg: "bg-rose-50" };
  };

  const npsInfo = getNpsLabel(npsScore);

  const npsHistory = last6Months.map(monthDate => {
    const month = monthDate.getMonth();
    const year = monthDate.getFullYear();
    const monthForms = formsData.filter(f => f.date.getMonth() === month && f.date.getFullYear() === year);
    const mScores = monthForms.map(f => f.recommendationScore).filter(s => s !== undefined);
    const mTotal = mScores.length;
    if (mTotal === 0) return { name: format(monthDate, 'MMM', { locale: ptBR }), nps: 0 };
    
    const mDetractors = mScores.filter(s => s <= 6).length;
    const mPromoters = mScores.filter(s => s >= 9).length;
    const mNps = Math.round(((mPromoters / mTotal) * 100) - ((mDetractors / mTotal) * 100));
    
    return {
      name: format(monthDate, 'MMM', { locale: ptBR }),
      nps: mNps
    };
  });

  const handleGenerateAI = async () => {
    setIsGeneratingAi(true);
    setChatMessages([]);
    try {
      const dataForAI: ReportData = {
        monthName: format(new Date(selectedYear, selectedMonth), 'MMMM', { locale: ptBR }),
        year: selectedYear,
        totalEvaluations,
        npsScore: totalScores > 0 ? npsScore : 0,
        npsStatus: npsInfo.label,
        technicalQuality: `${positivePcnt}%`,
        sectorStats: detailedSectorStats.map(s => ({
          sector: s.sector,
          total: s.total,
          otimo: s['Ótimo'],
          bom: s['Bom'],
          regular: s['Regular'],
          ruim: s['Ruim'],
          naoInformou: s['Não informou'],
          approval: s['Ótimo'] + s['Bom']
        })),
        comments: filteredData.filter(d => d.comment && d.comment.trim() !== '').map(d => d.comment)
      };

      const result = await generateReportAnalysis(dataForAI);
      setAiAnalysis(result);
      setEditedAnalysis(result);
      setChatMessages([
        { 
          role: 'model', 
          text: `Olá Ouvidor! Gerei a análise inteligente inicial com base nos dados reais deste mês. Como podemos aprimorar este relatório? Você pode me dar orientações para adaptarmos os textos ao Procedimento Operacional Padrão (POP) da Policlínica!` 
        }
      ]);
    } catch (error) {
      alert("Erro ao gerar análise. Verifique sua conexão e tente novamente.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSendChatMessage = async (e?: FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const promptToSend = customPrompt || userChatInput;
    if (!promptToSend.trim() || isSendingChat || !aiAnalysis) return;

    const userMsg = promptToSend.trim();
    if (!customPrompt) {
      setUserChatInput('');
    }

    const newUserMsgRecord: ChatMessage = { role: 'user', text: userMsg };
    const updatedHistory = [...chatMessages, newUserMsgRecord];
    setChatMessages(updatedHistory);
    setIsSendingChat(true);

    try {
      const dataForAI: ReportData = {
        monthName: format(new Date(selectedYear, selectedMonth), 'MMMM', { locale: ptBR }),
        year: selectedYear,
        totalEvaluations,
        npsScore: totalScores > 0 ? npsScore : 0,
        npsStatus: npsInfo.label,
        technicalQuality: `${positivePcnt}%`,
        sectorStats: detailedSectorStats.map(s => ({
          sector: s.sector,
          total: s.total,
          otimo: s['Ótimo'],
          bom: s['Bom'],
          regular: s['Regular'],
          ruim: s['Ruim'],
          naoInformou: s['Não informou'],
          approval: s['Ótimo'] + s['Bom']
        })),
        comments: filteredData.filter(d => d.comment && d.comment.trim() !== '').map(d => d.comment)
      };

      const result = await refineReportAnalysis(
        dataForAI,
        editedAnalysis || aiAnalysis, // use the edited/current state
        chatMessages,
        userMsg
      );

      setAiAnalysis(result.updatedAnalysis);
      setEditedAnalysis(result.updatedAnalysis);
      setChatMessages(prev => [...prev, { role: 'model', text: result.assistantReply }]);
    } catch (error) {
      console.error("Erro ao refinar análise de relatório:", error);
      alert("Erro ao receber resposta do assistente. Tente novamente.");
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleSaveAI = () => {
    setAiAnalysis(editedAnalysis);
    setIsEditingAi(false);
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const months = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className={cn(
      "space-y-12 pb-20 transition-all duration-500", 
      isExporting && "pdf-export-active bg-[#f8fafc] p-12 max-w-[1200px] mx-auto shadow-2xl rounded-[4rem]"
    )} ref={reportsRef}>
      {/* Progress Bar for Export */}
      {isExporting && (
        <div className="fixed top-0 left-0 w-full h-1.5 bg-slate-100 z-[100] no-print">
          <div 
            className="h-full bg-blue-600 transition-all duration-300" 
            style={{ width: `${exportProgress}%` }} 
          />
        </div>
      )}

      {/* Header & Controls */}
      <div className={cn("flex flex-col md:flex-row gap-6 items-center justify-between no-print", isExporting && "hidden")}>
        <div className="flex items-center gap-4 bg-white p-2.5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 px-4 text-slate-400">
            <Filter className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Filtros Avançados</span>
          </div>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="bg-slate-50 border-none text-sm font-bold text-slate-700 py-2.5 px-5 rounded-2xl focus:ring-0 cursor-pointer"
          >
            {months.map(m => (
              <option key={m} value={m}>{format(new Date(2000, m), 'MMMM', { locale: ptBR })}</option>
            ))}
          </select>
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="bg-slate-50 border-none text-sm font-bold text-slate-700 py-2.5 px-5 rounded-2xl focus:ring-0 cursor-pointer"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <button 
          onClick={exportPDF}
          disabled={isExporting}
          className="flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-3xl font-bold text-sm hover:bg-black transition-all shadow-xl active:scale-95 disabled:opacity-50"
        >
          {isExporting ? <span className="animate-pulse">Gerando...</span> : <><Download className="w-5 h-5" /> Exportar PDF Profissional</>}
        </button>
      </div>

      {/* PDF Header */}
      <div className={cn("hidden", isExporting && "block pb-10 border-b-4 border-slate-900")} data-report-section>
         <div className="flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-black text-slate-900 leading-none mb-3">Relatório Analítico de Gestão</h1>
              <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-sm">
                Setor de Ouvidoria • {format(new Date(selectedYear, selectedMonth), 'MMMM / yyyy', { locale: ptBR })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Doc. Oficial Interno</p>
              <p className="text-base font-bold text-slate-900">Policlínica Bernardo Félix da Silva</p>
            </div>
         </div>
      </div>

      {/* Stats Summary for Reports */}
      <div className={cn("grid grid-cols-1 md:grid-cols-4 gap-6", isExporting && "grid-cols-4")} data-report-section>
        <StatCard title="Total no Mês" value={totalEvaluations} icon={BarChart3} color="blue" isExporting={isExporting} />
        <StatCard title="Qualidade Técnica" value={`${positivePcnt}%`} subtitle="Ótimo + Bom" icon={ShieldCheck} color="emerald" isExporting={isExporting} />
        <StatCard 
          title="NPS Score" 
          value={totalScores > 0 ? npsScore : '--'} 
          subtitle={npsInfo.label} 
          icon={TrendingUp} 
          color={npsScore >= 50 ? "emerald" : npsScore >= 0 ? "amber" : "rose"} 
          isExporting={isExporting}
        />
        <StatCard title="Total Amostras" value={formsCount} icon={ClipboardList} color="amber" subtitle="Formulários Físicos" isExporting={isExporting} />
      </div>

      {/* AI Assistant Section */}
      <div 
        className={cn(
          "bg-white p-10 md:p-14 rounded-[3.5rem] border border-slate-200 shadow-sm space-y-12 relative overflow-hidden", 
          isExporting && "rounded-3xl p-8 page-break-avoid border-2"
        )}
        data-report-section
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-50/50 rounded-full blur-3xl -mr-48 -mt-48 opacity-30 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-indigo-200">
               <Bot className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Assistente Institucional IA</h2>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">Análise Técnica e Geração de Texto para o Ouvidor</p>
            </div>
          </div>
          
          <div className="no-print">
            {!aiAnalysis ? (
              <button 
                onClick={handleGenerateAI}
                disabled={isGeneratingAi || totalEvaluations === 0}
                className="group flex items-center gap-3 bg-indigo-600 text-white px-8 py-4 rounded-3xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50 active:scale-95"
              >
                {isGeneratingAi ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5 group-hover:animate-pulse" />
                )}
                Gerar Análise Inteligente
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsEditingAi(!isEditingAi)}
                  className="flex items-center gap-2 bg-slate-50 text-slate-600 px-6 py-3 rounded-2xl font-bold text-xs hover:bg-slate-100 transition-all border border-slate-200"
                >
                  {isEditingAi ? 'Cancelar Edição' : 'Editar Texto'}
                </button>
                <button 
                  onClick={handleGenerateAI}
                  disabled={isGeneratingAi}
                  className="flex items-center justify-center w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-100 transition-all border border-indigo-100"
                  title="Regerar análise"
                >
                  <RefreshCw className={cn("w-5 h-5", isGeneratingAi && "animate-spin")} />
                </button>
                {isEditingAi && (
                  <button 
                    onClick={handleSaveAI}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                  >
                    <Save className="w-4 h-4" /> Salvar Alterações
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {!aiAnalysis && !isGeneratingAi ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 bg-slate-50/50 rounded-[3rem] border border-dashed border-slate-200">
             <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-slate-200 shadow-inner">
                <FileText className="w-10 h-10" />
             </div>
             <div className="max-w-md">
                <h4 className="text-slate-900 font-black text-xl mb-2">Aguardando Geração</h4>
                <p className="text-slate-400 text-sm font-medium leading-relaxed">Clique no botão acima para que a inteligência analise os indicadores e comentários deste período e sugira textos para o relatório.</p>
             </div>
          </div>
        ) : isGeneratingAi ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-8 bg-slate-900 rounded-[3rem] text-white">
             <div className="relative">
                <div className="w-20 h-20 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                <Bot className="w-8 h-8 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse text-indigo-400" />
             </div>
             <div className="space-y-3">
                <h4 className="text-2xl font-black tracking-tight">Processando Indicadores Mensais</h4>
                <p className="text-indigo-200/60 text-xs font-bold uppercase tracking-[0.3em]">IA está aprendendo o padrão institucional...</p>
                <div className="flex gap-2 justify-center pt-4">
                   <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                   <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                   <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                </div>
             </div>
          </div>
        ) : (
          <div className="space-y-12 animate-in fade-in duration-1000">
            {/* Resumo Geral */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-indigo-600">
                 <Sparkles className="w-5 h-5" />
                 <h4 className="text-[10px] font-black uppercase tracking-widest">Resumo Institucional</h4>
              </div>
              {isEditingAi ? (
                <textarea 
                  value={editedAnalysis?.summary}
                  onChange={(e) => setEditedAnalysis({...editedAnalysis!, summary: e.target.value})}
                  className="w-full min-h-[120px] p-6 bg-slate-50 border border-slate-200 rounded-3xl text-slate-700 text-lg font-medium leading-relaxed focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              ) : (
                <p className="text-slate-700 text-xl font-medium leading-relaxed border-l-4 border-indigo-100 pl-8 ml-2">
                  {aiAnalysis?.summary}
                </p>
              )}
            </div>

            {/* Alertas e Destaques */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="bg-emerald-50/50 p-8 rounded-[2.5rem] border border-emerald-100 space-y-6">
                  <div className="flex items-center gap-3 text-emerald-600">
                     <CheckCircle2 className="w-5 h-5" />
                     <h4 className="text-[10px] font-black uppercase tracking-widest">Pontos Positivos</h4>
                  </div>
                  <ul className="space-y-3">
                     {(isEditingAi ? editedAnalysis?.positivePoints : aiAnalysis?.positivePoints)?.map((point, i) => (
                       <li key={i} className="flex items-start gap-3">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
                          <span className="text-slate-700 text-sm font-medium">{point}</span>
                       </li>
                     ))}
                  </ul>
               </div>

               <div className="bg-rose-50/50 p-8 rounded-[2.5rem] border border-rose-100 space-y-6">
                  <div className="flex items-center gap-3 text-rose-600">
                     <AlertTriangle className="w-5 h-5" />
                     <h4 className="text-[10px] font-black uppercase tracking-widest">Alertas Críticos</h4>
                  </div>
                  <ul className="space-y-3">
                     {(isEditingAi ? editedAnalysis?.criticalAlerts : aiAnalysis?.criticalAlerts)?.map((alert, i) => (
                       <li key={i} className="flex items-start gap-3">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 shrink-0" />
                          <span className="text-slate-700 text-sm font-medium">{alert}</span>
                       </li>
                     ))}
                  </ul>
               </div>
            </div>

            {/* Oportunidades de Melhoria */}
            <div className="bg-slate-900 p-10 rounded-[3rem] text-white space-y-6 relative overflow-hidden">
               <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-32 -mt-32" />
               <div className="flex items-center gap-3 text-indigo-400 relative z-10">
                  <TrendingUp className="w-5 h-5" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest">Oportunidades de Melhoria e Ações Estratégicas</h4>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 relative z-10">
                  {(isEditingAi ? editedAnalysis?.improvementOpportunities : aiAnalysis?.improvementOpportunities)?.map((op, i) => (
                    <div key={i} className="flex items-start gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                       <span className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px] font-black shrink-0">{i+1}</span>
                       <p className="text-slate-300 text-sm font-medium">{op}</p>
                    </div>
                  ))}
               </div>
            </div>

            {/* Conclusão */}
            <div className="bg-indigo-50 p-10 rounded-[3rem] border border-indigo-100 space-y-6">
               <div className="flex items-center gap-3 text-indigo-600">
                  <ClipboardList className="w-5 h-5" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest">Conclusão Institucional</h4>
               </div>
               {isEditingAi ? (
                 <textarea 
                   value={editedAnalysis?.conclusion}
                   onChange={(e) => setEditedAnalysis({...editedAnalysis!, conclusion: e.target.value})}
                   className="w-full min-h-[100px] p-6 bg-white border border-indigo-200 rounded-3xl text-slate-700 text-base font-medium leading-relaxed focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner"
                 />
               ) : (
                 <p className="text-slate-700 text-lg font-bold leading-relaxed italic">
                    "{aiAnalysis?.conclusion}"
                 </p>
               )}
            </div>

            {/* Campo de Conversa Colaborativo (Ouvidor <-> IA) */}
            <div className="border-t border-slate-200/60 pt-10 mt-10 space-y-6 no-print">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <Bot className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Conversar com o Assistente de IA</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">Refine o relatório de Ouvidoria em colaboração e alinhe aos POPs</p>
                </div>
              </div>

              <div className="bg-slate-50/50 rounded-[2.5rem] border border-slate-200 p-6 md:p-8 space-y-6">
                {/* Janela de Mensagens */}
                <div className="h-[280px] overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                  {chatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <Bot className="w-10 h-10 mb-2 opacity-35" />
                      <p className="text-sm font-bold">Nenhuma conversa iniciada.</p>
                      <p className="text-xs max-w-sm mt-1">Escreva abaixo ou use as sugestões de ajuste rápido para começar a lapidar o relatório.</p>
                    </div>
                  ) : (
                    chatMessages.map((msg, index) => (
                      <div key={index} className={cn("flex gap-3 max-w-[85%] items-start", msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto")}>
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 shadow-sm",
                          msg.role === 'user' ? "bg-slate-900 text-white" : "bg-indigo-600 text-white"
                        )}>
                          {msg.role === 'user' ? 'OU' : <Bot className="w-4 h-4" />}
                        </div>
                        <div className={cn(
                          "p-4 rounded-3xl text-sm font-medium leading-relaxed shadow-sm",
                          msg.role === 'user' 
                            ? "bg-slate-900 text-slate-100 rounded-tr-none" 
                            : "bg-white text-slate-800 rounded-tl-none border border-slate-200"
                        )}>
                          {msg.text}
                        </div>
                      </div>
                    ))
                  )}
                  {isSendingChat && (
                    <div className="flex gap-3 items-start max-w-[80%] mr-auto animate-pulse">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4 animate-spin" />
                      </div>
                      <div className="bg-white text-slate-500 p-4 rounded-3xl rounded-tl-none border border-slate-200 text-xs italic font-bold">
                        A IA está revisando e atualizando os campos do relatório...
                      </div>
                    </div>
                  )}
                </div>

                {/* Sugestões Rápidas (Pills) */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Ajustes de Procedimento (POP) e Estilo:</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Adicionar orientações do POP de Triagem de Fluxo",
                      "Adicionar fluxos do POP de Segurança da Recepção",
                      "Tornar o tom do Resumo mais executivo",
                      "Enfatizar acolhimento humanizado do SUS nos setores"
                    ].map((pillText) => (
                      <button
                        key={pillText}
                        type="button"
                        onClick={(e) => handleSendChatMessage(e, pillText)}
                        disabled={isSendingChat || !aiAnalysis}
                        className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 px-4 py-2.5 rounded-full transition-all disabled:opacity-50 active:scale-95 text-left cursor-pointer"
                      >
                        + {pillText}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input Formulário */}
                <form onSubmit={(e) => handleSendChatMessage(e)} className="flex gap-3">
                  <input
                    type="text"
                    value={userChatInput}
                    onChange={(e) => setUserChatInput(e.target.value)}
                    disabled={isSendingChat || !aiAnalysis}
                    placeholder="Escreva como prefere ajustar (ex: 'Destaque que o setor de Triagem seguiu as diretrizes do POP de acolhimento')"
                    className="flex-1 bg-white border border-slate-200 rounded-2xl py-4 px-6 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                  />
                  <button
                    type="submit"
                    disabled={isSendingChat || !userChatInput.trim() || !aiAnalysis}
                    className="bg-indigo-600 text-white px-6 rounded-2xl font-bold flex items-center justify-center hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    <Send className="w-5 h-5 shrink-0" />
                  </button>
                </form>
              </div>
            </div>
            
            <div className="flex justify-end pt-4 no-print">
               <div className="flex items-center gap-3 bg-slate-50 px-6 py-3 rounded-full border border-slate-100">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Análise finalizada e pronta para revisão do ouvidor</span>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* NPS Deep Analysis Section */}
      <div 
        className={cn("bg-white p-10 md:p-14 rounded-[3rem] border border-slate-200 shadow-sm space-y-12", 
        isExporting && "rounded-none border-none p-0 space-y-8")}
        data-report-section
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
           <div className="flex items-center gap-5">
              <div className="p-4 bg-slate-900 text-white rounded-3xl shadow-lg">
                <TrendingUp className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Análise de Lealdade (NPS)</h2>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mt-1">Net Promoter Score • Indicador de Recomendação</p>
              </div>
           </div>
           <div className={cn("px-8 py-4 rounded-3xl border-2 flex items-center gap-4", npsInfo.bg, npsInfo.color.replace('text', 'border'))}>
              <div className="text-center">
                 <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Zona de Classificação</p>
                 <p className="text-2xl font-black">{npsInfo.label}</p>
              </div>
           </div>
        </div>

        <div className={cn("grid grid-cols-1 lg:grid-cols-3 gap-12 items-center", isExporting && "grid-cols-3 gap-8")}>
          <div className="lg:col-span-1 space-y-8">
             <div className="space-y-4">
                <div className="flex justify-between items-end">
                   <span className="text-xs font-black text-emerald-600 uppercase">Promotores (9-10)</span>
                   <span className="text-2xl font-black text-slate-900">{promotersPcnt}%</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                   <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${promotersPcnt}%` }} />
                </div>
             </div>
             <div className="space-y-4">
                <div className="flex justify-between items-end">
                   <span className="text-xs font-black text-amber-600 uppercase">Passivos (7-8)</span>
                   <span className="text-2xl font-black text-slate-900">{passivesPcnt}%</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                   <div className="h-full bg-amber-500 rounded-full" style={{ width: `${passivesPcnt}%` }} />
                </div>
             </div>
             <div className="space-y-4">
                <div className="flex justify-between items-end">
                   <span className="text-xs font-black text-rose-600 uppercase">Detratores (0-6)</span>
                   <span className="text-2xl font-black text-slate-900">{detractorsPcnt}%</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                   <div className="h-full bg-rose-500 rounded-full" style={{ width: `${detractorsPcnt}%` }} />
                </div>
             </div>
          </div>

          <div className={cn("lg:col-span-2 h-72 bg-slate-50/50 rounded-[2.5rem] p-8 border border-slate-100", isExporting && "col-span-2 rounded-2xl h-64")}>
             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 px-2">Evolução do NPS Mensal</h4>
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={npsHistory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                   <XAxis dataKey="name" fontSize={10} fontWeight={800} axisLine={false} tickLine={false} />
                   <YAxis fontSize={10} fontWeight={800} axisLine={false} tickLine={false} domain={[-100, 100]} ticks={[-100, 0, 100]} />
                   <Tooltip content={<CustomTooltip label="Mês" unit="" />} cursor={{ fill: '#000', opacity: 0.05 }} />
                   <Bar dataKey="nps" name="NPS" radius={[6, 6, 6, 6]} barSize={40}>
                      {npsHistory.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.nps >= 75 ? '#10b981' : entry.nps >= 50 ? '#3b82f6' : entry.nps >= 0 ? '#f59e0b' : '#ef4444'} />
                      ))}
                   </Bar>
                </BarChart>
             </ResponsiveContainer>
          </div>
        </div>
        
        <div className={cn("p-8 bg-slate-900 rounded-[2.5rem] flex items-center gap-8 text-white relative overflow-hidden shadow-2xl", isExporting && "p-6 rounded-2xl")}>
           <div className="absolute right-0 top-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
           <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
             <Info className="w-8 h-8 text-white" />
           </div>
           <div className="space-y-2 relative z-10">
              <h5 className="font-black text-lg uppercase tracking-tight">Análise de Redes e Recomendações</h5>
              <p className="text-slate-300 text-sm leading-relaxed font-medium">
                O **Net Promoter Score (NPS)** é o padrão global para monitorar a satisfação. Scores acima de 75 são considerados de **Excelência**, enquanto scores negativos indicam **Crise de Imagem**. Monitorar este índice mensalmente permite identificar tendências antes que se tornem problemas estruturais.
              </p>
           </div>
        </div>
      </div>

      {/* Main Analysis Chart Layer */}
      <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-8", isExporting && "grid-cols-2")} data-report-section>
        <div className={cn("bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col", isExporting && "rounded-3xl p-6")}>
          <div className="flex items-center gap-4 mb-10">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
              <PieChartIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-xl tracking-tight">Composição de Média</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Distribuição geral de notas</p>
            </div>
          </div>
          <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-8 items-center flex-1", isExporting && "grid-cols-2")}>
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={RATINGS.map(r => ({ name: r, value: ratingCounts[r] })).filter(d => d.value > 0)}
                    cx="50%" cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {RATINGS.map((r) => (
                      <Cell key={r} fill={RATING_HEX[r]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip label="Categoria" />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="space-y-4 pr-2">
              {RATINGS.map(r => {
                const count = ratingCounts[r];
                const percentage = totalEvaluations > 0 ? Math.round((count / totalEvaluations) * 100) : 0;

                return (
                  <div key={r} className="space-y-2">
                    <div className="flex justify-between items-end">
                       <div className="flex items-center gap-2.5">
                          <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: RATING_HEX[r] }} />
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{r}</span>
                       </div>
                       <div className="flex items-baseline gap-2">
                          <span className="text-[10px] font-bold text-slate-300">{count}</span>
                          <span className="text-base font-black text-slate-900 leading-none">{percentage}%</span>
                       </div>
                    </div>
                    <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100/50">
                       <div 
                         className="h-full rounded-full transition-all duration-1000 shadow-sm" 
                         style={{ 
                           width: `${percentage}%`, 
                           backgroundColor: RATING_HEX[r],
                           boxShadow: `0 0 10px ${RATING_HEX[r]}22` 
                         }} 
                       />
                    </div>
                  </div>
                );
              })}
              <div className="pt-4 border-t border-slate-50 mt-4">
                 <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <span>Amostra Total</span>
                    <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full">{totalEvaluations} Avaliações</span>
                 </div>
              </div>
            </div>
          </div>
        </div>

          <div className={cn("bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm", isExporting && "rounded-3xl p-6 h-[400px]")}>
          <div className="flex items-center gap-4 mb-10">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-xl">Indicador Histórico</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Satisfação últimos 6 meses</p>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolutionData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                   <linearGradient id="colorSat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                   </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} dy={15} fontWeight={800} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} fontWeight={800} ticks={[0, 50, 100]} />
                <Tooltip content={<CustomTooltip label="Mês" suffix="%" />} />
                <Area type="monotone" dataKey="satisfacao" name="Satisfação" stroke="#10b981" strokeWidth={5} fillOpacity={1} fill="url(#colorSat)" dot={{ r: 7, fill: '#10b981', strokeWidth: 3, stroke: '#fff' }} activeDot={{ r: 9 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Reports Per Sector */}
      <div className="space-y-12">
        <div className="flex items-center gap-4 px-4" data-report-section>
           <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-xl">
             <FileText className="w-6 h-6" />
           </div>
           <div>
             <h2 className="text-2xl font-black text-slate-900">Detalhamento por Unidade/Setor</h2>
             <p className="text-sm text-slate-400 font-bold uppercase tracking-[0.15em]">Análise técnica e comparativa institucional</p>
           </div>
        </div>

        <div className={cn("grid grid-cols-1 gap-12", isExporting && "gap-8")}>
          {detailedSectorStats.map((stat) => (
            <div key={stat.sector} data-report-section className={cn("group bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-16 items-stretch hover:border-slate-400 transition-all", isExporting && "rounded-3xl p-8 gap-8 border-slate-200 page-break-avoid")}>
              <div className="flex-1 space-y-8">
                <div className="flex justify-between items-end">
                   <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Amostra Local: {stat.total} Unidades</h4>
                      <h3 className="text-3xl font-black text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors uppercase">{stat.sector}</h3>
                   </div>
                   <div className="text-right bg-slate-50 px-5 py-2 rounded-2xl border border-slate-100">
                      <span className="text-4xl font-black text-slate-900 leading-none">{stat.Ótimo + stat.Bom}%</span>
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-tighter mt-1">Aprovação Setorial</p>
                   </div>
                </div>

                <div className="h-32 w-full lg:px-2">
                  {stat.total > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[stat]} layout="vertical" barSize={50} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <XAxis type="number" hide domain={[0, 100]} />
                        <YAxis type="category" hide dataKey="sector" />
                        <Tooltip content={<CustomTooltip label="Métrica" suffix="%" />} cursor={{fill: 'transparent'}} />
                        <Bar dataKey="Ótimo" name="Ótimo" stackId="a" fill={RATING_HEX["Ótimo"]} radius={[8, 0, 0, 8]} />
                        <Bar dataKey="Bom" name="Bom" stackId="a" fill={RATING_HEX["Bom"]} />
                        <Bar dataKey="Regular" name="Regular" stackId="a" fill={RATING_HEX["Regular"]} />
                        <Bar dataKey="Ruim" name="Ruim" stackId="a" fill={RATING_HEX["Ruim"]} />
                        <Bar dataKey="Não informou" name="Não informou" stackId="a" fill={RATING_HEX["Não informou"]} radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full w-full bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-3xl flex items-center justify-center italic text-slate-400 text-sm">
                      Setor sem amostragem registrada no período...
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 pt-4">
                   {RATINGS.map(r => (
                     <div key={r} className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50 text-center">
                        <p className={cn("text-[9px] font-black uppercase tracking-tighter mb-1", 
                          r === 'Ótimo' ? "text-emerald-600" : 
                          r === 'Bom' ? "text-blue-600" :
                          r === 'Regular' ? "text-amber-600" :
                          r === 'Ruim' ? "text-rose-600" : "text-slate-500"
                        )}>{r}</p>
                        <p className="text-lg font-black text-slate-900 leading-none">{stat[r]}%</p>
                     </div>
                   ))}
                </div>
              </div>

              <div className="w-full lg:w-[26rem] shrink-0 bg-slate-50/80 rounded-[2rem] p-10 border border-slate-100 flex flex-col justify-between relative overflow-hidden">
                 <div className="space-y-6 relative z-10">
                    <div className="flex items-center gap-4">
                       <div className={cn(
                         "w-14 h-14 rounded-2xl flex items-center justify-center shadow-md",
                         stat.analysis.status === 'success' ? "bg-emerald-500 text-white" :
                         stat.analysis.status === 'error' ? "bg-rose-500 text-white" :
                         stat.analysis.status === 'warning' ? "bg-amber-500 text-white" : "bg-slate-400 text-white"
                       )}>
                          <stat.analysis.icon className="w-7 h-7" />
                       </div>
                       <div>
                         <h5 className="font-black text-slate-900 text-lg leading-tight uppercase tracking-tight">{stat.analysis.title}</h5>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Laudo Institucional</p>
                       </div>
                    </div>
                    <p className="text-slate-600 text-sm leading-relaxed font-medium italic">
                       "{stat.analysis.text}"
                    </p>
                 </div>

                 <div className="mt-10 pt-6 border-t border-slate-200 flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3">
                       <ShieldCheck className="w-4 h-4 text-slate-300" />
                       <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Validado pela Ouvidoria</span>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-200" />
                 </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, subtitle, isExporting }: any) {
  const colors: any = {
    blue: "bg-blue-600 text-blue-600 ring-blue-50",
    emerald: "bg-emerald-600 text-emerald-600 ring-emerald-50",
    amber: "bg-amber-600 text-amber-600 ring-amber-50",
    rose: "bg-rose-600 text-rose-600 ring-rose-50",
    slate: "bg-slate-700 text-slate-700 ring-slate-50",
  };
  const bgColors: any = { blue: "bg-blue-600", emerald: "bg-emerald-600", amber: "bg-amber-600", rose: "bg-rose-600", slate: "bg-slate-700" };

  return (
    <div className={cn(
      "bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm relative overflow-hidden group transition-all hover:border-slate-400 hover:shadow-xl",
      isExporting && "p-6 rounded-2xl border-2 shadow-none"
    )}>
      <div className={cn("absolute right-0 top-0 w-32 h-32 -mr-12 -mt-12 opacity-5 rounded-full transition-transform group-hover:scale-150 duration-700", bgColors[color])} />
      <div className={cn(
        "w-16 h-16 rounded-[1.5rem] flex items-center justify-center mb-8 ring-[14px] ring-opacity-20 shadow-2xl transition-transform group-hover:rotate-6", 
        colors[color],
        isExporting && "w-12 h-12 mb-4 ring-[8px] shadow-none"
      )}>
        <Icon className={cn("w-8 h-8 text-white", isExporting && "w-6 h-6")} />
      </div>
      <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.25em] mb-2">{title}</p>
      <h4 className={cn("text-5xl font-black text-slate-900 leading-none mb-2 tracking-tighter", isExporting && "text-3xl")}>{value}</h4>
      {subtitle && <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest leading-none border-l-2 border-slate-100 pl-3 mt-4">{subtitle}</p>}
    </div>
  );
}
