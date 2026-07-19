import * as db from '../db/database';
import { obterTokenAtual } from '../auth/sessionToken';
import { API_URL } from './config';
import type { CategoriaItem, Item } from '../types/item';

const CHAVE_ULTIMA_SYNC = 'ultimaSincronizacao';
const CHAVE_ULTIMA_SYNC_CATEGORIAS = 'ultimaSincronizacaoCategorias';
const CHAVE_ULTIMO_USUARIO = 'ultimoUsuarioId';
const TIMEOUT_MS = 8000;

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
      body: JSON.stringify(item),
    });
  }
}

async function receberAlteracoesRemotas(desde: string | null): Promise<void> {
  const resposta = await fetchComTimeout(
    desde ? `${API_URL}/items?since=${encodeURIComponent(desde)}` : `${API_URL}/items`,
  );
  if (!resposta.ok) return;
  const remotos: ItemRemoto[] = await resposta.json();
  const locais = await db.itensAlteradosDesde(null);
  const mapaLocal = new Map(locais.map((i) => [i.id, i]));

  for (const remoto of remotos) {
    const local = mapaLocal.get(remoto.id);
    // Last write wins: só aplica a versão remota se ela for mais nova que a local.
    if (local && local.atualizadoEm >= remoto.atualizadoEm) continue;

    if (remoto.excluido) {
      await db.removerItemLocal(remoto.id);
    } else {
      await db.upsertItemLocal(remoto);
    }
  }
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

async function receberAlteracoesRemotasCategorias(desde: string | null): Promise<void> {
  const resposta = await fetchComTimeout(
    desde ? `${API_URL}/categorias?since=${encodeURIComponent(desde)}` : `${API_URL}/categorias`,
  );
  if (!resposta.ok) return;
  const remotas: CategoriaRemota[] = await resposta.json();
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
    await receberAlteracoesRemotasCategorias(desdeCategorias);
    await db.setMeta(CHAVE_ULTIMA_SYNC_CATEGORIAS, new Date().toISOString());

    const desde = await db.getMeta(CHAVE_ULTIMA_SYNC);
    await enviarExclusoesPendentes();
    await enviarAlteracoesLocais(desde);
    await receberAlteracoesRemotas(desde);
    await db.setMeta(CHAVE_ULTIMA_SYNC, new Date().toISOString());
    return { ok: true };
  } catch {
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
