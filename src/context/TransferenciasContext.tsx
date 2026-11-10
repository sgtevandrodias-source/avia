import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../auth/AuthContext';
import { obterChaveAtual } from '../crypto/chaveAtual';
import { tituloOuNotasBloqueados } from '../crypto/itemCriptografia';
import { navegarPara } from '../navigation/navigationRef';
import {
  criarTransferencia,
  enviarVersaoAberta,
  ErroTransferencia,
  listarEnviadas,
  listarRecebidas,
  responderTransferencia,
  type TransferenciaEnviada,
  type TransferenciaRecebida,
} from '../transferencias/api';
import { lerAvisosVistos, salvarAvisosVistos } from '../transferencias/avisosVistos';
import type { Item } from '../types/item';
import { useItems } from './ItemsContext';

// Transferência de tarefas entre contas (Fase 3 do plano — ver
// worker/src/transferencias.ts). Guarda: os pedidos recebidos e enviados, o
// modo de seleção de tarefas, e o menu de "segurar o dedo" numa tarefa.

const INTERVALO_ATUALIZACAO_MS = 30_000;

interface TransferenciasContextValue {
  recebidas: TransferenciaRecebida[];
  /** Respostas às minhas transferências que ainda não dispensei ("Fulano aceitou..."). */
  avisos: TransferenciaEnviada[];
  dispensarAviso: (id: string) => void;
  /** Se a tarefa está esperando aceite numa transferência que eu enviei. */
  transferenciaPendenteDoItem: (itemId: string) => TransferenciaEnviada | undefined;

  modoSelecao: boolean;
  selecionados: Set<string>;
  iniciarSelecao: (itemId: string) => void;
  alternarSelecao: (itemId: string) => void;
  selecionarTodas: () => void;
  sairDaSelecao: () => void;
  /** Cada tela de lista informa as tarefas que está mostrando ("Selecionar todas desta seção"). */
  definirListaVisivel: (itens: Item[]) => void;
  podeSelecionar: (item: Item) => boolean;

  itemDoMenu: Item | null;
  abrirMenu: (item: Item) => void;
  fecharMenu: () => void;

  /** Envia as tarefas selecionadas. Devolve o nome de quem vai receber. */
  enviarSelecionadas: (emailDestino: string) => Promise<string>;
  cancelarTransferencia: (id: string) => Promise<void>;
  responderRecebida: (id: string, aceitar: boolean) => Promise<number | undefined>;
  recarregar: () => Promise<void>;
}

const TransferenciasContext = createContext<TransferenciasContextValue | null>(null);

