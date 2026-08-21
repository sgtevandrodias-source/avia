import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as db from '../db/database';
import { useAuth } from '../auth/AuthContext';
import { obterTokenAtual } from '../auth/sessionToken';
import { sincronizar } from '../sync/sync';
import { API_URL } from '../sync/config';
import { navegarPara } from '../navigation/navigationRef';
import { useCategorias } from './CategoriasContext';
import { tituloOuNotasBloqueados } from '../crypto/itemCriptografia';
import { categoriaInfo, type Item, type ItemCompartilhadoLocal } from '../types/item';

interface CompartilhamentosContextValue {
  enviados: ItemCompartilhadoLocal[];
  recebidos: ItemCompartilhadoLocal[];
  carregando: boolean;
  recarregar: () => Promise<void>;
  compartilharItem: (item: Item, emailDestinatario: string) => Promise<void>;
  responderCompartilhamento: (id: string, aceitar: boolean) => Promise<void>;
  alternarConclusaoCompartilhado: (id: string) => Promise<void>;
  removerCompartilhamento: (id: string) => Promise<void>;
}

const CompartilhamentosContext = createContext<CompartilhamentosContextValue | null>(null);

async function chamarApi(caminho: string, opcoes: RequestInit): Promise<void> {
  const resposta = await fetch(`${API_URL}${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${obterTokenAtual()}`,
      ...opcoes.headers,
    },
  });
  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => null);
    throw new Error(dados?.erro ?? 'Não foi possível completar a operação.');
  }
}

