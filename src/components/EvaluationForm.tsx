import { useState, useEffect, FormEvent } from 'react';
import { collection, writeBatch, doc, serverTimestamp, Timestamp, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, getProfile } from '../lib/firebase';
import { RATINGS, RATING_COLORS, Rating, FIXED_SECTORS } from '../constants';
import { Calendar, MessageSquare, Send, CheckCircle2, RotateCcw, ClipboardList } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface EvaluationFormProps {
  onFinish?: () => void;
}

export function EvaluationForm({ onFinish }: EvaluationFormProps) {
  const [sectors, setSectors] = useState<string[]>([]);
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formObservation, setFormObservation] = useState('');
  const [recommendationScore, setRecommendationScore] = useState<number | null>(null);
  
  // State for all ratings: { [sectorName]: { rating, observation } }
  const [evaluations, setEvaluations] = useState<Record<string, { rating: Rating | '', observation: string }>>({});

  useEffect(() => {
    const q = query(
      collection(db, 'sectors'), 
      where('active', '==', true),
      orderBy('name', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbSectors = snapshot.docs.map(doc => doc.data().name as string);
      // Merge unique sectors
      const allSectors = Array.from(new Set([...FIXED_SECTORS, ...dbSectors])).sort();
      setSectors(allSectors);
      
      // Initialize state for new sectors
      setEvaluations(prev => {
        const next = { ...prev };
        allSectors.forEach(s => {
          if (!next[s]) next[s] = { rating: '', observation: '' };
        });
        return next;
      });
    }, (error) => {
      console.error("Error fetching sectors", error);
    });

    return () => unsubscribe();
  }, []);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const resetForm = () => {
    const clearedEvaluations: Record<string, { rating: Rating | '', observation: string }> = {};
    sectors.forEach(s => {
      clearedEvaluations[s] = { rating: '', observation: '' };
    });
    setEvaluations(clearedEvaluations);
    setFormObservation('');
    setRecommendationScore(null);
    // date stays the same as usually they enter a bunch from the same day
  };

  const updateEvaluation = (sector: string, rating: Rating, observation?: string) => {
    setEvaluations(prev => ({
      ...prev,
      [sector]: {
        ...prev[sector],
        rating: prev[sector].rating === rating ? '' : rating, // Toggle
        ...(observation !== undefined ? { observation } : {})
      }
    }));
  };

  const updateObservation = (sector: string, observation: string) => {
    setEvaluations(prev => ({
      ...prev,
      [sector]: {
        ...prev[sector],
        observation
      }
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    // Filter only sectors that have a rating
    const ratedSectors = (Object.entries(evaluations) as [string, { rating: Rating | '', observation: string }][])
      .filter(([_, data]) => data.rating !== '');
    
    if (ratedSectors.length === 0) {
      alert("Por favor, preencha pelo menos uma avaliação no formulário.");
      return;
    }

    if (recommendationScore === null) {
      alert("Por favor, preencha a nota de recomendação (0 a 10).");
      return;
    }

    setIsSubmitting(true);
    try {
      const p = await getProfile(auth.currentUser.uid);
      const creatorName = p?.name || auth.currentUser.displayName || auth.currentUser.email || 'Usuário';
      const timestampDate = Timestamp.fromDate(new Date(formDate + 'T12:00:00'));

      const batch = writeBatch(db);
      
      // 1. Create Survey Form
      const formRef = doc(collection(db, 'forms'));
      batch.set(formRef, {
        date: timestampDate,
        recommendationScore: recommendationScore,
        observation: formObservation.trim(),
        createdBy: auth.currentUser.uid,
        createdByName: creatorName,
        createdAt: serverTimestamp(),
      });

      // 2. Create Evaluation Items
      ratedSectors.forEach(([sectorName, data]) => {
        const itemRef = doc(collection(db, 'evaluations'));
        batch.set(itemRef, {
          formId: formRef.id,
          sector: sectorName,
          rating: data.rating,
          observation: data.observation.trim(),
          date: timestampDate,
          createdBy: auth.currentUser.uid,
          createdByName: creatorName,
          createdAt: serverTimestamp(),
        });
      });

      await batch.commit();
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        resetForm();
      }, 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'forms/evaluations');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2">
              <ClipboardList className="w-7 h-7 text-blue-600" />
              Lançar Formulário de Pesquisa
            </h2>
            <p className="text-slate-500 text-sm">Registro completo da pesquisa de satisfação.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Data da Pesquisa</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* NPS Score Selection */}
        <div className="px-8 py-6 border-b border-slate-100 bg-white">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">O quanto você indicaria a Policlínica Bernardo Félix da Silva?</h3>
              <p className="text-xs text-slate-500">Escala de 0 (improvável) a 10 (muito provável)</p>
            </div>
            <div className="flex flex-wrap gap-1 md:gap-2">
              {Array.from({ length: 11 }, (_, i) => i).map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setRecommendationScore(num)}
                  className={cn(
                    "w-10 h-10 md:w-12 md:h-12 rounded-xl text-sm font-black transition-all border-2 flex items-center justify-center",
                    recommendationScore === num
                      ? "bg-blue-600 border-transparent text-white shadow-lg scale-110"
                      : "bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300 hover:bg-white"
                  )}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/30 text-slate-500 text-[10px] uppercase font-bold tracking-widest border-b border-slate-100">
                <th className="px-6 py-4 w-64">Setor</th>
                <th className="px-6 py-4 text-center">Classificação</th>
                <th className="px-6 py-4">Observação Específica</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sectors.map((s) => (
                <tr key={s} className={cn(
                  "hover:bg-slate-50/50 transition-colors",
                  evaluations[s]?.rating ? "bg-blue-50/20" : ""
                )}>
                  <td className="px-6 py-4">
                    <span className="font-bold text-slate-700 text-sm">{s}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center gap-1.5">
                      {RATINGS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => updateEvaluation(s, r)}
                          title={r}
                          className={cn(
                            "w-10 h-10 rounded-lg text-[10px] font-bold transition-all border-2 flex items-center justify-center text-center",
                            evaluations[s]?.rating === r 
                              ? `${RATING_COLORS[r]} text-white border-transparent scale-110 shadow-sm`
                              : "bg-white border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50"
                          )}
                        >
                          {r.charAt(0)}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="relative group">
                      <MessageSquare className="absolute left-3 top-2.5 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                      <input
                        type="text"
                        value={evaluations[s]?.observation || ''}
                        onChange={(e) => updateObservation(s, e.target.value)}
                        placeholder="Adicione comentário se houver..."
                        className="w-full bg-slate-50/50 border border-transparent rounded-lg pl-9 pr-3 py-2 text-sm focus:bg-white focus:border-slate-200 focus:ring-2 focus:ring-blue-100 outline-none transition-all placeholder:text-slate-300"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50/30">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Observação Geral do Formulário</label>
              <textarea
                value={formObservation}
                onChange={(e) => setFormObservation(e.target.value)}
                placeholder="Ex e observações que se aplicam a todo o formulário..."
                className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 min-h-[100px] outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
              />
            </div>
            
            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-2xl border-2 border-slate-200 text-slate-500 font-bold hover:bg-slate-100 transition-all active:scale-95"
              >
                <RotateCcw className="w-5 h-5" />
                Limpar Formulário
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className={cn(
                  "flex-[2] flex items-center justify-center gap-3 py-4 px-6 rounded-2xl font-bold transition-all shadow-lg text-white active:scale-95 disabled:opacity-50",
                  success ? "bg-emerald-500 shadow-emerald-100" : "bg-blue-600 shadow-blue-100 hover:bg-blue-700"
                )}
              >
                {isSubmitting ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                    <RotateCcw className="w-5 h-5" />
                  </motion.div>
                ) : success ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
                {isSubmitting ? "Gravando Formulário..." : success ? "Gravado com Sucesso!" : "Finalizar e Salvar Formulário"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 rounded-3xl p-6 border border-amber-100 flex items-start gap-4">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
          <RotateCcw className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-amber-900 font-bold text-sm mb-1 uppercase tracking-wider">Modo de Produção</h4>
          <p className="text-amber-800 text-xs leading-relaxed">
            Este painel foi otimizado para o lançamento rápido do formulário físico. Utilize o botão da primeira letra da nota (Ó, B, R, R, N) para marcar rapidamente. Setores sem nota selecionada não serão registrados no banco de dados.
          </p>
        </div>
      </div>
    </div>
  );
}
