import * as Crypto from 'expo-crypto';
import type { CategoriaItem, Item, ItemCompartilhadoLocal, NovaCategoria, NovoItem } from '../types/item';
import { obterTokenAtual } from '../auth/sessionToken';
import { conferirRespostaDaSessao } from '../auth/sessaoExpirada';
import { cifrarItemParaEnvio, decifrarItemRecebido } from '../crypto/itemCriptografia';
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
  conferirRespostaDaSessao(resposta);
  if (!resposta.ok) throw new Error(`Falha na API: ${resposta.status}`);
  return resposta.json();
}

// Cópia das tarefas na MEMÓRIA da página (some ao recarregar — nada fica
// gravado no navegador). Antes, o site baixava a lista inteira a cada 20s
// (sincronização automática), o que numa conta grande lia milhares de
// linhas do banco por minuto e chegou perto do limite diário do D1. Agora
// baixa tudo uma vez ao abrir e, depois, só o que mudou (?since=, com o
// relógio do servidor como cursor — mesmo esquema do app do celular).
let cache: { token: string | null; itens: Map<string, Item>; cursor: string; carregadoEm: number } | null = null;

// Rede de segurança: a cada 30 min baixa a lista inteira de novo (corrige
// qualquer coisa que o incremental tenha deixado passar). Ainda assim é
// ~50x menos leitura do que antes (uma lista inteira a cada 20s).
const RECARGA_COMPLETA_MS = 30 * 60 * 1000;
// O cursor volta 2 min: uma tarefa editada num aparelho com o relógio um
// pouco atrasado ganha um atualizadoEm "do passado" e não seria vista. Ler
// de novo os poucos itens dos últimos 2 min é barato (índice
// usuario_id+atualizado_em) e repetir um item não tem efeito.
const MARGEM_CURSOR_MS = 2 * 60 * 1000;

function cursorComMargem(servidorEm: string): string {
  const ms = Date.parse(servidorEm);
  return Number.isNaN(ms) ? servidorEm : new Date(ms - MARGEM_CURSOR_MS).toISOString();
}

/** Descarta a cópia em memória — a próxima leitura baixa tudo de novo. */
export function descartarCacheDeItens(): void {
  cache = null;
}

/** Depois de desbloquear a criptografia: decifra o que ficou guardado ainda cifrado. */
export function redecifrarCacheDeItens(): void {
  if (!cache) return;
  for (const [id, item] of cache.itens) cache.itens.set(id, decifrarItemRecebido(item));
}

function guardarNoCache(item: Item): void {
  if (cache && cache.token === obterTokenAtual()) cache.itens.set(item.id, item);
}

function ordenados(itens: Iterable<Item>): Item[] {
  return [...itens].sort((a, b) => a.data.localeCompare(b.data));
}

export async function listarItens(): Promise<Item[]> {
  const token = obterTokenAtual();
  // Outra conta (ou sessão nova): começa do zero.
  if (!cache || cache.token !== token || Date.now() - cache.carregadoEm > RECARGA_COMPLETA_MS) {
    const { itens, servidorEm } = await request<{ itens: Item[]; servidorEm: string }>('/items');
    cache = {
      token,
      itens: new Map(itens.map((item) => [item.id, decifrarItemRecebido(item)])),
      cursor: cursorComMargem(servidorEm),
      carregadoEm: Date.now(),
    };
    return ordenados(cache.itens.values());
  }

  const atual = cache;
  const { itens, servidorEm } = await request<{ itens: (Item & { excluido?: boolean })[]; servidorEm: string }>(
    `/items?since=${encodeURIComponent(atual.cursor)}`,
  );
  if (cache !== atual) return ordenados((cache ?? atual).itens.values());
  for (const recebido of itens) {
    if (recebido.excluido) {
      atual.itens.delete(recebido.id);
    } else {
      atual.itens.set(recebido.id, decifrarItemRecebido(recebido));
    }
  }
  atual.cursor = cursorComMargem(servidorEm);
  return ordenados(atual.itens.values());
}

export async function criarItem(novoItem: NovoItem): Promise<Item> {
  const agora = new Date().toISOString();
  const item: Item = {
    ...novoItem,
    prioridade: novoItem.prioridade ?? false,
    origemRecorrenciaId: novoItem.origemRecorrenciaId ?? null,
    recorrenciaGeradaAte: null,
    notas: novoItem.notas ?? null,
    id: Crypto.randomUUID(),
    status: 'pendente',
    criadoEm: agora,
    concluidoEm: null,
    atualizadoEm: agora,
  };
  await request('/items', { method: 'POST', body: JSON.stringify(cifrarItemParaEnvio(item)) });
  guardarNoCache(item);
  return item;
}

