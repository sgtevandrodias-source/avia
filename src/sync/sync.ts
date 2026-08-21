import * as db from '../db/database';
import { obterTokenAtual } from '../auth/sessionToken';
import { cancelarNotificacoesDoItem } from '../notifications/notifications';
import { cifrarItemParaEnvio, decifrarItemRecebido } from '../crypto/itemCriptografia';
import { API_URL } from './config';
import type { CategoriaItem, Item } from '../types/item';

const CHAVE_ULTIMA_SYNC = 'ultimaSincronizacao';
const CHAVE_ULTIMA_SYNC_CATEGORIAS = 'ultimaSincronizacaoCategorias';
const CHAVE_ULTIMO_USUARIO = 'ultimoUsuarioId';
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
}

/**
 * Prepara o SQLite local pra uma sessão que acabou de logar. O aparelho
 * pode ter dados de OUTRA conta salvos localmente (login/logout entre
 * contas diferentes no mesmo aparelho) — se o usuário mudou desde a
 * última vez, apaga tudo antes de puxar os dados da conta atual, senão
 * os dois usuários veriam os itens um do outro misturados.
 */
export async function prepararSessaoParaUsuario(usuarioId: string): Promise<void> {
  const ultimoUsuario = await db.getMeta(CHAVE_ULTIMO_USUARIO);
  if (ultimoUsuario && ultimoUsuario !== usuarioId) {
    await db.limparTudoLocal();
  }
  await db.setMeta(CHAVE_ULTIMO_USUARIO, usuarioId);
  await forcarResyncCompleto();
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
