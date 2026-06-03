import { useState, useEffect } from 'react';
import { collection, writeBatch, doc, serverTimestamp, Timestamp, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { RATINGS, RATING_COLORS, Rating, FIXED_SECTORS } from '../constants';
import { 
  Heart, Send, CheckCircle2, MessageSquare, ClipboardCheck, AlertCircle, 
  ArrowLeft, Loader2, Hospital, Sparkles, ArrowRight, ShieldCheck, Users,
  Activity, Stethoscope, Award, Sparkle, Bath, Home, FileText, Smile
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

// Maps and returns cozy humanized icons for each clinic logistics sector
const getSectorIcon = (sectorName: string) => {
  const norm = sectorName.toLowerCase();
  if (norm.includes('portaria') || norm.includes('segurança')) return ShieldCheck;
  if (norm.includes('recepção') || norm.includes('geral')) return Users;
  if (norm.includes('triagem')) return Activity;
  if (norm.includes('consultas médicas') || norm.includes('médic')) return Stethoscope;
  if (norm.includes('consultas multiprofissionais') || norm.includes('multiprofissional')) return Heart;
  if (norm.includes('exames') && norm.includes('realização')) return Sparkles;
  if (norm.includes('laboratório') || norm.includes('laborat')) return ClipboardCheck;
  if (norm.includes('exames') && norm.includes('entrega')) return FileText;
  if (norm.includes('cer')) return Award;
  if (norm.includes('ambiente')) return Home;
  if (norm.includes('limpeza')) return Sparkle;
  if (norm.includes('banheiro') || norm.includes('higiene')) return Bath;
  return Hospital;
};

// Friendly and easy to read rating mapping for patients with lower literacy level
const SMILEY_RATINGS = [
  { rating: 'Ótimo' as Rating, label: '😁 ÓTIMO', color: 'bg-emerald-500 text-white shadow-emerald-100', defaultColor: 'bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 border-emerald-200' },
  { rating: 'Bom' as Rating, label: '🙂 BOM', color: 'bg-blue-500 text-white shadow-blue-100', defaultColor: 'bg-blue-50/50 text-blue-700 hover:bg-blue-100 border-blue-200' },
  { rating: 'Regular' as Rating, label: '😐 REGULAR', color: 'bg-amber-500 text-white shadow-amber-100', defaultColor: 'bg-amber-50/50 text-amber-700 hover:bg-amber-100 border-amber-200' },
  { rating: 'Ruim' as Rating, label: '🙁 RUIM', color: 'bg-rose-500 text-white shadow-rose-100', defaultColor: 'bg-rose-50/50 text-rose-700 hover:bg-rose-100 border-rose-200' }
];

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
  
  // Clean progress states: welcome -> survey -> comments -> success
  const [step, setStep] = useState<'welcome' | 'survey' | 'comments' | 'success'>('welcome');
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Authenticate patient anonymously in the background with sandbox guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        signInAnonymously(auth).catch((err) => {
          console.warn("Anonymous auth restricted in local runtime.", err);
        });
      }
    });

    return () => unsub();
  }, []);

  // Fetch active sectors from database and merge list
  useEffect(() => {
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
      console.error("Error loading active sectors list", error);
    });

    return () => unsubscribe();
  }, []);

  // Toggle/Update evaluations
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

  // Submit survey responses directly to Firestore
  const handleSubmit = async () => {
    if (recommendationScore === null) {
      alert("POR FAVOR, SELECIONE UMA NOTA DE RECOMENDAÇÃO (0 A 10).");
      return;
    }

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      
      // Keep only sectors actually graded by the patient
      const ratedSectors = (Object.entries(evaluations) as [string, { rating: Rating | ''; observation: string }][])
        .filter(([_, data]) => data && data.rating !== "")
        .map(([name, data]) => ({ name, data }));

      const formDate = new Date().toISOString().split('T')[0];
      const timestampDate = Timestamp.fromDate(new Date(formDate + 'T12:00:00'));
      const creatorId = currentUser ? currentUser.uid : "paciente-portal";

      // 1. Create Patient Submission Form Head Document
      const formRef = doc(collection(db, 'forms'));
      batch.set(formRef, {
        date: timestampDate,
        recommendationScore: recommendationScore,
        observation: formObservation.trim(),
        createdBy: creatorId,
        createdByName: "Paciente (Portal)",
        createdAt: serverTimestamp(),
      });

      // 2. Create Evaluation Item Detail Documents
      ratedSectors.forEach(({ name, data }) => {
        const itemRef = doc(collection(db, 'evaluations'));
        batch.set(itemRef, {
          formId: formRef.id,
          sector: name,
          rating: data.rating,
          observation: data.observation.trim(),
          date: timestampDate,
          createdBy: creatorId,
          createdByName: "Paciente (Portal)",
          createdAt: serverTimestamp(),
        });
      });

      await batch.commit();
      setStep('success');

      // Auto restart to welcome screen after 6 seconds for public totem rotation
      setTimeout(() => {
        handleRestart();
      }, 6000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'patient/evaluations');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestart = () => {
    setRecommendationScore(null);
    setFormObservation('');
    const cleared: Record<string, { rating: Rating | '', observation: string }> = {};
    sectors.forEach(s => {
      cleared[s] = { rating: '', observation: '' };
    });
    setEvaluations(cleared);
    setStep('welcome');
  };

  return (
    <div className="min-h-screen bg-gradient-to-tr from-teal-50/70 via-emerald-50/30 to-sky-50/70 flex flex-col justify-between py-10 px-4 font-sans select-none antialiased uppercase">
      
      {/* Dynamic light hospital header */}
      <header className="max-w-2xl w-full mx-auto text-center mb-6">
        <div className="inline-flex items-center gap-3.5 bg-white/95 px-6 py-3 rounded-full border border-teal-100 shadow-[0_4px_20px_rgba(13,148,136,0.06)] animate-fade-in">
          <div className="w-9 h-9 bg-teal-500 rounded-xl flex items-center justify-center text-white shadow-sm">
            <Hospital className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-xs font-black text-teal-900 tracking-tight leading-none uppercase">POLICLÍNICA BERNARDO FÉLIX DA SILVA</h1>
            <p className="text-[9px] text-teal-600 font-extrabold uppercase tracking-widest mt-0.5 leading-none">PESQUISA DE SATISFAÇÃO DO PACIENTE</p>
          </div>
        </div>
      </header>

      {/* Main Container Card with step transition */}
      <main className="max-w-2xl w-full mx-auto flex-1 flex flex-col justify-center my-4">
        <AnimatePresence mode="wait">
          
          {/* STEP 1: WELCOME SCREEN (CLARINHA, BONITINHA, BEM ACONCHEGANTE) */}
          {step === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, scale: 0.98, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -15 }}
              className="bg-white/95 rounded-[2.5rem] p-8 md:p-12 shadow-[0_25px_60px_-15px_rgba(45,212,191,0.15)] border border-teal-100/80 text-center space-y-8 flex flex-col items-center"
            >
              {/* Core Welcoming Illustration */}
              <div className="w-24 h-24 bg-gradient-to-tr from-teal-50 to-emerald-50 text-teal-600 rounded-[2rem] flex items-center justify-center shadow-[0_12px_24px_rgba(13,148,136,0.08)] border-2 border-teal-100/50 animate-pulse relative my-1">
                <Heart className="w-12 h-12 text-teal-500 fill-teal-500/10" />
                <Sparkles className="w-6 h-6 text-emerald-400 absolute -top-1 -right-1" />
              </div>

              {/* Patient Core Messages in Large Uppercase */}
              <div className="space-y-4 max-w-lg mx-auto">
                <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight uppercase leading-tight">
                  SUA AJUDA É MUITO IMPORTANTE!
                </h2>
                <p className="text-slate-600 leading-relaxed text-sm md:text-base font-extrabold uppercase tracking-wide">
                  QUEREMOS OFERECER SEMPRE O MELHOR ATENDIMENTO PARA VOCÊ. ESTA AVALIAÇÃO LEVA SÓ 1 MINUTO E É TOTALMENTE SECRETA E ANÔNIMA.
                </p>
              </div>

              {authError && (
                <div className="bg-rose-50 border border-rose-150 p-4 rounded-2xl flex items-center gap-3 text-rose-600 text-xs text-left uppercase w-full">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{authError.toUpperCase()}</span>
                </div>
              )}

              {/* Inviting and Large Start Button */}
              <button
                type="button"
                onClick={() => setStep('survey')}
                className="w-full max-w-md bg-teal-500 hover:bg-teal-400 text-white font-black py-4.5 px-8 rounded-2xl transition-all shadow-[0_12px_24px_rgba(20,184,166,0.25)] hover:shadow-[0_12px_36px_rgba(20,184,166,0.35)] active:scale-[0.98] text-xs tracking-widest flex items-center justify-center gap-2 uppercase cursor-pointer mt-4"
              >
                <span>COMEÇAR AVALIAÇÃO</span>
                <ArrowRight className="w-4 h-4 stroke-[3]" />
              </button>

              {/* Indicator of Security */}
              <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-[0.2em] pt-6 border-t border-slate-100 w-full">
                PESQUISA 100% REGISTRADA NO SISTEMA DO SUS
              </div>
            </motion.div>
          )}

          {/* STEP 2: MAIN SURVEY FLOW - NPS + DIRECT LOGISTICS ROADMAP */}
          {step === 'survey' && (
            <motion.div
              key="survey"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white rounded-[2rem] p-6 md:p-10 shadow-[0_20px_50px_rgba(15,118,110,0.08)] border border-teal-50/60 space-y-6 md:space-y-8"
            >
              
              {/* Question 1: NPS score recommendation */}
              <div className="space-y-4 text-center pb-6 border-b border-slate-100">
                <div className="text-[10px] bg-teal-50 text-teal-800 px-4 py-1.5 rounded-full inline-block font-black uppercase tracking-widest">
                  ETAPA 1: RECOMENDAÇÃO INSTITUCIONAL
                </div>
                <h2 className="text-lg md:text-xl font-black text-slate-850 leading-snug uppercase">
                  O QUANTO VOCÊ RECOMENDA A POLICLÍNICA BERNARDO FÉLIX PARA AMIGOS E FAMILIARES?
                </h2>
                <p className="text-xs text-slate-400 font-bold uppercase">RESPONDA TOCANDO EM UM DOS NÚMEROS ABAIXO (DE 0 A 10)</p>
                
                {/* Visual tactile 0-10 block with warm colorful guidelines */}
                <div className="grid grid-cols-6 sm:grid-cols-11 gap-2 pt-2">
                  {Array.from({ length: 11 }, (_, i) => i).map((num) => {
                    const isSelected = recommendationScore === num;
                    
                    // Colors based on score range to help low-literacy patients understand mood
                    let scoreStyle = "";
                    if (num <= 6) {
                      scoreStyle = isSelected 
                        ? "bg-rose-500 border-rose-500 text-white shadow-md scale-110 ring-4 ring-rose-100" 
                        : "bg-rose-50/40 border-rose-100 text-rose-700 hover:bg-rose-100 hover:border-rose-200";
                    } else if (num === 7 || num === 8) {
                      scoreStyle = isSelected 
                        ? "bg-amber-500 border-amber-500 text-white shadow-md scale-110 ring-4 ring-amber-100 animate-pulse" 
                        : "bg-amber-50/40 border-amber-100 text-amber-700 hover:bg-amber-100 hover:border-amber-200";
                    } else {
                      scoreStyle = isSelected 
                        ? "bg-emerald-500 border-emerald-500 text-white shadow-md scale-110 ring-4 ring-emerald-100 animate-bounce" 
                        : "bg-emerald-50/40 border-emerald-100 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-200";
                    }

                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setRecommendationScore(num)}
                        className={cn(
                          "aspect-square rounded-2xl text-base font-black transition-all border-2 flex items-center justify-center cursor-pointer",
                          scoreStyle
                        )}
                      >
                        {num}
                      </button>
                    ).valueOf();
                  })}
                </div>

                <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
                  <span className="text-rose-500">🙁 PÉSSIMO</span>
                  <span className="text-emerald-500">😁 SENSACIONAL</span>
                </div>
              </div>

              {/* Question 2: Direct sector evaluations map ("A logística de setores") */}
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-[10px] bg-emerald-50 text-emerald-800 px-4 py-1.5 rounded-full inline-block font-black uppercase tracking-widest mb-3">
                    ETAPA 2: AVALIAÇÃO DA LOGÍSTICA DE ATENDIMENTO
                  </div>
                  <h2 className="text-lg md:text-xl font-black text-slate-850 uppercase leading-tight">Como foi seu atendimento nos setores por onde passou?</h2>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Toque na avaliação de cada setor visitado. Os não visitados podem ficar em branco.</p>
                </div>

                {/* Direct stacked list of active sectors of the clinic */}
                <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1.5 scrollbar-thin scrollbar-thumb-teal-100 scrollbar-track-transparent">
                  {sectors.map((s) => {
                    const SectorIcon = getSectorIcon(s);
                    const currentRating = evaluations[s]?.rating || '';

                    return (
                      <div 
                        key={s} 
                        className={cn(
                          "bg-[#fafbfc]/70 p-4 rounded-2xl border transition-all space-y-3.5",
                          currentRating 
                            ? "border-teal-100 bg-teal-50/10 shadow-[0_4px_12px_rgba(13,148,136,0.02)]" 
                            : "border-slate-100"
                        )}
                      >
                        
                        {/* Sector header and info */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-inner",
                              currentRating ? "bg-teal-100 text-teal-600" : "bg-slate-100 text-slate-500"
                            )}>
                              <SectorIcon className="w-4.5 h-4.5" />
                            </div>
                            <span className="font-black text-xs md:text-sm text-slate-800 uppercase tracking-wide">{s.toUpperCase()}</span>
                          </div>
                          
                          {currentRating ? (
                            <button
                              type="button"
                              onClick={() => setEvaluations(prev => ({
                                ...prev,
                                [s]: { ...prev[s], rating: '' }
                              }))}
                              className="text-[9px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest cursor-pointer px-2 py-0.5 bg-slate-100 hover:bg-red-50 rounded-md transition-all"
                            >
                              LIMPAR X
                            </button>
                          ) : (
                            <span className="text-[9px] text-slate-450 font-bold uppercase tracking-widest">NÃO AVALIADO</span>
                          )}
                        </div>

                        {/* Large, clean, smiley options for low-literate touch targets */}
                        <div className="grid grid-cols-4 gap-2">
                          {SMILEY_RATINGS.map((item) => {
                            const isSelected = currentRating === item.rating;
                            return (
                              <button
                                key={item.rating}
                                type="button"
                                onClick={() => updateEvaluationValue(s, item.rating)}
                                className={cn(
                                  "py-3 px-1 rounded-xl text-[10px] md:text-xs font-black border transition-all text-center uppercase tracking-wider cursor-pointer",
                                  isSelected 
                                    ? `${item.color} border-transparent scale-[1.03]` 
                                    : `${item.defaultColor}`
                                )}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Optional short observation form direct under the sector */}
                        {currentRating && (
                          <div className="relative animate-fade-in pt-1">
                            <MessageSquare className="absolute left-3 top-4 w-3.5 h-3.5 text-teal-300" />
                            <input
                              type="text"
                              value={evaluations[s]?.observation || ''}
                              onChange={(e) => updateEvaluationComment(s, e.target.value)}
                              placeholder={`QUER ESPECIFICAR ALGO DO SETOR ${s.toUpperCase()}? (OPCIONAL)`}
                              className="w-full bg-white border border-teal-100/70 rounded-xl pl-9 pr-3 py-2 text-[10px] outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-300 text-slate-750 font-extrabold uppercase transition-all placeholder:text-slate-300"
                            />
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>

              </div>

              {/* Action buttons footer */}
              <div className="pt-4 flex gap-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep('welcome')}
                  className="flex-1 py-4 px-6 border-2 border-slate-200 text-slate-500 font-extrabold rounded-2xl hover:bg-slate-50 transition-all text-xs uppercase tracking-wider cursor-pointer"
                >
                  VOLTAR INÍCIO
                </button>
                <button
                  type="button"
                  onClick={() => setStep('comments')}
                  className="flex-[2] bg-teal-500 hover:bg-teal-400 text-white font-black py-4 px-6 rounded-2xl transition-all shadow-lg shadow-teal-100 text-xs uppercase tracking-widest cursor-pointer"
                >
                  AVANÇAR PARA COMENTÁRIOS E ENVIAR
                </button>
              </div>

            </motion.div>
          )}

          {/* STEP 3: COMMENTARY AND SUBMISSION (CLARINHA, CLEAN) */}
          {step === 'comments' && (
            <motion.div
              key="comments"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white rounded-[2rem] p-8 shadow-[0_20px_50px_rgba(15,118,110,0.08)] border border-teal-50/60 space-y-6 text-center"
            >
              
              <div className="space-y-2 border-b border-rose-50 pb-6">
                <div className="text-[10px] bg-teal-50 text-teal-700 px-4 py-1.5 rounded-full inline-block font-black uppercase tracking-widest mb-2">
                  ETAPA FINAL: MENSAGEM DO PACIENTE
                </div>
                <h2 className="text-xl font-black text-slate-800 uppercase">QUER DEIXAR MAIS DETALHES?</h2>
                <p className="text-xs text-slate-400 uppercase">SUGESTÕES, RECLAMAÇÕES OU ELOGIOS COLETIVOS SÃO MUITO VALIOSOS</p>
              </div>

              <div className="space-y-4 text-left">
                <label className="text-xs font-black text-slate-600 uppercase tracking-widest pl-1">SUA ANALISE GERAL OU RECOMENTARIO:</label>
                <textarea
                  value={formObservation}
                  onChange={(e) => setFormObservation(e.target.value)}
                  placeholder="DIGITE SEU COMENTÁRIO AQUI..."
                  rows={4}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-extrabold outline-none focus:bg-white focus:ring-2 focus:ring-teal-500 transition-all uppercase placeholder:text-slate-300 placeholder:uppercase select-text"
                />
              </div>

              <div className="pt-4 flex gap-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep('survey')}
                  className="flex-1 py-4 px-6 border-2 border-slate-200 text-slate-500 font-extrabold rounded-2xl hover:bg-slate-50 transition-all text-xs uppercase tracking-wider cursor-pointer"
                >
                  VOLTAR
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-[2] bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 px-6 rounded-2xl transition-all shadow-xl shadow-emerald-100 disabled:opacity-50 text-xs uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                      GRAVANDO SUAS RESPOSTAS...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 text-white" />
                      FINALIZAR E ENVIAR
                    </>
                  )}
                </button>
              </div>

            </motion.div>
          )}

          {/* STEP 4: SUCCESS COMPLETED (CLARINHA, DECORATIVA & ACOLYTING) */}
          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[2.5rem] p-10 shadow-[0_25px_60px_-15px_rgba(16,185,129,0.15)] border-2 border-emerald-100 text-center space-y-8 py-16"
            >
              <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-inner border border-emerald-100 animate-bounce">
                <ClipboardCheck className="w-12 h-12 text-emerald-500" />
              </div>
              
              <div className="space-y-4">
                <h2 className="text-2xl md:text-3xl font-black text-emerald-900 tracking-tight uppercase leading-snug">
                  MUITO OBRIGADO PELA SUA OPINIÃO!
                </h2>
                <p className="text-slate-600 leading-relaxed text-sm md:text-base font-extrabold max-w-md mx-auto uppercase">
                  SUA AVALIAÇÃO FOI GRAVADA COM SUCESSO! ELA VAI REVOLUCIONAR E HUMANIZAR CADA VEZ MAIS O ATENDIMENTO DO SUS EM NOSSA POLICLÍNICA.
                </p>
                <p className="text-teal-600 text-[10px] tracking-widest font-black animate-pulse">DEUS ABENÇOE SEU DIA E BOA SAÚDE!</p>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold px-8 py-4 rounded-2xl text-xs uppercase tracking-widest transition-all cursor-pointer shadow-sm"
                >
                  FECHAR / NOVA AVALIAÇÃO AGORA
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Institutional light compliance footer */}
      <footer className="max-w-xl w-full mx-auto text-center mt-6 space-y-1 pb-4">
        <p className="text-teal-900/60 text-[9px] uppercase font-black tracking-widest">
          OUVIDORIA • POLICLÍNICA BERNARDO FÉLIX DA SILVA
        </p>
        <p className="text-slate-400 text-[8px] font-bold leading-none uppercase tracking-wide">
          EM TOTAL CONFORMIDADE COM A LEI GERAL DE PROTEÇÃO DE DADOS (LGPD) • PESQUISA ANÔNIMA
        </p>
      </footer>

    </div>
  );
}
