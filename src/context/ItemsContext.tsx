import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as db from '../db/database';
import { useCategorias } from './CategoriasContext';
import {
  agendarNotificacaoDoItem,
  cancelarNotificacoesDoItem,
  reconciliarNotificacoes,
} from '../notifications/notifications';
import { sincronizar } from '../sync/sync';
import type { Item, NovoItem } from '../types/item';

// Enquanto o app está em primeiro plano, confere o servidor a cada 20s —
// é o que dá a sensação de sincronização automática entre celular e
// computador (ver melhoria pedida). Sem infra nova (WebSocket/push): só
// reaproveita sincronizarAgora(), que já é barata quando não há nada novo.
const INTERVALO_POLLING_MS = 20_000;

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
  const recarregarEmCurso = useRef<Promise<void> | null>(null);
  const { recarregar: recarregarCategorias } = useCategorias();

  // Só lê o que já está no SQLite local. Quem decide e cria a próxima
  // ocorrência de uma série recorrente é o Worker agora
  // (worker/src/recorrencia.ts), nunca o aparelho — é isso que elimina a
  // triplicação: antes, cada aparelho gerava a própria ocorrência de forma
  // independente (e até o mesmo aparelho corria consigo mesmo, disparado por
  // mount/AppState/pós-sync ao mesmo tempo). Novas ocorrências chegam pelo
  // sincronizarAgora() normal, que já roda depois de toda ação.
  //
  // O mutex abaixo (recarregarEmCurso) protege contra chamadas concorrentes
  // de recarregar() no MESMO aparelho: se uma já está em andamento, a nova
  // chamada espera a mesma promessa em vez de disparar uma leitura paralela.
  const recarregar = useCallback(async () => {
    if (recarregarEmCurso.current) return recarregarEmCurso.current;
    const promessa = (async () => {
      setItens(await db.listarItens());
    })();
    recarregarEmCurso.current = promessa;
    try {
      await promessa;
    } finally {
      recarregarEmCurso.current = null;
    }
  }, []);

  const sincronizarAgora = useCallback(async () => {
    if (sincronizacaoEmCurso.current) return;
    sincronizacaoEmCurso.current = true;
    setSincronizando(true);
    try {
      await sincronizar();
      // recarregar()/recarregarCategorias() fazem sua própria chamada de
      // rede (independente do push/pull acima) e podem falhar por um
      // soluço passageiro — sincronizar() já nunca lança por design ("o app
      // continua funcionando 100% local"), então isso aqui precisa seguir a
      // mesma regra. Sem o catch, quem chama sincronizarAgora() dentro de um
      // try/catch (ex.: telas de configurar/desbloquear criptografia) via
      // erroneamente reportar "falhou" mesmo quando a ação principal (ex.:
      // o desbloqueio) já tinha dado certo — só a atualização da lista
      // depois é que tropeçou, e ela mesma se recupera no próximo ciclo.
      await Promise.all([recarregar(), recarregarCategorias()]).catch(() => {});
    } finally {
      sincronizacaoEmCurso.current = false;
      setSincronizando(false);
    }
  }, [recarregar, recarregarCategorias]);

  useEffect(() => {
    recarregar()
      .finally(() => setCarregando(false))
      .then(() => sincronizarAgora())
      .then(async () => {
        // Zera e reagenda os lembretes locais uma vez a cada abertura do
        // app, já com os dados mais atuais (pós-sync) — protege contra
        // lembrete "fantasma" preso no sistema operacional por qualquer bug
        // passado (item apagado/duplicado antes da correção) que tenha
        // deixado notificação órfã agendada num dia anterior.
        const todos = await db.listarItens();
        await reconciliarNotificacoes(todos.filter((i) => i.status === 'pendente'));
      });
  }, [recarregar, sincronizarAgora]);

  // Recarrega ao voltar do background — pode ter chegado sincronização de
  // outro aparelho enquanto o app estava em segundo plano.
  useEffect(() => {
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        recarregar();
        sincronizarAgora();
      }
    });
    return () => assinatura.remove();
  }, [recarregar, sincronizarAgora]);

  // Sincronização "automática" entre aparelhos: enquanto o app está em
  // primeiro plano, verifica o servidor periodicamente — sem isso, lançar
  // algo no celular só aparece no computador quando alguma ação disparar
  // sincronizarAgora() por lá. sincronizarAgora() já tem mutex
  // (sincronizacaoEmCurso), então um tick que cair em cima de uma
  // sincronização em andamento só é ignorado, não empilha.
  useEffect(() => {
    let intervalo: ReturnType<typeof setInterval> | null = null;
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' && !intervalo) {
        intervalo = setInterval(() => sincronizarAgora(), INTERVALO_POLLING_MS);
      } else if (estado !== 'active' && intervalo) {
        clearInterval(intervalo);
        intervalo = null;
      }
    });
    if (AppState.currentState === 'active') {
      intervalo = setInterval(() => sincronizarAgora(), INTERVALO_POLLING_MS);
    }
    return () => {
      assinatura.remove();
      if (intervalo) clearInterval(intervalo);
    };
  }, [sincronizarAgora]);

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

  const editarItem = useCallback(
    async (item: Item) => {
      await db.atualizarItem(item);
      setItens((atual) => atual.map((i) => (i.id === item.id ? item : i)));
      await cancelarNotificacoesDoItem(item.id);
      if (item.status === 'pendente') {
        agendarNotificacaoDoItem(item).catch(() => {});
      }
      // Se o item for recorrente e tiver acabado de ser concluído, o Worker
      // é quem decide/cria a próxima ocorrência (worker/src/recorrencia.ts)
      // — chega no sincronizarAgora() abaixo, não é gerada aqui no aparelho.
      sincronizarAgora();
    },
    [sincronizarAgora],
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
      } else {
        agendarNotificacaoDoItem({ ...item, status: novoStatus, concluidoEm }).catch(() => {});
      }
      // Próxima ocorrência (se recorrente) é responsabilidade do Worker —
      // ver comentário equivalente em editarItem.
      sincronizarAgora();
    },
    [itens, sincronizarAgora],
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
