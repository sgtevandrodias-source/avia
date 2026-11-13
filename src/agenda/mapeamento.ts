import type { Item } from '../types/item';

// Regras puras de "como uma tarefa vira um evento", sem nenhuma dependência
// nativa. Não usa regra de repetição de propósito: o Worker já cria uma tarefa
// separada pra cada ocorrência (worker/src/recorrencia.ts), então um evento
// repetido em cada uma delas multiplicaria os eventos na agenda.

const DURACAO_COMPROMISSO_MS = 60 * 60 * 1000;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

export const PREFIXO_CONCLUIDO = '✅ ';
const RODAPE_NOTAS = 'Criado pelo Avia';

export interface DadosEvento {
  titulo: string;
  notas: string;
  inicio: Date;
  fim: Date;
  diaInteiro: boolean;
}

type ItemParaEvento = Pick<Item, 'titulo' | 'notas' | 'data' | 'tipoHorario' | 'horaCompromisso' | 'horaLimite' | 'status'>;

function lerData(data: string): [number, number, number] | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  return partes ? [Number(partes[1]), Number(partes[2]), Number(partes[3])] : null;
}

function lerHora(hora: string | null): [number, number] | null {
  const partes = hora ? /^(\d{1,2}):(\d{2})$/.exec(hora) : null;
  return partes ? [Number(partes[1]), Number(partes[2])] : null;
}

/** Monta o evento de uma tarefa, ou `null` se a data salva for inválida. */
export function eventoDoItem(item: ItemParaEvento): DadosEvento | null {
  const data = lerData(item.data);
  if (!data) return null;
  const [ano, mes, dia] = data;

  const titulo = item.status === 'feito' ? `${PREFIXO_CONCLUIDO}${item.titulo}` : item.titulo;
  const linhasNotas: string[] = [];
  if (item.tipoHorario === 'prazo' && item.horaLimite) linhasNotas.push(`Prazo até ${item.horaLimite}`);
  if (item.notas) linhasNotas.push(item.notas);
  linhasNotas.push(RODAPE_NOTAS);
  const notas = linhasNotas.join('\n\n');

  const hora = item.tipoHorario === 'compromisso' ? lerHora(item.horaCompromisso) : null;
  if (hora) {
    const inicio = new Date(ano, mes - 1, dia, hora[0], hora[1]);
    return { titulo, notas, inicio, fim: new Date(inicio.getTime() + DURACAO_COMPROMISSO_MS), diaInteiro: false };
  }

  // O Android exige evento de dia inteiro à meia-noite UTC, com fuso UTC (ver
  // agenda.ts) — à meia-noite local, ele apareceria um dia antes no Brasil.
  const inicio = new Date(Date.UTC(ano, mes - 1, dia));
  return { titulo, notas, inicio, fim: new Date(inicio.getTime() + UM_DIA_MS), diaInteiro: true };
}

/** Texto que muda sempre que o evento precisa ser atualizado na agenda. */
export function assinaturaDoEvento(evento: DadosEvento): string {
  return JSON.stringify([
    evento.titulo,
    evento.notas,
    evento.inicio.toISOString(),
    evento.fim.toISOString(),
    evento.diaInteiro,
  ]);
}

export function diaInteiroDaAssinatura(assinatura: string): boolean | null {
  try {
    const valor = (JSON.parse(assinatura) as unknown[])[4];
    return typeof valor === 'boolean' ? valor : null;
  } catch {
    return null;
  }
}

/** Tarefas concluídas de dias passados não valem um evento novo: seria só histórico enchendo a agenda. */
export function elegivelParaEvento(item: Pick<Item, 'status' | 'data'>, hoje: string): boolean {
  return item.status === 'pendente' || item.data >= hoje;
}
