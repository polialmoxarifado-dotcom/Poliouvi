import { useState, useEffect } from 'react';
import { collection, writeBatch, doc, serverTimestamp, Timestamp, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { RATINGS, RATING_COLORS, Rating, FIXED_SECTORS } from '../constants';
import { Heart, Send, CheckCircle2, Star, MessageSquare, ClipboardCheck, AlertCircle, ArrowLeft, Loader2, Hospital } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export function PatientSurvey() {
  const [sectors, setSectors] = useState<string[]>(() => [...FIXED_SECTORS]);
  const [recommendationScore, setRecommendationScore] = useState<number | null>(null);
  const [evaluations, setEvaluations] = useState<Record<string, { rating: Rating | '', observation: string }>>(() => {
    const initial: Record<string, { rating: Rating | '', observation: string }> = {};
    FIXED_SECTORS.forEach(s => {
      initial[s] = { rating: '', observation: '' };
    });
    return initial;
  });
  const [formObservation, setFormObservation] = useState('');
  
  // Selection of sectors patient actually visited to keep it ultra friendly
  const [visitedSectors, setVisitedSectors] = useState<string[]>([]);
  const [step, setStep] = useState<'welcome' | 'nps' | 'sectors' | 'feedback' | 'success'>('welcome');
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Authenticate patient anonymously in the background
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        signInAnonymously(auth).catch((err) => {
          console.error("Anonymous authentication failed:", err);
          setAuthError("Não foi possível conectar com o servidor. Verifique sua conexão.");
        });
      }
    });

    return () => unsub();
  }, []);

  // Fetch active sectors
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'sectors'), 
      where('active', '==', true),
      orderBy('name', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbSectors = snapshot.docs.map(doc => doc.data().name as string);
      const allSectors = Array.from(new Set([...FIXED_SECTORS, ...dbSectors])).sort();
      setSectors(allSectors);
      
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
  }, [currentUser]);

  const handleToggleVisitedSector = (sector: string) => {
    setVisitedSectors(prev => 
      prev.includes(sector) 
        ? prev.filter(s => s !== sector) 
        : [...prev, sector]
    );
  };

  const updateEvaluationValue = (sector: string, rating: Rating) => {
    setEvaluations(prev => ({
      ...prev,
      [sector]: {
        ...prev[sector],
        rating: prev[sector].rating === rating ? '' : rating
      }
    }));
  };

  const updateEvaluationComment = (sector: string, comment: string) => {
    setEvaluations(prev => ({
      ...prev,
      [sector]: {
        ...prev[sector],
        observation: comment
      }
    }));
  };

  const handleSubmit = async () => {
    if (!currentUser) {
      alert("Aguardando conexão segura de rede. Tente enviar novamente em instantes.");
      return;
    }

    if (recommendationScore === null) {
      alert("Por favor, selecione uma nota de 0 a 10.");
      return;
    }

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      
      // Get only evaluated sectors that patient visited and scored
      const ratedSectors = visitedSectors.map(s => ({
        name: s,
        data: evaluations[s]
      })).filter(s => s.data && s.data.rating !== '');

      const formDate = new Date().toISOString().split('T')[0];
      const timestampDate = Timestamp.fromDate(new Date(formDate + 'T12:00:00'));

      // 1. Create Patient Submission Form Document
      const formRef = doc(collection(db, 'forms'));
      batch.set(formRef, {
        date: timestampDate,
        recommendationScore: recommendationScore,
        observation: formObservation.trim(),
        createdBy: currentUser.uid,
        createdByName: "Paciente (Portal)",
        createdAt: serverTimestamp(),
      });

      // 2. Create Evaluation Item Documents
      ratedSectors.forEach(({ name, data }) => {
        const itemRef = doc(collection(db, 'evaluations'));
        batch.set(itemRef, {
          formId: formRef.id,
          sector: name,
          rating: data.rating,
          observation: data.observation.trim(),
          date: timestampDate,
          createdBy: currentUser.uid,
          createdByName: "Paciente (Portal)",
          createdAt: serverTimestamp(),
        });
      });

      await batch.commit();
      setStep('success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'patient/evaluations');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestart = () => {
    setRecommendationScore(null);
    setVisitedSectors([]);
    setFormObservation('');
    const cleared: Record<string, { rating: Rating | '', observation: string }> = {};
    sectors.forEach(s => {
      cleared[s] = { rating: '', observation: '' };
    });
    setEvaluations(cleared);
    setStep('welcome');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50/50 flex flex-col justify-between py-8 px-4 font-sans select-none antialiased">
      {/* Upper Logo header */}
      <header className="max-w-2xl w-full mx-auto text-center mb-8">
        <div className="inline-flex items-center gap-3 bg-white px-6 py-3 rounded-full border border-blue-100 shadow-sm">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
            <Hospital className="w-5 h-5" />
          </div>
          <div className="text-left">
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-tight">Policlínica Bernardo Félix da Silva</h1>
            <p className="text-[10px] text-blue-600 font-extrabold uppercase tracking-widest">Pesquisa de Satisfação</p>
          </div>
        </div>
      </header>

      {/* Main Container Card with step transition */}
      <main className="max-w-2xl w-full mx-auto flex-1 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {step === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 text-center space-y-8"
            >
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <Heart className="w-10 h-10 animate-pulse text-blue-600" />
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Sua opinião é fundamental para nós!</h2>
                <p className="text-slate-500 leading-relaxed text-sm">
                  Queremos oferecer sempre o melhor atendimento. Esta pesquisa leva menos de 2 minutos e é inteiramente anônima.
                </p>
              </div>

              {authError && (
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 text-rose-600 text-xs text-left">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                onClick={() => setStep('nps')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-2xl transition-all shadow-xl shadow-blue-100 active:scale-95 text-base flex items-center justify-center gap-2"
              >
                Começar Pesquisa
              </button>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                Sua resposta ajuda na humanização do SUS
              </div>
            </motion.div>
          )}

          {step === 'nps' && (
            <motion.div
              key="nps"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 space-y-8"
            >
              <div className="space-y-2 text-center">
                <div className="text-[10px] bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full inline-block font-black uppercase tracking-widest mb-2">
                  Pergunta 1 de 3
                </div>
                <h2 className="text-xl font-black text-slate-800 leading-snug">
                  O quanto você indicaria a Policlínica Bernardo Félix da Silva para familiares e amigos?
                </h2>
                <p className="text-xs text-slate-400 font-bold">Responda numa escala de 0 (improvável) a 10 (recomendo muito)</p>
              </div>

              <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5">
                {Array.from({ length: 11 }, (_, i) => i).map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setRecommendationScore(num)}
                    className={cn(
                      "aspect-square rounded-2xl text-base font-black transition-all border-2 flex items-center justify-center",
                      recommendationScore === num
                        ? "bg-blue-600 border-transparent text-white shadow-lg scale-110"
                        : "bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-300 hover:bg-white"
                    )}
                  >
                    {num}
                  </button>
                ))}
              </div>

              <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
                <span>Não indicaria</span>
                <span>Indicaria com certeza</span>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  onClick={() => setStep('welcome')}
                  className="flex-1 py-4 px-6 border-2 border-slate-200 text-slate-500 font-black rounded-2xl hover:bg-slate-50 transition-all text-xs uppercase tracking-wider"
                >
                  Voltar
                </button>
                <button
                  onClick={() => setStep('sectors')}
                  disabled={recommendationScore === null}
                  className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-2xl transition-all shadow-xl shadow-blue-100 disabled:opacity-50 text-xs uppercase tracking-widest"
                >
                  Avançar
                </button>
              </div>
            </motion.div>
          )}

          {step === 'sectors' && (
            <motion.div
              key="sectors"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 space-y-8"
            >
              <div className="space-y-2 text-center border-b border-slate-100 pb-6">
                <div className="text-[10px] bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full inline-block font-black uppercase tracking-widest mb-2">
                  Pergunta 2 de 3
                </div>
                <h2 className="text-xl font-black text-slate-800">Quais setores você utilizou hoje?</h2>
                <p className="text-xs text-slate-400">Selecione todos os setores por onde você passou no atendimento</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                {sectors.map((s) => {
                  const isChecked = visitedSectors.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleToggleVisitedSector(s)}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-2xl border-2 text-left transition-all",
                        isChecked 
                          ? "border-blue-600 bg-blue-50/30 text-blue-900 shadow-md scale-[1.01]" 
                          : "border-slate-100 bg-slate-50/50 text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      <span className="font-extrabold text-sm text-slate-700">{s}</span>
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                        isChecked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"
                      )}>
                        {isChecked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-4 flex gap-4 border-t border-slate-100">
                <button
                  onClick={() => setStep('nps')}
                  className="flex-1 py-4 px-6 border-2 border-slate-200 text-slate-500 font-black rounded-2xl hover:bg-slate-50 transition-all text-xs uppercase tracking-wider"
                >
                  Voltar
                </button>
                <button
                  onClick={() => setStep('feedback')}
                  className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-2xl transition-all shadow-xl shadow-blue-100 disabled:opacity-50 text-xs uppercase tracking-widest"
                >
                  {visitedSectors.length === 0 ? "Pular Avaliação por Setor" : "Avaliar Setores Selecionados"}
                </button>
              </div>
            </motion.div>
          )}

          {step === 'feedback' && (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 space-y-8"
            >
              <div className="space-y-2 text-center border-b border-slate-100 pb-6">
                <div className="text-[10px] bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full inline-block font-black uppercase tracking-widest mb-2">
                  Pergunta 3 de 3
                </div>
                <h2 className="text-xl font-black text-slate-800">Como foi seu atendimento?</h2>
                <p className="text-xs text-slate-400">Classifique sua experiência e deixe comentários se desejar.</p>
              </div>

              {visitedSectors.length > 0 ? (
                <div className="space-y-6 max-h-96 overflow-y-auto pr-2">
                  {visitedSectors.map((s) => (
                    <div key={s} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-800 text-sm block">{s}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Classificação</span>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        {RATINGS.filter(r => r !== "Não informou").map((r) => {
                          const isSelected = evaluations[s]?.rating === r;
                          return (
                            <button
                              key={r}
                              type="button"
                              onClick={() => updateEvaluationValue(s, r)}
                              className={cn(
                                "py-2.5 px-1.5 rounded-xl text-xs font-black border-2 transition-all text-center",
                                isSelected
                                  ? `${RATING_COLORS[r]} text-white border-transparent shadow" font-black`
                                  : "bg-white border-slate-100 text-slate-500 hover:border-slate-200"
                              )}
                            >
                              {r}
                            </button>
                          );
                        })}
                      </div>

                      <div className="relative">
                        <MessageSquare className="absolute left-3.5 top-3 w-4 h-4 text-slate-300" />
                        <input
                          type="text"
                          value={evaluations[s]?.observation || ''}
                          onChange={(e) => updateEvaluationComment(s, e.target.value)}
                          placeholder="Deixe um comentário curto (opcional)..."
                          className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-100 focus:border-slate-350 transition-all placeholder:text-slate-300"
                        />
                      </div>
                    </div>
                  ))}

                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-black text-slate-600 uppercase tracking-widest pl-1">Alguma Observação Geral?</label>
                    <textarea
                      value={formObservation}
                      onChange={(e) => setFormObservation(e.target.value)}
                      placeholder="Espaço aberto para dúvidas, sugestões ou elogios gerais..."
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-4 py-3 min-h-[80px] text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-600 uppercase tracking-widest pl-1">Deixe sua Observação</label>
                    <textarea
                      value={formObservation}
                      onChange={(e) => setFormObservation(e.target.value)}
                      placeholder="Use este espaço para nos contar sobre sua experiência geral hoje..."
                      className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 min-h-[120px] text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 flex gap-4 border-t border-slate-100">
                <button
                  onClick={() => setStep('sectors')}
                  className="flex-1 py-4 px-6 border-2 border-slate-200 text-slate-500 font-black rounded-2xl hover:bg-slate-50 transition-all text-xs uppercase tracking-wider"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 px-6 rounded-2xl transition-all shadow-xl shadow-emerald-100 disabled:opacity-50 text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Gravando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Enviar Respostas
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 text-center space-y-8 py-14"
            >
              <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <ClipboardCheck className="w-10 h-10 animate-bounce text-emerald-600" />
              </div>
              
              <div className="space-y-3">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Obrigado pela sua contribuição!</h2>
                <p className="text-slate-500 leading-relaxed text-sm max-w-sm mx-auto">
                  Sua resposta foi registrada com sucesso e de forma totalmente anônima. Ela ajudará na humanização e na melhoria dos serviços da Policlínica Bernardo Félix da Silva.
                </p>
              </div>

              <div className="pt-6">
                <button
                  onClick={handleRestart}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold px-8 py-4 rounded-2xl text-xs uppercase tracking-wider transition-all"
                >
                  Nova Avaliação
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Institutional Footer */}
      <footer className="max-w-xl w-full mx-auto text-center mt-8 space-y-1">
        <p className="text-slate-400 text-[9px] uppercase font-black tracking-widest">
          Ouvidoria • Policlínica Bernardo Félix da Silva
        </p>
        <p className="text-slate-300 text-[8px] font-medium leading-none">
          Em conformidade com a Lei Geral de Proteção de Dados (LGPD) • Avaliação Anônima
        </p>
      </footer>
    </div>
  );
}