export function CompartilhamentosProvider({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  const [itensCompartilhados, setItensCompartilhados] = useState<ItemCompartilhadoLocal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const { categorias } = useCategorias();

  const recarregar = useCallback(async () => {
    setItensCompartilhados(await db.listarItensCompartilhados());
  }, []);

  // Reage a `usuario?.id` além de rodar no mount: cobre tanto a carga
  // inicial quanto a troca pra outra conta salva neste aparelho (ver
  // alternarConta em AuthContext.tsx).
  useEffect(() => {
    recarregar().finally(() => setCarregando(false));
  }, [recarregar, usuario?.id]);

  // As ações abaixo (compartilhar/responder/concluir/remover) chamam a API
  // direto — diferente de items/categorias, não têm fila de push própria.
  // Depois de cada ação, sincroniza (puxa) de verdade em vez de só reler o
  // cache local: a mudança acabou de acontecer no servidor, e reler o cache
  // sem antes atualizá-lo mostraria o estado antigo até o próximo poll
  // automático (até 20s depois).
  const sincronizarERecarregar = useCallback(async () => {
    await sincronizar();
    await recarregar();
  }, [recarregar]);

  // Notificação push de compartilhamento tocada (ver
  // worker/src/index.ts enviarPushCompartilhamento). Dois casos, os dois
  // precisam ser tratados: (1) app já estava aberto (foreground/background)
  // — addNotificationResponseReceivedListener pega o toque ao vivo; (2) app
  // estava fechado de vez — o toque que ABRIU o app aconteceu ANTES desse
  // efeito rodar, então o listener nunca veria esse toque; por isso também
  // confere getLastNotificationResponseAsync() uma vez no mount. Em ambos os
  // casos: sincroniza de verdade (não só sincronizar() cru — sincronizarERecarregar
  // também atualiza o estado React deste contexto, senão a tela Compartilhados
  // só mostraria o convite depois de um remount, exatamente o bug relatado:
  // "só depois que ela fechou e abriu o app que isso aconteceu") e navega.
  useEffect(() => {
    const tratarResposta = async (dados: Record<string, unknown> | undefined) => {
      if (dados?.tipo !== 'compartilhamento') return;
      await sincronizarERecarregar();
      navegarPara('Compartilhados');
    };

    // getLastNotificationResponseAsync não existe no build web (lança
    // UnavailabilityError) — .catch(() => null) evita um erro não tratado
    // no console do PWA, onde essa checagem de cold-start nem faz sentido.
    Notifications.getLastNotificationResponseAsync()
      .catch(() => null)
      .then((resposta) => {
        if (resposta) {
          tratarResposta(resposta.notification.request.content.data);
          Notifications.clearLastNotificationResponseAsync().catch(() => {});
        }
      });

    const assinatura = Notifications.addNotificationResponseReceivedListener((resposta) => {
      tratarResposta(resposta.notification.request.content.data);
    });
    return () => assinatura.remove();
  }, [sincronizarERecarregar]);

  const enviados = useMemo(() => itensCompartilhados.filter((c) => c.papel === 'enviado'), [itensCompartilhados]);
  const recebidos = useMemo(() => itensCompartilhados.filter((c) => c.papel === 'recebido'), [itensCompartilhados]);

  const compartilharItem = useCallback(
    async (item: Item, emailDestinatario: string) => {
      if (tituloOuNotasBloqueados(item)) {
        throw new Error(
          'Este aparelho ainda não tem a chave de criptografia dessa conta — desbloqueie em Configurações antes de compartilhar.',
        );
      }
      const categoria = categoriaInfo(categorias, item.categoria);
      await chamarApi('/compartilhamentos', {
        method: 'POST',
        body: JSON.stringify({
          itemId: item.id,
          emailDestinatario,
          titulo: item.titulo,
          textoOriginal: item.textoOriginal,
          data: item.data,
          horaCompromisso: item.horaCompromisso,
          horaLimite: item.horaLimite,
          tipoHorario: item.tipoHorario,
          categoriaNome: categoria.nome,
          categoriaIcone: categoria.icone,
          categoriaCor: categoria.cor,
          notas: item.notas,
        }),
      });
      await sincronizarERecarregar();
    },
    [categorias, sincronizarERecarregar],
  );

  const responderCompartilhamento = useCallback(
    async (id: string, aceitar: boolean) => {
      await chamarApi(`/compartilhamentos/${id}/responder`, {
        method: 'POST',
        body: JSON.stringify({ aceitar }),
      });
      const atual = itensCompartilhados.find((c) => c.id === id);
      if (atual) {
        const atualizado: ItemCompartilhadoLocal = {
          ...atual,
          status: aceitar ? 'aceito' : 'recusado',
          atualizadoEm: new Date().toISOString(),
        };
        await db.upsertItemCompartilhadoLocal(atualizado);
        setItensCompartilhados((lista) => lista.map((c) => (c.id === id ? atualizado : c)));
      }
    },
    [itensCompartilhados],
  );

  const alternarConclusaoCompartilhado = useCallback(
    async (id: string) => {
      const atual = itensCompartilhados.find((c) => c.id === id);
      if (!atual) return;
      const concluido = !atual.concluidoPeloDestinatario;
      await chamarApi(`/compartilhamentos/${id}/concluir`, {
        method: 'PUT',
        body: JSON.stringify({ concluido }),
      });
      const atualizado: ItemCompartilhadoLocal = {
        ...atual,
        concluidoPeloDestinatario: concluido,
        atualizadoEm: new Date().toISOString(),
      };
      await db.upsertItemCompartilhadoLocal(atualizado);
      setItensCompartilhados((lista) => lista.map((c) => (c.id === id ? atualizado : c)));
    },
    [itensCompartilhados],
  );

  const removerCompartilhamento = useCallback(
    async (id: string) => {
      await chamarApi(`/compartilhamentos/${id}`, { method: 'DELETE' });
      await db.removerItemCompartilhadoLocal(id);
      setItensCompartilhados((atual) => atual.filter((c) => c.id !== id));
    },
    [],
  );

  return (
    <CompartilhamentosContext.Provider
      value={{
        enviados,
        recebidos,
        carregando,
        recarregar,
        compartilharItem,
        responderCompartilhamento,
        alternarConclusaoCompartilhado,
        removerCompartilhamento,
      }}
    >
      {children}
    </CompartilhamentosContext.Provider>
  );
}

export function useCompartilhamentos() {
  const ctx = useContext(CompartilhamentosContext);
  if (!ctx) throw new Error('useCompartilhamentos deve ser usado dentro de CompartilhamentosProvider');
  return ctx;
}
