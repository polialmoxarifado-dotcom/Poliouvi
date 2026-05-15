import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Rating, RATING_COLORS, RATING_TEXT_COLORS } from '../constants';
import { Search, Calendar, MessageSquare, User, ChevronDown, ChevronUp, ClipboardList, PieChart } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface EvaluationItem {
  id: string;
  sector: string;
  rating: Rating;
  observation: string;
}

interface FormRecord {
  id: string;
  date: Timestamp;
  observation: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  recommendationScore?: number;
  items?: EvaluationItem[];
}

export function EvaluationList() {
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, EvaluationItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedForm, setExpandedForm] = useState<string | null>(null);

  useEffect(() => {
    // Listen to Forms
    const qForms = query(collection(db, 'forms'), orderBy('createdAt', 'desc'), limit(50));
    const unsubForms = onSnapshot(qForms, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FormRecord));
      setForms(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'forms');
      setLoading(false);
    });

    // Listen to Evaluations to group them
    const qEvals = query(collection(db, 'evaluations'), orderBy('createdAt', 'desc'), limit(500));
    const unsubEvals = onSnapshot(qEvals, (snapshot) => {
      const grouped: Record<string, EvaluationItem[]> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const formId = data.formId;
        if (!grouped[formId]) grouped[formId] = [];
        grouped[formId].push({
          id: doc.id,
          sector: data.sector,
          rating: data.rating,
          observation: data.observation
        });
      });
      setEvaluations(grouped);
    });

    return () => {
      unsubForms();
      unsubEvals();
    };
  }, []);

  const filteredForms = forms.filter(f => {
    const items = evaluations[f.id] || [];
    const matchesSearch = 
      f.createdByName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      f.observation?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      items.some(i => i.sector.toLowerCase().includes(searchTerm.toLowerCase()) || i.observation.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  const getStats = (formId: string) => {
    const items = evaluations[formId] || [];
    const stats: Record<string, number> = {};
    items.forEach(i => {
      stats[i.rating] = (stats[i.rating] || 0) + 1;
    });
    return stats;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar em formulários ou comentários..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
          />
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Total Exibido</p>
          <p className="text-2xl font-black text-slate-900 leading-none">{filteredForms.length} <span className="text-sm font-normal text-slate-400">Formulários</span></p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-20">
          <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      ) : filteredForms.length === 0 ? (
        <div className="bg-white rounded-3xl p-20 text-center border border-slate-200">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-6 h-6 text-slate-300" />
          </div>
          <h3 className="text-slate-900 font-bold text-xl mb-1">Nenhum formulário encontrado</h3>
          <p className="text-slate-500">Comece lançando uma nova pesquisa na aba lateral.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredForms.map((f) => {
            const items = evaluations[f.id] || [];
            const stats = getStats(f.id);
            const isExpanded = expandedForm === f.id;

            return (
              <div 
                key={f.id}
                className={cn(
                  "bg-white rounded-3xl border transition-all overflow-hidden",
                  isExpanded ? "border-blue-200 shadow-xl ring-4 ring-blue-50" : "border-slate-200 shadow-sm hover:border-slate-300"
                )}
              >
                {/* Form Header / Summary */}
                <div 
                  className="p-6 cursor-pointer select-none"
                  onClick={() => setExpandedForm(isExpanded ? null : f.id)}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                        <Calendar className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 flex items-center gap-2">
                          Formulário #{f.id.slice(-6).toUpperCase()}
                          <span className="text-[10px] font-bold text-slate-400 border border-slate-100 px-2 py-0.5 rounded-md uppercase tracking-widest">
                            {format(f.date.toDate(), "dd/MM/yyyy")}
                          </span>
                        </h4>
                        <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <User className="w-3 h-3" />
                          Lançado por <span className="font-bold text-slate-700">{f.createdByName}</span> em {format(f.createdAt.toDate(), "HH:mm")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                      {Object.entries(stats).map(([rating, count]) => (
                        <div key={rating} className={cn(
                          "px-3 py-1.5 rounded-xl border flex items-center gap-2",
                          RATING_TEXT_COLORS[rating as Rating],
                          "bg-opacity-10 border-current"
                        )}>
                          <span className="text-[10px] font-black uppercase tracking-tight">{rating}</span>
                          <span className="text-sm font-bold">{count}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-4 border-l border-slate-100 pl-6 shrink-0">
                       <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">NPS</p>
                          <p className={cn(
                            "text-lg font-black leading-none",
                            f.recommendationScore !== undefined 
                              ? (f.recommendationScore >= 9 ? "text-emerald-600" : f.recommendationScore >= 7 ? "text-amber-500" : "text-rose-600")
                              : "text-slate-300"
                          )}>
                            {f.recommendationScore ?? '--'}
                          </p>
                       </div>
                       <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Setores</p>
                          <p className="text-lg font-black text-slate-900 leading-none">{items.length}</p>
                       </div>
                       {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-slate-100 bg-slate-50/30"
                    >
                      <div className="p-8 space-y-6">
                        {f.observation && (
                          <div className="bg-white p-4 rounded-xl border border-slate-100 text-sm text-slate-600 flex gap-3 shadow-sm italic">
                            <MessageSquare className="w-4 h-4 text-blue-500 shrink-0 mt-1" />
                            <div>
                               <p className="font-bold text-slate-900 not-italic text-xs mb-1">Observação do Formulário:</p>
                               "{f.observation}"
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {items.map((item) => (
                            <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800 text-sm">{item.sector}</span>
                                <span className={cn(
                                  "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white",
                                  RATING_COLORS[item.rating]
                                )}>
                                  {item.rating}
                                </span>
                              </div>
                              {item.observation && (
                                <div className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-lg border border-slate-100">
                                  "{item.observation}"
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
