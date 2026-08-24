import * as db from '../db/database';
import { obterTokenAtual } from '../auth/sessionToken';
import { cancelarNotificacoesDoItem } from '../notifications/notifications';
import { cifrarItemParaEnvio, decifrarItemRecebido } from '../crypto/itemCriptografia';
import { API_URL } from './config';
import type { CategoriaItem, Item, ItemCompartilhadoLocal } from '../types/item';

const CHAVE_ULTIMA_SYNC = 'ultimaSincronizacao';
const CHAVE_ULTIMA_SYNC_CATEGORIAS = 'ultimaSincronizacaoCategorias';
const CHAVE_ULTIMA_SYNC_COMPARTILHAMENTOS = 'ultimaSincronizacaoCompartilhamentos';
const CHAVE_STATUS_SYNC = 'statusUltimaSincronizacao';
const TIMEOUT_MS = 8000;

export interface StatusSincronizacao {
  quando: string; // ISO — relógio do próprio aparelho; só usado pra exibir "há quanto tempo", nunca comparado com timestamps do servidor.
  ok: boolean;
}

export async function obterStatusSincronizacao(): Promise<StatusSincronizacao | null> {
  const valor = await db.getMeta(CHAVE_STATUS_SYNC);
  return valor ? (JSON.parse(valor) as StatusSincronizacao) : null;
}

interface ItemRemoto extends Item {
  excluido?: boolean;
}

interface CategoriaRemota extends CategoriaItem {
  excluido?: boolean;
}

