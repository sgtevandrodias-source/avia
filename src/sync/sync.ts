import * as db from '../db/database';
import { API_URL } from './config';
import { API_KEY } from './secrets';
import type { Item } from '../types/item';

const CHAVE_ULTIMA_SYNC = 'ultimaSincronizacao';
const TIMEOUT_MS = 8000;

interface ItemRemoto extends Item {
  excluido?: boolean;
}

async function fetchComTimeout(url: string, opcoes?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opcoes,
      headers: { ...opcoes?.headers, Authorization: `Bearer ${API_KEY}` },
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

/**
 * Sincroniza o SQLite local com o Worker Cloudflare. Nunca lança erro:
 * se estiver offline ou o servidor falhar, apenas encerra silenciosamente
 * e tenta de novo na próxima chamada (o app continua funcionando 100% local).
 */
export async function sincronizar(): Promise<{ ok: boolean }> {
  try {
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
