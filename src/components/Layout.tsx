import { ReactNode, useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  LayoutDashboard, 
  PlusCircle, 
  ListOrdered, 
  LogOut, 
  User as UserIcon,
  ChevronRight,
  Settings,
  Users,
  FileText,
  QrCode,
  Copy,
  Check,
  Share2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getProfile, UserProfile } from '../lib/firebase';

interface LayoutProps {
  children: ReactNode;
  user: User;
  currentView: 'dashboard' | 'reports' | 'form' | 'list' | 'sectors' | 'users';
  onViewChange: (view: 'dashboard' | 'reports' | 'form' | 'list' | 'sectors' | 'users') => void;
  onLogout: () => void;
}

export function Layout({ children, user, currentView, onViewChange, onLogout }: LayoutProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getProfile(user.uid).then(setProfile);
  }, [user.uid]);

  const patientLink = `${window.location.origin}${window.location.pathname}?mode=paciente`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(patientLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'reports', label: 'Relatórios', icon: FileText },
    { id: 'form', label: 'Novo Formulário', icon: PlusCircle },
    { id: 'list', label: 'Histórico', icon: ListOrdered },
    { id: 'sectors', label: 'Gestão de Setores', icon: Settings },
    ...(profile?.role === 'admin' ? [{ id: 'users', label: 'Gerenciar Equipe', icon: Users }] : []),
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
              P
            </div>
            <div>
              <h2 className="font-bold text-slate-900 leading-tight">Ouvidoria</h2>
              <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Policlínica</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id as any)}
              className={cn(
                "flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group cursor-pointer",
                currentView === item.id 
                  ? "bg-blue-50 text-blue-700 shadow-sm" 
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
              id={`nav-${item.id}`}
            >
              <div className="flex items-center gap-3">
                <item.icon className={cn("w-5 h-5", currentView === item.id ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600")} />
                {item.label}
              </div>
              {currentView === item.id && <ChevronRight className="w-4 h-4" />}
            </button>
          ))}
        </nav>

        <div className="px-4 pb-4 no-print">
          <button
            onClick={() => setShowShareModal(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-all border border-indigo-100/50 cursor-pointer shadow-sm active:scale-95"
          >
            <QrCode className="w-4 h-4 text-indigo-605" />
            Divulgar Pesquisa
          </button>
        </div>

        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-50 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-3 mb-1">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-white" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
              <div className="overflow-hidden">
                <p className="text-sm font-semibold text-slate-900 truncate leading-none mb-1">
                  {user.displayName?.split(' ')[0]}
                </p>
                <p className="text-[10px] text-slate-500 truncate leading-none">
                  {user.email}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            id="logout-button"
          >
            <LogOut className="w-5 h-5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
          <h1 className="text-lg font-bold text-slate-900">
            {navItems.find(i => i.id === currentView)?.label}
          </h1>
          <div className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full font-medium">
            {new Date().toLocaleDateString('pt-BR')}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {/* Share Modal */}
      {showShareModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 no-print animate-in fade-in duration-200" 
          onClick={() => setShowShareModal(false)}
        >
          <div 
            className="bg-white rounded-[2.5rem] max-w-sm w-full p-8 border border-slate-100 shadow-2xl space-y-6 relative animate-in zoom-in-95 duration-200" 
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setShowShareModal(false)}
              className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 font-bold p-1 rounded-full hover:bg-slate-50 transition-colors cursor-pointer"
            >
              ✕
            </button>

            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Divulgar Pesquisa</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Disponibilize o link ou imprima o QR Code na recepção para receber avaliações em tempo real.
              </p>
            </div>

            <div className="bg-slate-50/50 p-4 rounded-3xl flex flex-col items-center justify-center border border-slate-100">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(patientLink)}`} 
                alt="QR Code Ouvidoria"
                className="w-44 h-44 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm"
              />
              <p className="text-[9px] text-indigo-505 font-black uppercase tracking-[0.25em] mt-3 animate-pulse">Aponte a câmera para testar</p>
            </div>

            <div className="space-y-1.5 flex flex-col">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1 text-left">Link Direto</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={patientLink} 
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-500 outline-none flex-1 truncate font-medium"
                />
                <button
                  onClick={handleCopyLink}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-4 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-indigo-100 shrink-0 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 animate-pulse" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 text-center text-[9px] text-slate-400 font-bold uppercase leading-relaxed">
              Dica: Imprima o QR Code e coloque nos balcões da Policlínica Bernardo Félix da Silva.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
