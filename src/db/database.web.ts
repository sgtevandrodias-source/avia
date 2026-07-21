import * as Crypto from 'expo-crypto';
import type { CategoriaItem, Item, NovaCategoria, NovoItem } from '../types/item';
import { obterTokenAtual } from '../auth/sessionToken';
import { API_URL } from '../sync/config';

// Build web: não há SQLite local (expo-sqlite não builda no Metro web),
// então esse arquivo fala direto com o Worker Cloudflare a cada operação.
// As funções de sync abaixo existem só pra satisfazer a mesma interface
// usada por sync.ts/ItemsContext — no web não há nada local pra reconciliar.

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resposta = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${obterTokenAtual()}`,
      ...options?.headers,
    },
  });
  if (!resposta.ok) throw new Error(`Falha na API: ${resposta.status}`);
  return resposta.json();
}

export async function listarItens(): Promise<Item[]> {
  const itens = await request<Item[]>('/items');
  return itens.slice().sort((a, b) => a.data.localeCompare(b.data));
}

export async function criarItem(novoItem: NovoItem): Promise<Item> {
  const agora = new Date().toISOString();
  const item: Item = {
    ...novoItem,
    prioridade: novoItem.prioridade ?? false,
    origemRecorrenciaId: novoItem.origemRecorrenciaId ?? null,
    recorrenciaGeradaAte: null,
    id: Crypto.randomUUID(),
    status: 'pendente',
    criadoEm: agora,
    concluidoEm: null,
    atualizadoEm: agora,
  };
  await request('/items', { method: 'POST', body: JSON.stringify(item) });
  return item;
}

export async function atualizarItem(item: Item): Promise<void> {
  const atualizado: Item = { ...item, atualizadoEm: new Date().toISOString() };
  await request(`/items/${item.id}`, { method: 'PUT', body: JSON.stringify(atualizado) });
}

export async function marcarStatus(id: string, status: Item['status']): Promise<void> {
  const atual = await request<Item>(`/items/${id}`);
  const agora = new Date().toISOString();
  const atualizado: Item = {
    ...atual,
    status,
    concluidoEm: status === 'feito' ? agora : null,
    atualizadoEm: agora,
  };
  await request(`/items/${id}`, { method: 'PUT', body: JSON.stringify(atualizado) });
}

export async function marcarPrioridade(id: string, prioridade: boolean): Promise<void> {
  const atual = await request<Item>(`/items/${id}`);
  const atualizado: Item = { ...atual, prioridade, atualizadoEm: new Date().toISOString() };
  await request(`/items/${id}`, { method: 'PUT', body: JSON.stringify(atualizado) });
}

export async function marcarRecorrenciaGeradaAte(id: string, data: string): Promise<void> {
  const atual = await request<Item>(`/items/${id}`);
  if (atual.recorrenciaGeradaAte && atual.recorrenciaGeradaAte >= data) return;
  const atualizado: Item = { ...atual, recorrenciaGeradaAte: data, atualizadoEm: new Date().toISOString() };
  await request(`/items/${id}`, { method: 'PUT', body: JSON.stringify(atualizado) });
}

export async function excluirItem(id: string): Promise<void> {
  await request(`/items/${id}`, { method: 'DELETE' });
}

export async function upsertItemLocal(): Promise<void> {}
export async function removerItemLocal(): Promise<void> {}
export async function itensAlteradosDesde(): Promise<Item[]> {
  return [];
}
export async function listarExclusoesPendentes(): Promise<string[]> {
  return [];
}
export async function removerExclusaoPendente(): Promise<void> {}
export async function getMeta(): Promise<string | null> {
  return null;
}
export async function setMeta(): Promise<void> {}

// ---- Categorias (Fase 3) ----

export async function listarCategorias(): Promise<CategoriaItem[]> {
  return request<CategoriaItem[]>('/categorias');
}

export async function criarCategoria(nova: NovaCategoria): Promise<CategoriaItem> {
  const agora = new Date().toISOString();
  const categoria: CategoriaItem = {
    ...nova,
    ordem: nova.ordem ?? 999,
    id: Crypto.randomUUID(),
    criadoEm: agora,
    atualizadoEm: agora,
  };
  await request('/categorias', { method: 'POST', body: JSON.stringify(categoria) });
  return categoria;
}

export async function atualizarCategoria(categoria: CategoriaItem): Promise<void> {
  const atualizado: CategoriaItem = { ...categoria, atualizadoEm: new Date().toISOString() };
  await request(`/categorias/${categoria.id}`, { method: 'PUT', body: JSON.stringify(atualizado) });
}

export async function excluirCategoria(id: string): Promise<void> {
  await request(`/categorias/${id}`, { method: 'DELETE' });
}

export async function upsertCategoriaLocal(): Promise<void> {}
export async function removerCategoriaLocal(): Promise<void> {}
export async function categoriasAlteradasDesde(): Promise<CategoriaItem[]> {
  return [];
}
export async function listarExclusoesPendentesCategorias(): Promise<string[]> {
  return [];
}
export async function removerExclusaoPendenteCategoria(): Promise<void> {}

// Build web: nunca teve cache local (cada operação já fala direto com a
// API, escopada pelo token do usuário logado) — nada pra limpar.
export async function limparTudoLocal(): Promise<void> {}
