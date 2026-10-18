import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../auth/AuthContext';
import { navegarPara } from '../navigation/navigationRef';
import * as armazenamento from '../alivia/armazenamento';
import {
  compartilharPensamentos,
  listarCompartilhamentosPensamentos,
  removerCompartilhamentoPensamento,
  responderCompartilhamentoPensamento,
} from '../alivia/api';
import type { Pensamento, PensamentoEnviado, PensamentoRecebido } from '../alivia/tipos';

// Estado do "Avia que alivia!" — totalmente separado de ItemsContext e
// CompartilhamentosContext. Toda chamada de rede aqui é "best-effort": se
// as rotas novas estiverem fora do ar (ou o Worker ainda não tiver sido
// atualizado), esta área mostra o que tem e o resto do app segue normal.

interface AliviaContextValue {
  pensamentos: Pensamento[];
  enviados: PensamentoEnviado[];
  recebidos: PensamentoRecebido[];
  carregando: boolean;
  quantidadeConvitesPendentes: number;
  // Conta com criptografia configurada mas bloqueada neste aparelho:
  // escrever fica desabilitado (o registro iria pro servidor sem cifra).
  escritaBloqueada: boolean;
  recarregar: () => Promise<void>;
  criar: (titulo: string, texto: string) => Promise<void>;
  editar: (id: string, titulo: string, texto: string) => Promise<void>;
  apagar: (id: string) => Promise<void>;
  compartilharComUsuario: (email: string, pensamentos: Pensamento[]) => Promise<void>;
  responder: (id: string, aceitar: boolean) => Promise<void>;
  removerCompartilhamento: (id: string) => Promise<void>;
}

const AliviaContext = createContext<AliviaContextValue | null>(null);

const TIPO_PUSH = 'pensamento_compartilhado';

