import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  auth, 
  logout, 
  getProfile, 
  UserProfile, 
  db 
} from './lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Reports } from './components/Reports';
import { EvaluationForm } from './components/EvaluationForm';
import { EvaluationList } from './components/EvaluationList';
import { SectorManagement } from './components/SectorManagement';
import { UserManagement } from './components/UserManagement';
import { Login } from './components/Login';
import { Loader2, ShieldAlert, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type View = 'dashboard' | 'reports' | 'form' | 'list' | 'sectors' | 'users';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        let p = await getProfile(u.uid);
        
        // Bootstrap admin if needed
        if (!p && u.email === 'poli.almoxarifado@gmail.com') {
          const newProfile = {
            email: u.email,
            name: u.displayName || 'Administrador Principal',
            role: 'admin' as const,
            active: true
          };
          await setDoc(doc(db, 'profiles', u.uid), newProfile);
          p = { uid: u.uid, ...newProfile };
        }
        
        setProfile(p);
        setUser(u);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // Block inactive users
  if (!profile || !profile.active) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 text-center border border-slate-100">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-10 h-10 text-rose-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Acesso Restrito</h1>
          <p className="text-slate-500 mb-8 leading-relaxed">
            Sua conta está aguardando ativação ou foi desativada pelo administrador do sistema.
          </p>
          <button
            onClick={logout}
            className="flex items-center justify-center gap-2 w-full py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sair da Conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <Layout 
      user={user} 
      currentView={currentView === 'users' ? 'sectors' : currentView} // Fallback mapping if layout doesn't know 'users'
      onViewChange={(v: any) => setCurrentView(v)}
      onLogout={logout}
    >
      <AnimatePresence mode="wait">
        {currentView === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
          >
            <Dashboard />
          </motion.div>
        )}
        {currentView === 'reports' && (
          <motion.div
            key="reports"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
          >
            <Reports />
          </motion.div>
        )}
        {currentView === 'form' && (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
          >
            <EvaluationForm onFinish={() => setCurrentView('list')} />
          </motion.div>
        )}
        {currentView === 'list' && (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
          >
            <EvaluationList />
          </motion.div>
        )}
        {currentView === 'sectors' && (
          <motion.div
            key="sectors"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
          >
            <SectorManagement />
          </motion.div>
        )}
        {currentView === 'users' && profile.role === 'admin' && (
          <motion.div
            key="users"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
          >
            <UserManagement />
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
