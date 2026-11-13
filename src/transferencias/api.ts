import { obterTokenAtual } from '../auth/sessionToken';
import { conferirRespostaDaSessao } from '../auth/sessaoExpirada';
import { API_URL } from '../sync/config';
import type { Item } from '../types/item';

// Chamadas às rotas /transferencias do Worker (ver worker/src/transferencias.ts).
// Diferente de items, transferência NUNCA entra na fila offline: sem internet,
// a ação simplesmente falha com uma mensagem clara.

export const MSG_SEM_CONEXAO = 'É preciso estar conectado para transferir.';

export interface TransferenciaRecebida {
  id: string;
  deNome: string;
  deEmail: string;
  criadoEm: string;
  expiraEm: string;
  itens: { id: string; titulo: string; data: string; horaCompromisso: string | null; tipoHorario: string }[];
}

export interface TransferenciaEnviada {
  id: string;
  status: 'pendente' | 'aceita' | 'recusada' | 'cancelada' | 'expirada';
  paraNome: string;
  paraEmail: string;
  criadoEm: string;
  respondidoEm: string | null;
  expiraEm: string;
  itemIds: string[];
  quantidadeMovida: number;
}

/** Erro com o código que o servidor mandou (ex.: 'cifradas'), pra quem chamou decidir o que fazer. */
export class ErroTransferencia extends Error {
  constructor(
    mensagem: string,
    public status: number,
    public codigo?: string,
    public itemIds?: string[],
  ) {
    super(mensagem);
  }
}

async function chamar<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}${caminho}`, {
      ...opcoes,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${obterTokenAtual()}`,
        ...opcoes.headers,
      },
    });
  } catch {
    throw new ErroTransferencia(MSG_SEM_CONEXAO, 0);
  }
  conferirRespostaDaSessao(resposta);
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new ErroTransferencia(
      dados?.erro ?? 'Não foi possível completar a operação.',
      resposta.status,
      dados?.codigo,
      dados?.itemIds,
    );
  }
  return dados as T;
}

export function listarRecebidas(): Promise<{ recebidas: TransferenciaRecebida[] }> {
  return chamar('/transferencias/recebidas');
}

export function listarEnviadas(): Promise<{ enviadas: TransferenciaEnviada[] }> {
  return chamar('/transferencias/enviadas');
}

export function criarTransferencia(
  emailDestino: string,
  itemIds: string[],
): Promise<{ id: string; quantidade: number; para: { nome: string; email: string } }> {
  return chamar('/transferencias', { method: 'POST', body: JSON.stringify({ emailDestino, itemIds }) });
}

export function responderTransferencia(
  id: string,
  acao: 'aceitar' | 'recusar' | 'cancelar',
): Promise<{ ok: boolean; movidas?: number }> {
  return chamar(`/transferencias/${encodeURIComponent(id)}/${acao}`, { method: 'POST' });
}

/**
 * Manda a versão ABERTA (sem cifra) da tarefa pro servidor — só usado antes
 * de transferir uma tarefa de conta com criptografia, depois do aviso ao
 * usuário: o destino tem outra chave e não conseguiria ler o texto cifrado.
 * Vai direto (sem passar por cifrarItemParaEnvio) e com atualizadoEm novo,
 * pra valer sobre a versão cifrada que está no servidor.
 */
export async function enviarVersaoAberta(item: Item): Promise<void> {
  const { somenteLeitura, compartilhamentoId, compartilhadoPorNome, ...limpo } = item;
  void somenteLeitura;
  void compartilhamentoId;
  void compartilhadoPorNome;
  await chamar('/items', {
    method: 'POST',
    body: JSON.stringify({ ...limpo, atualizadoEm: new Date().toISOString() }),
  });
}
