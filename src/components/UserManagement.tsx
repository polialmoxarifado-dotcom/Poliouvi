import { useState, useEffect, FormEvent } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  updateDoc, 
  doc, 
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, UserProfile, UserRole } from '../lib/firebase';
import { 
  UserPlus, 
  UserCog, 
  Shield, 
  User as UserIcon, 
  Mail, 
  ToggleLeft, 
  ToggleRight,
  Search,
  CheckCircle2,
  XCircle,
  MoreVertical
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function UserManagement() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  // New User Form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('operator');

  useEffect(() => {
    const q = query(collection(db, 'profiles'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as UserProfile[];
      setProfiles(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'profiles');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleToggleActive = async (profile: UserProfile) => {
    try {
      await updateDoc(doc(db, 'profiles', profile.uid), {
        active: !profile.active
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `profiles/${profile.uid}`);
    }
  };

  const handleToggleRole = async (profile: UserProfile) => {
    const nextRole: UserRole = profile.role === 'admin' ? 'operator' : 'admin';
    try {
      await updateDoc(doc(db, 'profiles', profile.uid), {
        role: nextRole
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `profiles/${profile.uid}`);
    }
  };

  const handleAddProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newName) return;

    try {
      // Note: This only creates the Firestore profile.
      // The user still needs to be created in Firebase Auth.
      // In a real app without Cloud Functions, we'd use a secondary Firebase app instance
      // to create the account, or use the Firebase Admin SDK on a backend.
      // For this simple version, we're managing the metadata.
      const tempId = `id_${Date.now()}`; // Temporary ID if we don't have the real UID yet
      await setDoc(doc(db, 'profiles', tempId), {
        name: newName,
        email: newEmail.toLowerCase(),
        role: newRole,
        active: true
      });
      setIsAdding(false);
      setNewName('');
      setNewEmail('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'profiles');
    }
  };

  const filteredProfiles = profiles.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserCog className="w-6 h-6 text-blue-600" />
            Gestão de Usuários
          </h2>
          <p className="text-slate-500 text-sm">Controle de acessos e cargos da ouvidoria.</p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-lg active:scale-95",
            isAdding ? "bg-slate-100 text-slate-600" : "bg-blue-600 text-white shadow-blue-100 hover:bg-blue-700"
          )}
        >
          {isAdding ? "Cancelar" : <><UserPlus className="w-4 h-4" /> Novo Usuário</>}
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white border border-slate-200 rounded-3xl p-8 mb-6 shadow-sm">
              <form onSubmit={handleAddProfile} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="João Silva"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">E-mail</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="joao@policlinica.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Cargo</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                  >
                    <option value="operator">Operador (Ouvidoria)</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="md:col-span-3 flex justify-end">
                  <button
                    type="submit"
                    className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-black transition-all shadow-lg active:scale-95"
                  >
                    Criar Perfil
                  </button>
                </div>
              </form>
              <div className="mt-6 p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3">
                <Shield className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-amber-700 text-xs leading-relaxed">
                  <strong>Nota:</strong> Criar um perfil aqui autoriza o acesso. O usuário deverá utilizar o mesmo e-mail para fazer login via Google ou solicitar redefinição de senha para o primeiro acesso.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-3 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-widest border-b border-slate-100">
                <th className="px-6 py-4">Usuário</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Cargo</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredProfiles.map((profile) => (
                <tr key={profile.uid} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                        <UserIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 leading-none mb-1">{profile.name}</h4>
                        <span className="text-xs text-slate-500">{profile.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight",
                      profile.active 
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                        : "bg-slate-100 text-slate-400 border border-slate-200"
                    )}>
                      {profile.active ? (
                        <><CheckCircle2 className="w-3 h-3" /> Ativo</>
                      ) : (
                        <><XCircle className="w-3 h-3" /> Inativo</>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className={cn(
                      "flex items-center gap-2 font-semibold",
                      profile.role === 'admin' ? "text-indigo-600" : "text-amber-600"
                    )}>
                      {profile.role === 'admin' ? <Shield className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                      {profile.role === 'admin' ? "Administrador" : "Operador"}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleToggleRole(profile)}
                        title="Alternar Cargo"
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-all"
                      >
                        <UserCog className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(profile)}
                        title={profile.active ? "Desativar" : "Ativar"}
                        className={cn(
                          "p-2 rounded-lg transition-all",
                          profile.active ? "text-amber-500 hover:bg-amber-50" : "text-emerald-500 hover:bg-emerald-50"
                        )}
                      >
                        {profile.active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredProfiles.length === 0 && (
            <div className="p-20 text-center text-slate-400 italic">
              Nenhum perfil encontrado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
