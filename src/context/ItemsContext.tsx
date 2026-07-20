import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as db from '../db/database';
import { useCategorias } from './CategoriasContext';
import { agendarNotificacaoDoItem, cancelarNotificacoesDoItem } from '../notifications/notifications';
import { sincronizar } from '../sync/sync';
import { proximaDataRecorrencia, proximaOcorrencia } from '../utils/recorrencia';
import type { Item, NovoItem } from '../types/item';

interface ItemsContextValue {
  itens: Item[];
  carregando: boolean;
  sincronizando: boolean;
  recarregar: () => Promise<void>;
  sincronizarAgora: () => Promise<void>;
  adicionarItem: (novoItem: NovoItem) => Promise<Item>;
  editarItem: (item: Item) => Promise<void>;
  removerItem: (id: string) => Promise<void>;
  alternarStatus: (id: string) => Promise<void>;
  alternarPrioridade: (id: string) => Promise<void>;
}

const ItemsContext = createContext<ItemsContextValue | null>(null);

export function ItemsProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const sincronizacaoEmCurso = useRef(false);
  const { recarregar: recarregarCategorias } = useCategorias();

  const recarregar = useCallback(async () => {
    const lista = await db.listarItens();
    setItens(lista);
  }, []);

  const sincronizarAgora = useCallback(async () => {
    if (sincronizacaoEmCurso.current) return;
    sincronizacaoEmCurso.current = true;
    setSincronizando(true);
    try {
      await sincronizar();
      await Promise.all([recarregar(), recarregarCategorias()]);
    } finally {
      sincronizacaoEmCurso.current = false;
      setSincronizando(false);
    }
  }, [recarregar, recarregarCategorias]);

  useEffect(() => {
    recarregar()
      .finally(() => setCarregando(false))
      .then(() => sincronizarAgora());
  }, [recarregar, sincronizarAgora]);

  const adicionarItem = useCallback(
    async (novoItem: NovoItem) => {
      const item = await db.criarItem(novoItem);
      setItens((atual) => [...atual, item]);
      agendarNotificacaoDoItem(item).catch(() => {});
      sincronizarAgora();
      return item;
    },
    [sincronizarAgora],
  );

  // Se o item tem recorrência e acabou de ser concluído, cria a próxima
  // ocorrência (mesmo título/categoria/horário, data avançada a partir da
  // data original — não da data de hoje, pra não acumular atraso quando o
  // item é concluído fora do dia previsto).
  const gerarProximaOcorrenciaSeNecessario = useCallback(
    (item: Item) => {
      const proximaData = proximaDataRecorrencia(item.data, item.recorrencia);
      if (proximaData) {
        adicionarItem(proximaOcorrencia(item, proximaData));
      }
    },
    [adicionarItem],
  );

  const editarItem = useCallback(
    async (item: Item) => {
      const itemAntes = itens.find((i) => i.id === item.id);
      await db.atualizarItem(item);
      setItens((atual) => atual.map((i) => (i.id === item.id ? item : i)));
      await cancelarNotificacoesDoItem(item.id);
      if (item.status === 'pendente') {
        agendarNotificacaoDoItem(item).catch(() => {});
      } else if (itemAntes?.status === 'pendente' && item.status === 'feito') {
        gerarProximaOcorrenciaSeNecessario(item);
      }
      sincronizarAgora();
    },
    [itens, sincronizarAgora, gerarProximaOcorrenciaSeNecessario],
  );

  const removerItem = useCallback(
    async (id: string) => {
      await db.excluirItem(id);
      await cancelarNotificacoesDoItem(id);
      setItens((atual) => atual.filter((i) => i.id !== id));
      sincronizarAgora();
    },
    [sincronizarAgora],
  );

  const alternarStatus = useCallback(
    async (id: string) => {
      const item = itens.find((i) => i.id === id);
      if (!item) return;
      const novoStatus: Item['status'] = item.status === 'feito' ? 'pendente' : 'feito';
      await db.marcarStatus(id, novoStatus);
      const concluidoEm = novoStatus === 'feito' ? new Date().toISOString() : null;
      setItens((atual) =>
        atual.map((i) => (i.id === id ? { ...i, status: novoStatus, concluidoEm } : i)),
      );
      if (novoStatus === 'feito') {
        await cancelarNotificacoesDoItem(id);
        gerarProximaOcorrenciaSeNecessario({ ...item, status: novoStatus, concluidoEm });
      } else {
        agendarNotificacaoDoItem({ ...item, status: novoStatus, concluidoEm }).catch(() => {});
      }
      sincronizarAgora();
    },
    [itens, sincronizarAgora, gerarProximaOcorrenciaSeNecessario],
  );

  const alternarPrioridade = useCallback(
    async (id: string) => {
      const item = itens.find((i) => i.id === id);
      if (!item) return;
      const prioridade = !item.prioridade;
      await db.marcarPrioridade(id, prioridade);
      setItens((atual) => atual.map((i) => (i.id === id ? { ...i, prioridade } : i)));
      sincronizarAgora();
    },
    [itens, sincronizarAgora],
  );

  return (
    <ItemsContext.Provider
      value={{
        itens,
        carregando,
        sincronizando,
        recarregar,
        sincronizarAgora,
        adicionarItem,
        editarItem,
        removerItem,
        alternarStatus,
        alternarPrioridade,
      }}
    >
      {children}
    </ItemsContext.Provider>
  );
}

export function useItems() {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error('useItems deve ser usado dentro de ItemsProvider');
  return ctx;
}
