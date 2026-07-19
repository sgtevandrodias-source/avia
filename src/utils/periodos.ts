import { addDays, addMonths, endOfDay, format, isWithinInterval, parseISO, set, startOfDay } from 'date-fns';
import type { Item } from '../types/item';
import type { PeriodoKey } from '../theme/colors';

export function hojeISO(): string {
  return format(startOfDay(new Date()), 'yyyy-MM-dd');
}

function intervaloDoPeriodo(periodo: PeriodoKey): { inicio: Date; fim: Date } {
  const hoje = startOfDay(new Date());
  switch (periodo) {
    case 'hoje':
      return { inicio: hoje, fim: hoje };
    case 'amanha': {
      const amanha = addDays(hoje, 1);
      return { inicio: amanha, fim: amanha };
    }
    case 'quinzena':
      return { inicio: hoje, fim: addDays(hoje, 15) };
    case 'mes':
      return { inicio: hoje, fim: addMonths(hoje, 1) };
  }
}

export function itensDoPeriodo(itens: Item[], periodo: PeriodoKey): Item[] {
  const { inicio, fim } = intervaloDoPeriodo(periodo);
  return itens.filter((item) => {
    if (item.status === 'feito') return false;
    const data = startOfDay(parseISO(item.data));
    return isWithinInterval(data, { start: inicio, end: fim });
  });
}

export function itensFeitosHoje(itens: Item[]): Item[] {
  const hoje = hojeISO();
  return itens.filter((item) => item.status === 'feito' && item.concluidoEm?.startsWith(hoje));
}

export function itensPendentesHoje(itens: Item[]): Item[] {
  return itensDoPeriodo(itens, 'hoje');
}

export function itensConcluidosOrdenados(itens: Item[]): Item[] {
  return itens
    .filter((item) => item.status === 'feito' && item.concluidoEm)
    .sort((a, b) => (b.concluidoEm as string).localeCompare(a.concluidoEm as string));
}

/**
 * Instante que define o "prazo" do item: hora do compromisso/prazo quando
 * há horário específico; senão, fim do dia (23:59:59) — um item sem hora só
 * fica atrasado depois que o dia inteiro dele já passou, não durante ele.
 */
export function dataHoraLimiteDoItem(item: Item): Date {
  const dataBase = parseISO(item.data);
  if (item.tipoHorario === 'compromisso' && item.horaCompromisso) {
    const [horas, minutos] = item.horaCompromisso.split(':').map(Number);
    return set(dataBase, { hours: horas, minutes: minutos, seconds: 0, milliseconds: 0 });
  }
  if (item.tipoHorario === 'prazo' && item.horaLimite) {
    const [horas, minutos] = item.horaLimite.split(':').map(Number);
    return set(dataBase, { hours: horas, minutes: minutos, seconds: 0, milliseconds: 0 });
  }
  return endOfDay(dataBase);
}

/** Pendentes cujo prazo já passou, do mais atrasado (mais antigo) pro mais recente. */
export function itensAtrasados(itens: Item[]): Item[] {
  const agora = new Date();
  return itens
    .filter((item) => item.status === 'pendente' && dataHoraLimiteDoItem(item) < agora)
    .sort((a, b) => dataHoraLimiteDoItem(a).getTime() - dataHoraLimiteDoItem(b).getTime());
}

export function agruparPorCategoria(itens: Item[]): Map<Item['categoria'], Item[]> {
  const grupos = new Map<Item['categoria'], Item[]>();
  for (const item of itens) {
    const lista = grupos.get(item.categoria) ?? [];
    lista.push(item);
    grupos.set(item.categoria, lista);
  }
  return grupos;
}
