import { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Rating, RATINGS, FIXED_SECTORS } from '../constants';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { 
  TrendingUp, BarChart3, PieChart as PieChartIcon, Info, Users, 
  Download, Filter, AlertCircle, TrendingDown, Calendar, ClipboardList,
  FileText, ArrowRight, CheckCircle2, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { cn } from '../lib/utils';
import { format, subMonths, eachMonthOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Standardized Institutional Colors
const RATING_HEX: Record<Rating, string> = {
  "Ótimo": "#10b981", // emerald-500
  "Bom": "#3b82f6",   // blue-500
  "Regular": "#f59e0b", // amber-500
  "Ruim": "#ef4444",   // red-500
  "Não informou": "#94a3b8" // slate-400
};

export function Dashboard() {
  const [rawData, setRawData] = useState<any[]>([]);
  const [formsData, setFormsData] = useState<any[]>([]);
  const [formsCount, setFormsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  
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

  const sectorDataSummary = FIXED_SECTORS.map(sector => {
    const evals = filteredData.filter(d => d.sector === sector);
    const positive = evals.filter(d => d.rating === 'Ótimo' || d.rating === 'Bom').length;
    return {
      name: sector,
      value: evals.length > 0 ? Math.round((positive / evals.length) * 100) : 0,
      total: evals.length,
      ruim: evals.filter(d => d.rating === 'Ruim').length
    };
  }).filter(s => s.total > 0).sort((a,b) => b.value - a.value);

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

  // Dashboard NPS
  const filteredForms = formsData.filter(f => 
    f.date.getMonth() === selectedMonth && f.date.getFullYear() === selectedYear
  );
  const scores = filteredForms.map(f => f.recommendationScore).filter(s => s !== undefined);
  const totalScores = scores.length;
  const detractors = scores.filter(s => s <= 6).length;
  const promoters = scores.filter(s => s >= 9).length;
  const detractorsPcnt = totalScores > 0 ? Math.round((detractors / totalScores) * 100) : 0;
  const promotersPcnt = totalScores > 0 ? Math.round((promoters / totalScores) * 100) : 0;
  const npsScore = promotersPcnt - detractorsPcnt;
  
  const getNpsColor = (score: number) => {
    if (score >= 75) return "emerald";
    if (score >= 50) return "blue";
    if (score >= 0) return "amber";
    return "rose";
  };

  const getNpsLabel = (score: number) => {
    if (score >= 75) return "Excelente";
    if (score >= 50) return "Muito Bom";
    if (score >= 0) return "Razoável";
    return "Crítico";
  };

  // Multi-level alerts for executive view
  const criticalAlerts = sectorDataSummary.filter(s => (s.ruim / s.total) >= 0.15);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const months = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="space-y-10 pb-20">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="flex items-center gap-2">
           <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg">
             <BarChart3 className="w-6 h-6" />
           </div>
           <div>
             <h2 className="text-2xl font-black text-slate-900">Dashboard Executivo</h2>
             <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Panorama de Gestão Policlínica</p>
           </div>
        </div>

        <div className="flex items-center gap-4 bg-white p-2.5 rounded-3xl border border-slate-200 shadow-sm">
           <div className="flex items-center gap-2 px-3 text-slate-400 border-r border-slate-100">
             <Calendar className="w-4 h-4" />
             <span className="text-[10px] font-black uppercase tracking-widest">Período</span>
           </div>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="bg-transparent border-none text-sm font-bold text-slate-700 py-2 px-3 focus:ring-0 cursor-pointer"
          >
            {months.map(m => (
              <option key={m} value={m}>{format(new Date(2000, m), 'MMMM', { locale: ptBR })}</option>
            ))}
          </select>
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="bg-transparent border-none text-sm font-bold text-slate-700 py-2 px-3 focus:ring-0 cursor-pointer"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Avaliações" value={totalEvaluations} icon={Users} color="blue" />
        <StatCard title="Qualidade" value={`${positivePcnt}%`} subtitle="Satisfação" icon={TrendingUp} color="emerald" />
        <StatCard 
          title="NPS Global" 
          value={totalScores > 0 ? npsScore : '--'} 
          subtitle={getNpsLabel(npsScore)} 
          icon={ShieldCheck} 
          color={getNpsColor(npsScore)} 
        />
        <StatCard title="Amostras" value={formsCount} icon={ClipboardList} color="amber" subtitle="Total Formulários" />
      </div>

      {/* Critical Alerts Strip */}
      {criticalAlerts.length > 0 && (
        <div className="bg-rose-50 border border-rose-100 p-6 rounded-[2rem] space-y-4">
           <div className="flex items-center gap-3 text-rose-600 mb-2">
              <AlertCircle className="w-5 h-5" />
              <h4 className="font-black text-sm uppercase tracking-widest">Atenção Necessária (Setores Críticos)</h4>
           </div>
           <div className="flex flex-wrap gap-3">
              {criticalAlerts.map(s => (
                <div key={s.name} className="bg-white border border-rose-200 px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm">
                   <span className="text-xs font-black text-slate-700 uppercase">{s.name}</span>
                   <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 rounded-md">{Math.round((s.ruim / s.total) * 100)}% Ruim</span>
                </div>
              ))}
           </div>
        </div>
      )}

      {/* Core Executive Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm lg:col-span-1">
          <div className="flex items-center gap-4 mb-8">
            <PieChartIcon className="w-6 h-6 text-indigo-600" />
            <h3 className="font-black text-slate-900 text-lg uppercase">Distribuição</h3>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={RATINGS.map(r => ({ name: r, value: ratingCounts[r] })).filter(d => d.value > 0)}
                  cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value"
                >
                  {RATINGS.map((r) => <Cell key={r} fill={RATING_HEX[r]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm lg:col-span-2">
           <div className="flex items-center gap-4 mb-8">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
            <h3 className="font-black text-slate-900 text-lg uppercase">Satisfação Mensal (%)</h3>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolutionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} dy={10} fontWeight={700} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} fontWeight={700} />
                <Tooltip />
                <Line type="monotone" dataKey="satisfacao" stroke="#10b981" strokeWidth={5} dot={{ r: 6, fill: '#10b981', strokeWidth: 3, stroke: '#fff' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Performing Sectors Summary */}
      <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm">
         <div className="flex items-center gap-4 mb-8">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
            <h3 className="font-black text-slate-900 text-lg uppercase">Performance de Aprovação por Setor (%)</h3>
         </div>
         <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
               <BarChart data={sectorDataSummary.slice(0, 8)} margin={{ bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" fontSize={10} fontWeight={800} interval={0} height={80} axisLine={false} tickLine={false} />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={25} />
               </BarChart>
            </ResponsiveContainer>
         </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, subtitle }: any) {
  const colors: any = {
    blue: "bg-blue-600 text-blue-600 ring-blue-50",
    emerald: "bg-emerald-600 text-emerald-600 ring-emerald-50",
    amber: "bg-amber-600 text-amber-600 ring-amber-50",
    rose: "bg-rose-600 text-rose-600 ring-rose-50",
    slate: "bg-slate-700 text-slate-700 ring-slate-50",
  };

  const bgColors: any = {
    blue: "bg-blue-600",
    emerald: "bg-emerald-600",
    amber: "bg-amber-600",
    rose: "bg-rose-600",
    slate: "bg-slate-700",
  };

  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
      <div className={cn("absolute right-0 top-0 w-28 h-28 -mr-10 -mt-10 opacity-5 rounded-full transition-transform group-hover:scale-150 duration-700", bgColors[color])} />
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ring-[12px] ring-opacity-20 shadow-lg", colors[color])}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] mb-2">{title}</p>
      <h4 className="text-4xl font-black text-slate-900 leading-none mb-2">{value}</h4>
      {subtitle && <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tight leading-none italic">{subtitle}</p>}
    </div>
  );
}
