import { useState, useEffect, FormEvent } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp, getDocs, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth, getProfile, UserProfile } from '../lib/firebase';
import { Plus, Trash2, Check, X, Pencil, Save, ShieldAlert, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface SectorRecord {
  id: string;
  name: string;
  active: boolean;
  createdAt: Timestamp;
}

export function SectorManagement() {
  const [sectors, setSectors] = useState<SectorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
   const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Sandboxed-safe confirmation modals & notifications
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    if (auth.currentUser) {
      getProfile(auth.currentUser.uid).then(setProfile);
    }
  }, []);

  const handleDeleteAllHistory = () => {
    if (confirmText !== 'APAGAR') {
      setNotification({ message: "Por favor, digite 'APAGAR' exatamente no campo para habilitar a exclusão.", type: 'error' });
      return;
    }
    setShowDeleteModal(true);
  };

  const executeDeleteAllHistory = async () => {
    setShowDeleteModal(false);
    setIsDeletingAll(true);

    try {
      const formsSnapshot = await getDocs(collection(db, 'forms'));
      const evalsSnapshot = await getDocs(collection(db, 'evaluations'));

      if (formsSnapshot.empty && evalsSnapshot.empty) {
        setNotification({ message: "O banco de dados já está limpo!", type: 'info' });
        setIsDeletingAll(false);
        setConfirmText('');
        return;
      }

      let count = 0;
      let batch = writeBatch(db);

      for (const fDoc of formsSnapshot.docs) {
        batch.delete(doc(db, 'forms', fDoc.id));
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      for (const eDoc of evalsSnapshot.docs) {
        batch.delete(doc(db, 'evaluations', eDoc.id));
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }

      setNotification({ message: "Todo o histórico de pesquisas foi zerado com sucesso!", type: 'success' });
      setConfirmText('');
    } catch (error: any) {
      console.error("Error clearing database info:", error);
      setNotification({ 
        message: `Erro ao realizar exclusão: ${error.message || error.code || 'Verifique suas credenciais de administrador.'}`, 
        type: 'error' 
      });
    } finally {
      setIsDeletingAll(false);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'sectors'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SectorRecord[];
      setSectors(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sectors');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      await addDoc(collection(db, 'sectors'), {
        name: newName.trim(),
        active: true,
        createdAt: serverTimestamp(),
      });
      setNewName('');
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'sectors');
    }
  };

  const handleToggleStatus = async (sector: SectorRecord) => {
    try {
      // Recreating the object to satisfy the isValidSector rule in firestore
      // Note: Rules require createdAt to be unchanged during update
      await updateDoc(doc(db, 'sectors', sector.id), {
        active: !sector.active,
        // The rule requires: isValidSector(request.resource.data) && request.resource.data.createdAt == resource.data.createdAt
        // So we just send the fields that change, and the ones required by isValidSector helper
        name: sector.name,
        createdAt: sector.createdAt
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `sectors/${sector.id}`);
    }
  };

  const handleUpdateName = async (id: string, oldCreatedAt: Timestamp) => {
    if (!editingName.trim()) return;
    try {
      await updateDoc(doc(db, 'sectors', id), {
        name: editingName.trim(),
        createdAt: oldCreatedAt, // Required by rules gate
        active: sectors.find(s => s.id === id)?.active ?? true
      });
      setEditingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `sectors/${id}`);
    }
  };

  const handleSeedDefaultSectors = () => {
    setShowSeedModal(true);
  };

  const executeSeedDefaultSectors = async () => {
    setShowSeedModal(false);
    const defaultSectors = [
      "Portaria/Segurança", "Recepção Geral", "Triagem", "Consultas Médicas",
      "Consultas Multiprofissionais", "Realização de Exames", "Laboratório",
      "Entrega de Exames", "CER", "Ambiente", "Limpeza", "Higiene e Organização dos Banheiros"
    ];

    try {
      for (const name of defaultSectors) {
        if (!sectors.find(s => s.name === name)) {
          await addDoc(collection(db, 'sectors'), {
            name,
            active: true,
            createdAt: serverTimestamp(),
          });
        }
      }
      setNotification({ message: "Setores padrão carregados com sucesso!", type: 'success' });
    } catch (error) {
      setNotification({ message: "Erro ao cadastrar setores padrão.", type: 'error' });
    }
  };

  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setIsDeletingId(null);
    console.log("Starting deletion for:", id);
    try {
      await deleteDoc(doc(db, 'sectors', id));
      console.log("Deletion successful:", id);
      setNotification({ message: "Setor excluído com sucesso!", type: 'success' });
    } catch (error: any) {
      console.error("Deletion Error:", error);
      setNotification({ message: `Erro ao excluir setor: ${error.message || error.code || 'Erro desconhecido'}`, type: 'error' });
    }
  };

  const isAdminUser = profile?.role === 'admin' || auth.currentUser?.email === 'poli.almoxarifado@gmail.com';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Gestão de Setores</h2>
            <p className="text-slate-500 text-sm">Adicione ou ative/desative os setores da policlínica.</p>
          </div>
          <div className="flex gap-2">
            {sectors.length === 0 && !loading && (
              <button
                onClick={handleSeedDefaultSectors}
                className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
              >
                Popular Padrão
              </button>
            )}
            {!isAdding && (
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
              >
                <Plus className="w-4 h-4" />
                Novo Setor
              </button>
            )}
          </div>
        </div>

        {isAdding && (
          <form onSubmit={handleAdd} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8 flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Nome do Setor</label>
              <input
                type="text"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Farmácia, Almoxarifado..."
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-6 py-3 rounded-xl border border-slate-200 text-slate-500 font-bold hover:bg-white transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all shadow-md"
              >
                Cadastrar
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center p-10">
            <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        ) : sectors.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-slate-100 rounded-3xl">
            <p className="text-slate-400">Nenhum setor cadastrado.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sectors.map((sector) => (
              <div key={sector.id} className="py-4 flex items-center justify-between gap-4 group">
                <div className="flex-1 flex items-center gap-4">
                  <div className={cn(
                    "w-3 h-3 rounded-full",
                    sector.active ? "bg-emerald-500" : "bg-slate-300"
                  )} />
                  
                  {editingId === sector.id ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                        autoFocus
                      />
                      <button 
                        onClick={() => handleUpdateName(sector.id, sector.createdAt)}
                        className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setEditingId(null)}
                        className="p-1.5 bg-slate-50 text-slate-400 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1">
                      <h3 className={cn("font-bold transition-colors", sector.active ? "text-slate-900" : "text-slate-400 line-through")}>
                        {sector.name}
                      </h3>
                      {!sector.active && <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 uppercase font-black tracking-tighter">Inativo</span>}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-100 transition-opacity">
                  {isDeletingId === sector.id ? (
                    <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                       <button
                         onClick={() => handleDelete(sector.id)}
                         className="px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 shadow-sm"
                       >
                         Confirmar
                       </button>
                       <button
                         onClick={() => setIsDeletingId(null)}
                         className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"
                       >
                         <X className="w-4 h-4" />
                       </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleToggleStatus(sector)}
                        title={sector.active ? "Desativar" : "Ativar"}
                        className={cn(
                          "p-2 rounded-lg transition-colors",
                          sector.active ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"
                        )}
                      >
                        {sector.active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => { setEditingId(sector.id); setEditingName(sector.name); }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setIsDeletingId(sector.id)}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-amber-50 rounded-2xl p-6 border border-amber-100">
        <h3 className="text-amber-900 font-bold mb-2 flex items-center gap-2">
          Atenção
        </h3>
        <p className="text-amber-700 text-sm leading-relaxed">
          Setores desativados não aparecerão no formulário de Nova Avaliação para evitar novos lançamentos, mas os registros antigos desses setores continuarão visíveis no histórico e dashboard.
        </p>
      </div>

      {/* Database Maintenance Section */}
      {isAdminUser && (
        <div className="bg-white rounded-[2rem] p-8 border border-rose-100 shadow-sm space-y-6">
          <div className="flex gap-4 items-start">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-rose-950 tracking-tight">Perigo: Limpeza do Banco de Dados</h3>
              <p className="text-slate-500 text-sm mt-1 leading-relaxed">
                Esta ação apagará <strong>permanentemente</strong> toda a memória de pesquisas, formulários e classificações por setores. Ideal para começar a usar a ferramenta oficialmente após a conclusão da etapa de testes.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5 flex-1 max-w-sm">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-1">Digite APAGAR para liberar</label>
              <input 
                type="text" 
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Escreva APAGAR aqui" 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-rose-700 tracking-wider focus:ring-2 focus:ring-rose-500 outline-none animate-none"
              />
            </div>

            <button
              onClick={handleDeleteAllHistory}
              disabled={confirmText !== 'APAGAR' || isDeletingAll}
              className="flex items-center justify-center gap-2 px-8 py-3.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-100 disabled:text-slate-450 text-white rounded-2xl font-black text-sm transition-all shadow-lg hover:shadow-rose-100 active:scale-95 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {isDeletingAll ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Limpando registros...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Zerar Histórico de Pesquisas
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Safety Notifications & Interactive Modals (no window.confirm blocked by iframes) */}
      {notification && (
        <div className={cn(
          "fixed top-4 right-4 z-50 p-4 rounded-2xl shadow-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 max-w-sm",
          notification.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" :
          notification.type === 'error' ? "bg-rose-50 border-rose-100 text-rose-800" :
          "bg-slate-50 border-slate-100 text-slate-800"
        )}>
          <div className="text-xs font-extrabold flex-1 leading-snug">{notification.message}</div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
        </div>
      )}

      {showSeedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] max-w-sm w-full p-8 border border-slate-100 shadow-2xl space-y-6 relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowSeedModal(false)}
              className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 font-bold p-1 rounded-full hover:bg-slate-50 transition-colors"
            >
              ✕
            </button>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <Plus className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Popular Setores Padrão?</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto text-center leading-relaxed">
                Isso criará automaticamente os setores padrão da Policlínica (Segurança, Recepção, Triagem, Consultas, Banheiros, etc.).
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSeedModal(false)}
                className="flex-1 py-3 text-xs font-black text-slate-500 hover:bg-slate-55 rounded-xl border border-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={executeSeedDefaultSectors}
                className="flex-1 py-3 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer shadow-md shadow-blue-100"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] max-w-sm w-full p-8 border border-rose-100 shadow-2xl space-y-6 relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowDeleteModal(false)}
              className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 font-bold p-1 rounded-full hover:bg-slate-50 transition-colors"
            >
              ✕
            </button>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-rose-50 text-rose-650 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-rose-950 tracking-tight text-center">CONFIRMAR DELEÇÃO</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto text-center leading-relaxed">
                Você tem certeza absoluta que deseja excluir <strong>permanentemente</strong> todo o histórico de pesquisas, formulários e as avaliações por setor no banco de dados? Esta ação é definitiva e irreversível!
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-3 text-xs font-black text-slate-550 hover:bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
              >
                Cancelar Exclusão
              </button>
              <button
                onClick={executeDeleteAllHistory}
                className="flex-1 py-3 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-xl cursor-pointer shadow-md shadow-rose-100"
              >
                Sim, Deletar Tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