export function TransferenciasProvider({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  const { itens, sincronizarAgora } = useItems();
  const [recebidas, setRecebidas] = useState<TransferenciaRecebida[]>([]);
  const [enviadas, setEnviadas] = useState<TransferenciaEnviada[]>([]);
  const [vistos, setVistos] = useState<string[]>([]);
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [itemDoMenu, setItemDoMenu] = useState<Item | null>(null);
  const listaVisivel = useRef<Item[]>([]);
  const statusAnterior = useRef<Map<string, string>>(new Map());

  const recarregar = useCallback(async () => {
    try {
      const [r, e] = await Promise.all([listarRecebidas(), listarEnviadas()]);
      setRecebidas(r.recebidas);
      setEnviadas(e.enviadas);
      // Uma transferência minha acabou de ser aceita: sincroniza já, pra as
      // tarefas sumirem desta conta (e da agenda deste aparelho) sem esperar.
      const acabouDeSerAceita = e.enviadas.some(
        (t) => t.status === 'aceita' && statusAnterior.current.get(t.id) === 'pendente',
      );
      statusAnterior.current = new Map(e.enviadas.map((t) => [t.id, t.status]));
      if (acabouDeSerAceita) sincronizarAgora();
    } catch {
      // Sem internet ou servidor sem as rotas novas: mantém o que já tinha.
    }
  }, [sincronizarAgora]);

  // Troca de conta: zera tudo e recarrega.
  useEffect(() => {
    setRecebidas([]);
    setEnviadas([]);
    setModoSelecao(false);
    setSelecionados(new Set());
    statusAnterior.current = new Map();
    if (!usuario?.id) return;
    lerAvisosVistos(usuario.id).then(setVistos);
    recarregar();
  }, [usuario?.id, recarregar]);

  // Atualiza ao voltar pro app e, enquanto aberto, a cada 30s.
  useEffect(() => {
    let intervalo: ReturnType<typeof setInterval> | null = null;
    const ligar = () => {
      if (!intervalo) intervalo = setInterval(() => recarregar(), INTERVALO_ATUALIZACAO_MS);
    };
    const desligar = () => {
      if (intervalo) clearInterval(intervalo);
      intervalo = null;
    };
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        recarregar();
        ligar();
      } else {
        desligar();
      }
    });
    if (AppState.currentState === 'active') ligar();
    return () => {
      assinatura.remove();
      desligar();
    };
  }, [recarregar]);

  // Toque na notificação de transferência: atualiza e abre a tela Hoje
  // (onde ficam o cartão do pedido e o aviso de resposta).
  useEffect(() => {
    const assinatura = Notifications.addNotificationResponseReceivedListener((resposta) => {
      if (resposta.notification.request.content.data?.tipo !== 'transferencia') return;
      recarregar().then(() => navegarPara('Hoje'));
    });
    return () => assinatura.remove();
  }, [recarregar]);

  // Botão "voltar" do Android no modo de seleção: só sai da seleção.
  useEffect(() => {
    if (!modoSelecao) return;
    const assinatura = BackHandler.addEventListener('hardwareBackPress', () => {
      setModoSelecao(false);
      setSelecionados(new Set());
      return true;
    });
    return () => assinatura.remove();
  }, [modoSelecao]);

  const pendentesPorItem = useMemo(() => {
    const mapa = new Map<string, TransferenciaEnviada>();
    for (const t of enviadas) {
      if (t.status === 'pendente') for (const id of t.itemIds) mapa.set(id, t);
    }
    return mapa;
  }, [enviadas]);

  const transferenciaPendenteDoItem = useCallback((itemId: string) => pendentesPorItem.get(itemId), [pendentesPorItem]);

  const avisos = useMemo(
    () => enviadas.filter((t) => t.status !== 'pendente' && t.status !== 'cancelada' && !vistos.includes(t.id)),
    [enviadas, vistos],
  );

  const dispensarAviso = useCallback(
    (id: string) => {
      setVistos((atual) => {
        const novo = [...atual, id];
        if (usuario?.id) salvarAvisosVistos(usuario.id, novo);
        return novo;
      });
    },
    [usuario?.id],
  );

  const podeSelecionar = useCallback(
    (item: Item) => !item.somenteLeitura && !pendentesPorItem.has(item.id),
    [pendentesPorItem],
  );

  const iniciarSelecao = useCallback((itemId: string) => {
    setModoSelecao(true);
    setSelecionados(new Set([itemId]));
  }, []);

  const sairDaSelecao = useCallback(() => {
    setModoSelecao(false);
    setSelecionados(new Set());
  }, []);

  const alternarSelecao = useCallback((itemId: string) => {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(itemId)) novo.delete(itemId);
      else novo.add(itemId);
      return novo;
    });
  }, []);

  const selecionarTodas = useCallback(() => {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      for (const item of listaVisivel.current) if (podeSelecionar(item)) novo.add(item.id);
      return novo;
    });
  }, [podeSelecionar]);

  const definirListaVisivel = useCallback((lista: Item[]) => {
    listaVisivel.current = lista;
  }, []);

  // Se uma tarefa selecionada sumir (apagada, sincronização), sai da seleção.
  useEffect(() => {
    if (!modoSelecao) return;
    const existentes = new Set(itens.map((i) => i.id));
    setSelecionados((atual) => {
      const filtrado = new Set([...atual].filter((id) => existentes.has(id)));
      return filtrado.size === atual.size ? atual : filtrado;
    });
  }, [itens, modoSelecao]);

  const enviarSelecionadas = useCallback(
    async (emailDestino: string) => {
      const escolhidas = itens.filter((i) => selecionados.has(i.id));
      if (escolhidas.length === 0) throw new Error('Escolha ao menos uma tarefa.');
      if (escolhidas.some(tituloOuNotasBloqueados)) {
        throw new Error(
          'Algumas tarefas estão bloqueadas neste aparelho — desbloqueie a criptografia em Configurações antes de transferir.',
        );
      }
      const ids = escolhidas.map((i) => i.id);
      const email = emailDestino.trim();

      // Conta com criptografia: o destino tem outra chave e não leria o texto
      // cifrado — manda antes a versão aberta (o usuário já viu o aviso na
      // janela de envio).
      if (obterChaveAtual()) {
        for (const item of escolhidas) await enviarVersaoAberta(item);
      }

      let resultado;
      try {
        resultado = await criarTransferencia(email, ids);
      } catch (erro) {
        // Outro aparelho pode ter reenviado alguma tarefa cifrada no meio do caminho.
        if (erro instanceof ErroTransferencia && erro.codigo === 'cifradas') {
          for (const item of escolhidas.filter((i) => erro.itemIds?.includes(i.id))) await enviarVersaoAberta(item);
          resultado = await criarTransferencia(email, ids);
        } else {
          throw erro;
        }
      }
      sairDaSelecao();
      await recarregar();
      return resultado.para.nome;
    },
    [itens, selecionados, sairDaSelecao, recarregar],
  );

  const cancelarTransferencia = useCallback(
    async (id: string) => {
      await responderTransferencia(id, 'cancelar');
      await recarregar();
    },
    [recarregar],
  );

  const responderRecebida = useCallback(
    async (id: string, aceitar: boolean) => {
      const resultado = await responderTransferencia(id, aceitar ? 'aceitar' : 'recusar');
      setRecebidas((atual) => atual.filter((t) => t.id !== id));
      // Aceitou: as tarefas chegam pela sincronização normal (e vão pra
      // agenda deste aparelho, se a integração estiver ligada).
      if (aceitar) await sincronizarAgora();
      recarregar();
      return resultado.movidas;
    },
    [sincronizarAgora, recarregar],
  );

  const abrirMenu = useCallback((item: Item) => setItemDoMenu(item), []);
  const fecharMenu = useCallback(() => setItemDoMenu(null), []);

  return (
    <TransferenciasContext.Provider
      value={{
        recebidas,
        avisos,
        dispensarAviso,
        transferenciaPendenteDoItem,
        modoSelecao,
        selecionados,
        iniciarSelecao,
        alternarSelecao,
        selecionarTodas,
        sairDaSelecao,
        definirListaVisivel,
        podeSelecionar,
        itemDoMenu,
        abrirMenu,
        fecharMenu,
        enviarSelecionadas,
        cancelarTransferencia,
        responderRecebida,
        recarregar,
      }}
    >
      {children}
    </TransferenciasContext.Provider>
  );
}

export function useTransferencias() {
  const ctx = useContext(TransferenciasContext);
  if (!ctx) throw new Error('useTransferencias deve ser usado dentro de TransferenciasProvider');
  return ctx;
}
