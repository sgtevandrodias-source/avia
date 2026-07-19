import { addDays, addMonths, format, isWithinInterval, parseISO, startOfDay } from 'date-fns';
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

export function agruparPorCategoria(itens: Item[]): Map<Item['categoria'], Item[]> {
  const grupos = new Map<Item['categoria'], Item[]>();
  for (const item of itens) {
    const lista = grupos.get(item.categoria) ?? [];
    lista.push(item);
    grupos.set(item.categoria, lista);
  }
  return grupos;
}
