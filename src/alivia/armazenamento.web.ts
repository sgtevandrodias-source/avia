import * as Crypto from 'expo-crypto';
import { obterChaveAtual } from '../crypto/chaveAtual';
import { estaCifrado } from '../crypto/wireFormat';
import { chamarApiAlivia, enviarPensamento, paraPensamento, type PensamentoRemoto } from './api';
import type { Pensamento } from './tipos';

// Build web: sem SQLite (mesmo modelo de src/db/database.web.ts) — cada
// operação fala direto com o Worker. Precisa espelhar a MESMA superfície
// exportada por armazenamento.ts.

let ultimaLista: Pensamento[] = [];

export async function listarPensamentos(): Promise<Pensamento[]> {
  const { pensamentos } = await chamarApiAlivia<{ pensamentos: PensamentoRemoto[]; servidorEm: string }>('/pensamentos');
  // Registro antigo ainda em texto puro e a criptografia já está ativa
  // neste navegador: regrava cifrado (mesmo atualizadoEm, ver pensamentos.ts).
  if (obterChaveAtual()) {
    for (const remoto of pensamentos) {
      if (!estaCifrado(remoto.texto)) enviarPensamento(remoto).catch(() => {});
    }
  }
  ultimaLista = pensamentos.map(paraPensamento).sort((a, b) => b.registradoEm.localeCompare(a.registradoEm));
  return ultimaLista;
}

export async function criarPensamento(texto: string): Promise<Pensamento> {
  const agora = new Date().toISOString();
  const pensamento: Pensamento = { id: Crypto.randomUUID(), texto, registradoEm: agora, atualizadoEm: agora };
  await enviarPensamento(pensamento);
  ultimaLista = [pensamento, ...ultimaLista];
  return pensamento;
}

export async function editarPensamento(id: string, texto: string): Promise<void> {
  const atual = ultimaLista.find((p) => p.id === id);
  if (!atual) throw new Error('Registro não encontrado.');
  const atualizado = { ...atual, texto, atualizadoEm: new Date().toISOString() };
  await enviarPensamento(atualizado);
  ultimaLista = ultimaLista.map((p) => (p.id === id ? atualizado : p));
}

export async function apagarPensamento(id: string): Promise<void> {
  const atual = ultimaLista.find((p) => p.id === id);
  if (!atual) return;
  await enviarPensamento({ ...atual, excluido: true, atualizadoEm: new Date().toISOString() });
  ultimaLista = ultimaLista.filter((p) => p.id !== id);
}

// Sem cache local: cada leitura já vem fresca do servidor.
export async function sincronizarPensamentos(_opcoes: { podeEnviar: boolean }): Promise<boolean> {
  return true;
}
