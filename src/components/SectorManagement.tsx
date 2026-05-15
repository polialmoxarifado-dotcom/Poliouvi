import { useState, useEffect, FormEvent } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Plus, Trash2, Check, X, Pencil, Save } from 'lucide-react';
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

  const handleSeedDefaultSectors = async () => {
    if (!window.confirm('Deseja carregar os setores padrão da Policlínica?')) return;
    
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
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'sectors');
    }
  };

  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setIsDeletingId(null);
    console.log("Starting deletion for:", id);
    try {
      await deleteDoc(doc(db, 'sectors', id));
      console.log("Deletion successful:", id);
    } catch (error: any) {
      console.error("Deletion Error:", error);
      alert(`Erro ao excluir: ${error.message || error.code || 'Erro desconhecido'}`);
    }
  };

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
    </div>
  );
}