async function fetchComTimeout(url: string, opcoes?: RequestInit): Promise<Response> {
  const token = obterTokenAtual();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opcoes,
      headers: { ...opcoes?.headers, Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function enviarExclusoesPendentes(): Promise<void> {
  const pendentes = await db.listarExclusoesPendentes();
  for (const id of pendentes) {
    await fetchComTimeout(`${API_URL}/items/${id}`, { method: 'DELETE' });
    await db.removerExclusaoPendente(id);
  }
}

async function enviarAlteracoesLocais(desde: string | null): Promise<void> {
  const alterados = await db.itensAlteradosDesde(desde);
  for (const item of alterados) {
    await fetchComTimeout(`${API_URL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cifrarItemParaEnvio(item)),
    });
  }
}

/** Retorna o `servidorEm` (relógio do Worker) devolvido pela API pra usar como próximo cursor, ou `null` se a chamada falhou (não avança o cursor nesse caso). */
async function receberAlteracoesRemotas(desde: string | null): Promise<string | null> {
  const resposta = await fetchComTimeout(
    desde ? `${API_URL}/items?since=${encodeURIComponent(desde)}` : `${API_URL}/items`,
  );
  if (!resposta.ok) return null;
  const { itens: recebidos, servidorEm }: { itens: ItemRemoto[]; servidorEm: string } = await resposta.json();
  const remotos = recebidos.map((item) => decifrarItemRecebido(item));
  const locais = await db.itensAlteradosDesde(null);
  const mapaLocal = new Map(locais.map((i) => [i.id, i]));

  for (const remoto of remotos) {
    const local = mapaLocal.get(remoto.id);
    // Last write wins: só aplica a versão remota se ela for mais nova que a local.
    if (local && local.atualizadoEm >= remoto.atualizadoEm) continue;

    if (remoto.excluido) {
      // Sem isso, um item apagado em OUTRO aparelho (ou direto no servidor)
      // nunca cancelava o lembrete já agendado neste aparelho — ele ficava
      // órfão no sistema operacional e disparava mesmo com o item sumido
      // da lista (causa dos lembretes repetidos "fantasma").
      await cancelarNotificacoesDoItem(remoto.id);
      await db.removerItemLocal(remoto.id);
    } else {
      await db.upsertItemLocal(remoto);
    }
  }
  return servidorEm;
}

async function enviarExclusoesPendentesCategorias(): Promise<void> {
  const pendentes = await db.listarExclusoesPendentesCategorias();
  for (const id of pendentes) {
    await fetchComTimeout(`${API_URL}/categorias/${id}`, { method: 'DELETE' });
    await db.removerExclusaoPendenteCategoria(id);
  }
}

async function enviarAlteracoesLocaisCategorias(desde: string | null): Promise<void> {
  const alteradas = await db.categoriasAlteradasDesde(desde);
  for (const categoria of alteradas) {
    await fetchComTimeout(`${API_URL}/categorias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(categoria),
    });
  }
}

/** Mesmo raciocínio de receberAlteracoesRemotas: cursor vem do relógio do servidor, não do aparelho. */
async function receberAlteracoesRemotasCategorias(desde: string | null): Promise<string | null> {
  const resposta = await fetchComTimeout(
    desde ? `${API_URL}/categorias?since=${encodeURIComponent(desde)}` : `${API_URL}/categorias`,
  );
  if (!resposta.ok) return null;
  const { categorias: remotas, servidorEm }: { categorias: CategoriaRemota[]; servidorEm: string } =
    await resposta.json();
  const locais = await db.categoriasAlteradasDesde(null);
  const mapaLocal = new Map(locais.map((c) => [c.id, c]));

  for (const remota of remotas) {
    const local = mapaLocal.get(remota.id);
    if (local && local.atualizadoEm >= remota.atualizadoEm) continue;

    if (remota.excluido) {
      await db.removerCategoriaLocal(remota.id);
    } else {
      await db.upsertCategoriaLocal(remota);
    }
  }
  return servidorEm;
}

// Compartilhamento (Fase 8): só "puxa" (pull) — não existe fila de push
// própria, porque as ações do usuário (compartilhar, responder, concluir,
// remover) já chamam a API na hora, direto de CompartilhamentosContext, sem
// passar por aqui. O objetivo é só manter o cache local em dia.
interface CompartilhamentoRemoto {
  id: string;
  itemId: string;
  criadorNome: string;
  destinatarioNome?: string;
  status: ItemCompartilhadoLocal['status'];
  titulo: string;
  textoOriginal: string;
  data: string;
  horaCompromisso: string | null;
  horaLimite: string | null;
  tipoHorario: ItemCompartilhadoLocal['tipoHorario'];
  categoriaNome: string;
  categoriaIcone: string;
  categoriaCor: string;
  notas: string | null;
  concluidoPeloDestinatario: boolean;
  atualizadoEm: string;
  excluido?: boolean;
}

/** Mesmo raciocínio de receberAlteracoesRemotas: cursor vem do relógio do servidor. */
async function receberCompartilhamentos(desde: string | null): Promise<string | null> {
  const resposta = await fetchComTimeout(
    desde ? `${API_URL}/compartilhamentos?since=${encodeURIComponent(desde)}` : `${API_URL}/compartilhamentos`,
  );
  if (!resposta.ok) return null;
  const {
    enviados,
    recebidos,
    servidorEm,
  }: { enviados: CompartilhamentoRemoto[]; recebidos: CompartilhamentoRemoto[]; servidorEm: string } =
    await resposta.json();

  for (const [papel, lista] of [
    ['enviado', enviados],
    ['recebido', recebidos],
  ] as const) {
    for (const c of lista) {
      if (c.excluido) {
        await db.removerItemCompartilhadoLocal(c.id);
      } else {
        await db.upsertItemCompartilhadoLocal({ ...c, papel });
      }
    }
  }
  return servidorEm;
}

/**
 * Sincroniza o SQLite local com o Worker Cloudflare. Nunca lança erro:
 * se estiver offline, sem sessão, ou o servidor falhar, apenas encerra
 * silenciosamente e tenta de novo na próxima chamada (o app continua
 * funcionando 100% local).
 */
export async function sincronizar(): Promise<{ ok: boolean }> {
  if (!obterTokenAtual()) return { ok: false };
  try {
    const desdeCategorias = await db.getMeta(CHAVE_ULTIMA_SYNC_CATEGORIAS);
    await enviarExclusoesPendentesCategorias();
    await enviarAlteracoesLocaisCategorias(desdeCategorias);
    const servidorEmCategorias = await receberAlteracoesRemotasCategorias(desdeCategorias);
    // Só avança o cursor se a chamada realmente teve sucesso (servidorEmCategorias
    // não-nulo) — e sempre com o relógio do SERVIDOR, nunca do aparelho (ver
    // comentário em receberAlteracoesRemotasCategorias/no Worker).
    if (servidorEmCategorias) {
      await db.setMeta(CHAVE_ULTIMA_SYNC_CATEGORIAS, servidorEmCategorias);
    }

    const desde = await db.getMeta(CHAVE_ULTIMA_SYNC);
    await enviarExclusoesPendentes();
    await enviarAlteracoesLocais(desde);
    const servidorEm = await receberAlteracoesRemotas(desde);
    if (servidorEm) {
      await db.setMeta(CHAVE_ULTIMA_SYNC, servidorEm);
    }

    const desdeCompartilhamentos = await db.getMeta(CHAVE_ULTIMA_SYNC_COMPARTILHAMENTOS);
    const servidorEmCompartilhamentos = await receberCompartilhamentos(desdeCompartilhamentos);
    if (servidorEmCompartilhamentos) {
      await db.setMeta(CHAVE_ULTIMA_SYNC_COMPARTILHAMENTOS, servidorEmCompartilhamentos);
    }
    await db.setMeta(CHAVE_STATUS_SYNC, JSON.stringify({ quando: new Date().toISOString(), ok: true }));
    return { ok: true };
  } catch {
    await db.setMeta(CHAVE_STATUS_SYNC, JSON.stringify({ quando: new Date().toISOString(), ok: false }));
    return { ok: false };
  }
}

/** Força um pull/push completo (ignora o checkpoint) na próxima sincronização — usado ao logar. */
export async function forcarResyncCompleto(): Promise<void> {
  await db.setMeta(CHAVE_ULTIMA_SYNC, '');
  await db.setMeta(CHAVE_ULTIMA_SYNC_CATEGORIAS, '');
  await db.setMeta(CHAVE_ULTIMA_SYNC_COMPARTILHAMENTOS, '');
}

/**
 * Apaga TODO o cache local (itens, categorias, compartilhamentos) e refaz a
 * sincronização do zero — diferente de forcarResyncCompleto (só reseta o
 * cursor, mantendo o que já estava salvo localmente), isso corrige "itens
 * fantasma": linhas que ficaram presas no aparelho porque o servidor já não
 * as considera ativas há muito tempo. Um pull, completo ou incremental,
 * só informa o que MUDOU — nunca "apaga o que não está mais na resposta" —
 * então um item que o servidor já tinha excluído antes do cursor atual
 * nunca é comunicado de volta pro aparelho, e fica preso local pra sempre
 * (na aba Hoje, inclusive, por causa do rollover de pendentes atrasados).
 * Sincroniza uma vez ANTES de apagar (empurra qualquer alteração local
 * ainda não enviada, pra não perder nada de verdade) e outra DEPOIS
 * (busca tudo de novo com o cache já vazio).
 */
export async function limparCacheLocalERessincronizar(): Promise<void> {
  await sincronizar();
  await db.limparTudoLocal();
  await forcarResyncCompleto();
  await sincronizar();
}

/**
 * Prepara o SQLite local pra uma sessão que acabou de logar (login/cadastro
 * novo, não troca entre contas já salvas — ver alternarConta em
 * AuthContext.tsx, que usa o cursor incremental já existente da conta em
 * vez de forçar tudo de novo). Cada conta tem seu próprio arquivo local
 * (ver definirUsuarioAtivo em database.ts), então não há risco de misturar
 * dados de contas diferentes — só troca qual arquivo está ativo e força um
 * pull/push completo, já que essa sessão pode ser novidade neste aparelho.
 */
export async function prepararSessaoParaUsuario(usuarioId: string): Promise<void> {
  db.definirUsuarioAtivo(usuarioId);
  await forcarResyncCompleto();
}

/**
 * Troca pra outra conta JÁ salva neste aparelho (ver alternarConta em
 * AuthContext.tsx) — ao contrário de prepararSessaoParaUsuario, não força
 * um resync completo: essa conta já tem seu próprio arquivo local com um
 * cursor incremental válido (ver definirUsuarioAtivo em database.ts), então
 * um sincronizar() normal já basta pra pegar só o que mudou desde a última
 * vez que ela esteve ativa neste aparelho — é isso que torna a troca rápida
 * mesmo com rede lenta (a tela já mostra o cache local na hora, e o
 * sincronizar() só complementa em segundo plano).
 */
export async function alternarSessaoParaUsuario(usuarioId: string): Promise<void> {
  db.definirUsuarioAtivo(usuarioId);
  await sincronizar();
}

/**
 * Depois de desbloquear a criptografia (frase-senha ou código de
 * recuperação), o cache SQLite local pode ter itens que foram puxados do
 * servidor ENQUANTO o aparelho estava bloqueado — ficaram salvos com
 * titulo/textoOriginal/notas ainda cifrados (ver receberAlteracoesRemotas).
 * Um resync normal não resolveria isso: o LWW compara `atualizadoEm`, que
 * não mudou, então a versão "mais nova" do servidor nunca seria reaplicada.
 * Em vez disso, decifra em cima do que já está no SQLite, sem rede — no web
 * não existe cache local (cada leitura já decifra na hora, ver
 * database.web.ts), então essa função é só relevante no nativo.
 */
export async function redecifrarCacheLocalAposDesbloqueio(): Promise<void> {
  const locais = await db.itensAlteradosDesde(null);
  for (const item of locais) {
    const decifrado = decifrarItemRecebido(item);
    if (decifrado !== item) {
      await db.upsertItemLocal(decifrado);
    }
  }
}
