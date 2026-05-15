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
  FileText
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

  useEffect(() => {
    getProfile(user.uid).then(setProfile);
  }, [user.uid]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'reports', label: 'Relatórios', icon: FileText },
    { id: 'form', label: 'Novo Formulário', icon: PlusCircle },
    { id: 'list', label: 'Histórico', icon: ListOrdered },
    { id: 'sectors', label: 'Gestão de Setores', icon: Settings },
    ...(profile?.role === 'admin' ? [{ id: 'users', label: 'Gerenciar Equipe', icon: Users }] : []),
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
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
                "flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group",
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
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
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
    </div>
  );
}
