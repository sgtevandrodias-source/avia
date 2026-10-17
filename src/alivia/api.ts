import { obterTokenAtual } from '../auth/sessionToken';
import { obterChaveAtual } from '../crypto/chaveAtual';
import { cifrarTexto, decifrarTexto, estaCifrado } from '../crypto/wireFormat';
import { API_URL } from '../sync/config';
import type { Pensamento, PensamentoEnviado, PensamentoRecebido } from './tipos';

const TIMEOUT_MS = 8000;

/** Formato trocado com o Worker (POST/GET /pensamentos). */
export interface PensamentoRemoto {
  id: string;
  texto: string;
  registradoEm: string;
  atualizadoEm: string;
  excluido?: boolean;
}

export class ErroApiAlivia extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
  }
}

export async function chamarApiAlivia<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(`${API_URL}${caminho}`, {
      ...opcoes,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${obterTokenAtual()}`,
        ...opcoes.headers,
      },
      signal: controller.signal,
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      throw new ErroApiAlivia(dados?.erro ?? 'Não foi possível completar a operação.', resposta.status);
    }
    return dados as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ---- Criptografia ponta a ponta (mesmo formato/chave dos itens) ----

/** Cifra antes de mandar pro servidor, se este aparelho tiver a chave. Não cifra de novo o que já é cifrado. */
export function cifrarParaEnvio(texto: string): string {
  const chave = obterChaveAtual();
  if (!chave || estaCifrado(texto)) return texto;
  return cifrarTexto(texto, chave);
}

/** Decifra o que veio do servidor; sem chave (ou se falhar), devolve como veio e marca `bloqueado`. */
export function decifrarRecebido(texto: string): { texto: string; bloqueado: boolean } {
  if (!estaCifrado(texto)) return { texto, bloqueado: false };
  const chave = obterChaveAtual();
  if (!chave) return { texto, bloqueado: true };
  try {
    return { texto: decifrarTexto(texto, chave), bloqueado: false };
  } catch {
    return { texto, bloqueado: true };
  }
}

export function paraPensamento(remoto: PensamentoRemoto): Pensamento {
  const { texto, bloqueado } = decifrarRecebido(remoto.texto);
  return { id: remoto.id, texto, registradoEm: remoto.registradoEm, atualizadoEm: remoto.atualizadoEm, bloqueado };
}

export async function enviarPensamento(p: PensamentoRemoto): Promise<'ok' | 'conflito'> {
  try {
    await chamarApiAlivia('/pensamentos', {
      method: 'POST',
      body: JSON.stringify({ ...p, texto: cifrarParaEnvio(p.texto) }),
    });
    return 'ok';
  } catch (erro) {
    // 409 = o servidor já tem uma versão mais nova (editada em outro
    // aparelho) — não é falha, a próxima leitura traz a versão vencedora.
    if (erro instanceof ErroApiAlivia && erro.status === 409) return 'conflito';
    throw erro;
  }
}

// ---- Compartilhamento (igual no nativo e no web: sempre direto na API) ----

export async function listarCompartilhamentosPensamentos(): Promise<{
  enviados: PensamentoEnviado[];
  recebidos: PensamentoRecebido[];
}> {
  return chamarApiAlivia('/pensamentos-compartilhados');
}

export async function compartilharPensamentos(emailDestinatario: string, pensamentos: Pensamento[]): Promise<void> {
  await chamarApiAlivia('/pensamentos-compartilhados', {
    method: 'POST',
    body: JSON.stringify({
      emailDestinatario,
      // Snapshot em texto puro: quem recebe tem outra chave e não
      // conseguiria ler a versão cifrada (mesmo modelo dos compromissos).
      registros: pensamentos.map((p) => ({ pensamentoId: p.id, texto: p.texto, registradoEm: p.registradoEm })),
    }),
  });
}

export async function responderCompartilhamentoPensamento(id: string, aceitar: boolean): Promise<void> {
  await chamarApiAlivia(`/pensamentos-compartilhados/${id}/responder`, {
    method: 'POST',
    body: JSON.stringify({ aceitar }),
  });
}

export async function removerCompartilhamentoPensamento(id: string): Promise<void> {
  await chamarApiAlivia(`/pensamentos-compartilhados/${id}`, { method: 'DELETE' });
}
