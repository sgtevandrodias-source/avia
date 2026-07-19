import { addDays, addMonths, addYears, format, parseISO } from 'date-fns';
import type { Item, NovoItem } from '../types/item';

/** Data (yyyy-MM-dd) da próxima ocorrência a partir da data do item concluído, ou null se não repete. */
export function proximaDataRecorrencia(dataAtual: string, recorrencia: Item['recorrencia']): string | null {
  const data = parseISO(dataAtual);
  switch (recorrencia) {
    case 'diaria':
      return format(addDays(data, 1), 'yyyy-MM-dd');
    case 'semanal':
      return format(addDays(data, 7), 'yyyy-MM-dd');
    case 'mensal':
      return format(addMonths(data, 1), 'yyyy-MM-dd');
    case 'anual':
      return format(addYears(data, 1), 'yyyy-MM-dd');
    default:
      return null;
  }
}

/** Monta os dados da próxima ocorrência de um item recorrente (mesmo título/categoria/horário, nova data). */
export function proximaOcorrencia(item: Item, novaData: string): NovoItem {
  return {
    textoOriginal: item.textoOriginal,
    titulo: item.titulo,
    data: novaData,
    horaCompromisso: item.horaCompromisso,
    horaLimite: item.horaLimite,
    tipoHorario: item.tipoHorario,
    categoria: item.categoria,
    recorrencia: item.recorrencia,
    lembreteOffsetMinutos: item.lembreteOffsetMinutos,
  };
}
