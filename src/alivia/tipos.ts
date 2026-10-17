// "Avia que alivia!" — registro de pensamentos, separado das tarefas.
// Nada daqui é misturado com Item/ItemsContext: tabelas, rotas e estado
// próprios (ver worker/src/pensamentos.ts e worker/migrations/0018).

export const LIMITE_CARACTERES_PENSAMENTO = 500;

export interface Pensamento {
  id: string;
  texto: string;
  registradoEm: string; // ISO — data/hora automática do registro
  atualizadoEm: string; // ISO — last write wins na sincronização
  // true quando o texto está cifrado e este aparelho ainda não tem a chave
  // (criptografia configurada, mas não desbloqueada aqui).
  bloqueado?: boolean;
}

export type StatusCompartilhamentoPensamento = 'pendente' | 'aceito' | 'recusado';

/** Um registro MEU compartilhado com alguém (quem compartilhou pode desfazer). */
export interface PensamentoEnviado {
  id: string;
  pensamentoId: string;
  destinatarioNome: string;
  destinatarioEmail: string;
  status: StatusCompartilhamentoPensamento;
  registradoEm: string;
}

/** Um registro que OUTRA pessoa compartilhou comigo (só leitura). */
export interface PensamentoRecebido {
  id: string;
  criadorNome: string;
  status: StatusCompartilhamentoPensamento;
  texto: string | null; // null enquanto o convite não foi aceito
  registradoEm: string;
}