export async function atualizarItem(item: Item): Promise<void> {
  const atualizado: Item = { ...item, atualizadoEm: new Date().toISOString() };
  await request(`/items/${item.id}`, { method: 'PUT', body: JSON.stringify(cifrarItemParaEnvio(atualizado)) });
  guardarNoCache(atualizado);
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
  guardarNoCache(decifrarItemRecebido(atualizado));
}

export async function marcarPrioridade(id: string, prioridade: boolean): Promise<void> {
  const atual = await request<Item>(`/items/${id}`);
  const atualizado: Item = { ...atual, prioridade, atualizadoEm: new Date().toISOString() };
  await request(`/items/${id}`, { method: 'PUT', body: JSON.stringify(atualizado) });
  guardarNoCache(decifrarItemRecebido(atualizado));
}

export async function marcarRecorrenciaGeradaAte(id: string, data: string): Promise<void> {
  const atual = await request<Item>(`/items/${id}`);
  if (atual.recorrenciaGeradaAte && atual.recorrenciaGeradaAte >= data) return;
  const atualizado: Item = { ...atual, recorrenciaGeradaAte: data, atualizadoEm: new Date().toISOString() };
  await request(`/items/${id}`, { method: 'PUT', body: JSON.stringify(atualizado) });
}

export async function excluirItem(id: string): Promise<void> {
  await request(`/items/${id}`, { method: 'DELETE' });
  if (cache && cache.token === obterTokenAtual()) cache.itens.delete(id);
}

// Build web: sem cache local pra "tocar" — a migração pós-configuração de
// criptografia usa o loop de atualizarItem() direto (ver ConfigurarCriptografiaScreen).
export async function tocarTodosItens(): Promise<void> {}

export async function upsertItemLocal(): Promise<void> {}
export async function removerItemLocal(): Promise<void> {}
export async function itensAlteradosDesde(): Promise<Item[]> {
  return [];
}
export async function listarExclusoesPendentes(): Promise<string[]> {
  return [];
}
export async function removerExclusaoPendente(): Promise<void> {}

// Diferente dos outros stubs acima: getMeta/setMeta usam localStorage de
// verdade (não são só cursor de sync incremental — servem também pra
// guardar preferências/estado simples, ex. status da última sincronização
// em SettingsScreen). Um valor real aqui não muda o comportamento do pull
// (o web sempre busca a lista inteira e decifra na hora, ver listarItens),
// só evita que esse dado se perca a cada recarregamento de página.
const PREFIXO_META = 'avia_meta_';

export async function getMeta(chave: string): Promise<string | null> {
  return localStorage.getItem(PREFIXO_META + chave);
}
export async function setMeta(chave: string, valor: string): Promise<void> {
  localStorage.setItem(PREFIXO_META + chave, valor);
}

// ---- Categorias (Fase 3) ----

export async function listarCategorias(): Promise<CategoriaItem[]> {
  const { categorias } = await request<{ categorias: CategoriaItem[]; servidorEm: string }>('/categorias');
  return categorias;
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
export async function limparTudoLocal(): Promise<void> {
  descartarCacheDeItens();
}

// Build web: não há arquivo SQLite por conta pra trocar/apagar — trocar de
// conta aqui é só trocar qual token está ativo (ver sessionToken.ts).
export function definirUsuarioAtivo(): void {}
export async function apagarBancoDaConta(): Promise<void> {}

// ---- Compartilhamento de itens (Fase 8) ----

interface CompartilhamentoApiResposta {
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
}

// Build web: sem cache local, então cada leitura busca fresco da API (mesmo
// padrão de listarItens/listarCategorias) — as ações (compartilhar,
// responder, concluir, remover) em CompartilhamentosContext chamam a API
// direto e recarregam essa lista depois.
export async function listarItensCompartilhados(): Promise<ItemCompartilhadoLocal[]> {
  const { enviados, recebidos } = await request<{
    enviados: CompartilhamentoApiResposta[];
    recebidos: CompartilhamentoApiResposta[];
    servidorEm: string;
  }>('/compartilhamentos');

  return [
    ...enviados.map((c): ItemCompartilhadoLocal => ({ ...c, papel: 'enviado' })),
    ...recebidos.map((c): ItemCompartilhadoLocal => ({ ...c, papel: 'recebido' })),
  ];
}

export async function upsertItemCompartilhadoLocal(): Promise<void> {}
export async function removerItemCompartilhadoLocal(): Promise<void> {}
