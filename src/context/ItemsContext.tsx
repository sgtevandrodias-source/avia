import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as db from '../db/database';
import { useCategorias } from './CategoriasContext';
import { agendarNotificacaoDoItem, cancelarNotificacoesDoItem } from '../notifications/notifications';
import { sincronizar } from '../sync/sync';
import {
  existeOcorrenciaNaSerie,
  gerarOcorrenciasPendentes,
  proximaDataRecorrencia,
  proximaOcorrencia,
  raizDaSerie,
} from '../utils/recorrencia';
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

  // Gatilho por tempo (Fase 1): roda a cada carregamento dos itens (abrir o
  // app, voltar do background, sincronizar) e gera as ocorrências que
  // faltam pra cada série recorrente cuja data já passou por completo — sem
  // depender do usuário ter concluído nenhum ciclo. Convive com o gatilho
  // por conclusão (gerarProximaOcorrenciaSeNecessario) sem duplicar: os dois
  // conferem se a data já existe na série antes de criar.
  const recarregar = useCallback(async () => {
    const lista = await db.listarItens();
    const { series } = gerarOcorrenciasPendentes(lista);
    let criouAlgo = false;
    for (const serie of series) {
      const idsParaAtualizar = [...serie.idsExistentesParaAtualizar];
      for (const novoItem of serie.novasOcorrencias) {
        const criado = await db.criarItem(novoItem);
        agendarNotificacaoDoItem(criado).catch(() => {});
        idsParaAtualizar.push(criado.id);
        criouAlgo = true;
      }
      // Bookmark de até onde a série já foi gerada — grava em TODO item da
      // série (os que já existiam e os recém-criados agora), mesmo que a
      // ocorrência correspondente venha a ser apagada depois (é isso que
      // evita ela "voltar" no próximo carregamento, mesmo se a raiz for uma
      // das apagadas).
      for (const id of idsParaAtualizar) {
        await db.marcarRecorrenciaGeradaAte(id, serie.recorrenciaGeradaAte);
      }
    }
    setItens(criouAlgo ? await db.listarItens() : lista);
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

  // Além de abrir o app, também roda a checagem de recorrência (via
  // recarregar) quando o app volta do background — senão um app que fica
  // muito tempo em segundo plano só re-checaria no próximo cold start.
  useEffect(() => {
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        recarregar();
      }
    });
    return () => assinatura.remove();
  }, [recarregar]);

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
  // item é concluído fora do dia previsto). Confere antes se essa data já
  // não foi gerada pelo gatilho por tempo (Fase 1), pra não duplicar quando
  // os dois gatilhos coincidem no mesmo dia. Também avança o bookmark em
  // todo item sobrevivente da série (mesmo mecanismo do gatilho por tempo),
  // pra que apagar essa ocorrência depois não a faça "voltar" — mesmo que a
  // raiz seja uma das que já foram apagadas.
  const gerarProximaOcorrenciaSeNecessario = useCallback(
    async (item: Item) => {
      const proximaData = proximaDataRecorrencia(item.data, item.recorrencia);
      if (!proximaData) return;
      const raizId = raizDaSerie(item);
      if (existeOcorrenciaNaSerie(itens, raizId, proximaData)) return;
      const novoItem = await adicionarItem(proximaOcorrencia(item, proximaData));
      const idsDaSerie = itens.filter((i) => raizDaSerie(i) === raizId).map((i) => i.id);
      for (const id of [...idsDaSerie, novoItem.id]) {
        db.marcarRecorrenciaGeradaAte(id, proximaData);
      }
    },
    [itens, adicionarItem],
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