export function AliviaProvider({ children }: { children: React.ReactNode }) {
  const { usuario, criptografiaBloqueada } = useAuth();
  const [pensamentos, setPensamentos] = useState<Pensamento[]>([]);
  const [enviados, setEnviados] = useState<PensamentoEnviado[]>([]);
  const [recebidos, setRecebidos] = useState<PensamentoRecebido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const podeEnviarRef = useRef(!criptografiaBloqueada);
  podeEnviarRef.current = !criptografiaBloqueada;

  const lerLocal = useCallback(async () => {
    try {
      setPensamentos(await armazenamento.listarPensamentos());
    } catch {
      // Web sem conexão / rota fora do ar: mantém o que já estava na tela.
    }
  }, []);

  const lerCompartilhamentos = useCallback(async () => {
    try {
      const { enviados: e, recebidos: r } = await listarCompartilhamentosPensamentos();
      setEnviados(e);
      setRecebidos(r);
    } catch {
      // idem — best-effort.
    }
  }, []);

  const recarregar = useCallback(async () => {
    await armazenamento.sincronizarPensamentos({ podeEnviar: podeEnviarRef.current });
    await Promise.all([lerLocal(), lerCompartilhamentos()]);
  }, [lerLocal, lerCompartilhamentos]);

  // Carga inicial e troca de conta (cada conta tem o próprio banco local).
  // Também relê ao desbloquear a criptografia: registros que estavam
  // cifrados passam a aparecer, e os pendentes podem enfim ser enviados.
  useEffect(() => {
    setPensamentos([]);
    setEnviados([]);
    setRecebidos([]);
    setCarregando(true);
    lerLocal().then(() => recarregar()).finally(() => setCarregando(false));
  }, [usuario?.id, criptografiaBloqueada, lerLocal, recarregar]);

  // Voltou pro app: sincroniza (pega convites novos e registros de outros aparelhos).
  useEffect(() => {
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') recarregar();
    });
    return () => assinatura.remove();
  }, [recarregar]);

  // Push "Fulano compartilhou um registro com você" (ver worker/src/pensamentos.ts).
  useEffect(() => {
    const abrir = async (dados: Record<string, unknown> | undefined) => {
      if (dados?.tipo !== TIPO_PUSH) return;
      await recarregar();
      navegarPara('Alivia', { aba: 'recebidos' });
    };
    Notifications.getLastNotificationResponseAsync()
      .catch(() => null)
      .then((resposta) => {
        if (resposta) abrir(resposta.notification.request.content.data);
      });
    const toque = Notifications.addNotificationResponseReceivedListener((resposta) => {
      abrir(resposta.notification.request.content.data);
    });
    // Chegou com o app aberto: só atualiza a lista de convites.
    const chegada = Notifications.addNotificationReceivedListener((notificacao) => {
      if (notificacao.request.content.data?.tipo === TIPO_PUSH) lerCompartilhamentos();
    });
    return () => {
      toque.remove();
      chegada.remove();
    };
  }, [recarregar, lerCompartilhamentos]);

  const criar = useCallback(
    async (titulo: string, texto: string) => {
      const novo = await armazenamento.criarPensamento(titulo, texto);
      setPensamentos((lista) => [novo, ...lista]);
      armazenamento.sincronizarPensamentos({ podeEnviar: podeEnviarRef.current });
    },
    [],
  );

  const editar = useCallback(async (id: string, titulo: string, texto: string) => {
    await armazenamento.editarPensamento(id, titulo, texto);
    const agora = new Date().toISOString();
    setPensamentos((lista) => lista.map((p) => (p.id === id ? { ...p, titulo, texto, atualizadoEm: agora } : p)));
    armazenamento.sincronizarPensamentos({ podeEnviar: podeEnviarRef.current });
  }, []);

  const apagar = useCallback(
    async (id: string) => {
      await armazenamento.apagarPensamento(id);
      setPensamentos((lista) => lista.filter((p) => p.id !== id));
      setEnviados((lista) => lista.filter((e) => e.pensamentoId !== id));
      await armazenamento.sincronizarPensamentos({ podeEnviar: podeEnviarRef.current });
    },
    [],
  );

  const compartilharComUsuario = useCallback(
    async (email: string, selecionados: Pensamento[]) => {
      // O servidor só aceita compartilhar registros que ele já conhece —
      // garante que os criados offline neste aparelho foram enviados antes.
      await armazenamento.sincronizarPensamentos({ podeEnviar: podeEnviarRef.current });
      await compartilharPensamentos(email, selecionados);
      await lerCompartilhamentos();
    },
    [lerCompartilhamentos],
  );

  const responder = useCallback(
    async (id: string, aceitar: boolean) => {
      await responderCompartilhamentoPensamento(id, aceitar);
      await lerCompartilhamentos();
    },
    [lerCompartilhamentos],
  );

  const removerCompartilhamento = useCallback(async (id: string) => {
    await removerCompartilhamentoPensamento(id);
    setEnviados((lista) => lista.filter((e) => e.id !== id));
    setRecebidos((lista) => lista.filter((r) => r.id !== id));
  }, []);

  const quantidadeConvitesPendentes = useMemo(
    () => recebidos.filter((r) => r.status === 'pendente').length,
    [recebidos],
  );

  const valor = useMemo<AliviaContextValue>(
    () => ({
      pensamentos,
      enviados,
      recebidos,
      carregando,
      quantidadeConvitesPendentes,
      escritaBloqueada: criptografiaBloqueada,
      recarregar,
      criar,
      editar,
      apagar,
      compartilharComUsuario,
      responder,
      removerCompartilhamento,
    }),
    [
      pensamentos,
      enviados,
      recebidos,
      carregando,
      quantidadeConvitesPendentes,
      criptografiaBloqueada,
      recarregar,
      criar,
      editar,
      apagar,
      compartilharComUsuario,
      responder,
      removerCompartilhamento,
    ],
  );

  return <AliviaContext.Provider value={valor}>{children}</AliviaContext.Provider>;
}

export function useAlivia() {
  const ctx = useContext(AliviaContext);
  if (!ctx) throw new Error('useAlivia deve ser usado dentro de AliviaProvider');
  return ctx;
}
