import { addDays, addMonths, endOfDay, format, isWithinInterval, parseISO, set, startOfDay } from 'date-fns';
import type { Item } from '../types/item';
import type { PeriodoKey } from '../theme/colors';

export function hojeISO(): string {
  return format(startOfDay(new Date()), 'yyyy-MM-dd');
}

// Períodos não se sobrepõem: cada item aparece em uma única aba. "15 dias"
// cobre do depois-de-amanhã até o dia 15 (hoje/amanhã já têm aba própria);
// "Mês" cobre do dia 16 até completar o mês (o que "15 dias" já não cobre).
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
      return { inicio: addDays(hoje, 2), fim: addDays(hoje, 15) };
    case 'mes':
      return { inicio: addDays(hoje, 16), fim: addMonths(hoje, 1) };
  }
}

/**
 * "Hoje" traz todo pendente com data de hoje OU ANTERIOR (rollover) — um
 * item atrasado (ex.: recorrente não concluído no dia certo) continua
 * aparecendo aqui, dia após dia, até ser concluído, sem que a `data`
 * guardada no item seja alterada (isso é só regra de exibição — ver Fase 1
 * do prompt, que depende de `item.data` nunca mudar pra calcular a próxima
 * ocorrência corretamente). Os demais períodos continuam com intervalo
 * exato, sem rollover (não se sobrepõem entre si nem com Hoje).
 */
export function itensDoPeriodo(itens: Item[], periodo: PeriodoKey): Item[] {
  if (periodo === 'hoje') {
    const hoje = startOfDay(new Date());
    return itens.filter((item) => item.status === 'pendente' && startOfDay(parseISO(item.data)) <= hoje);
  }
  const { inicio, fim } = intervaloDoPeriodo(periodo);
  return itens.filter((item) => {
    if (item.status === 'feito') return false;
    const data = startOfDay(parseISO(item.data));
    return isWithinInterval(data, { start: inicio, end: fim });
  });
}

export function itensFeitosHoje(itens: Item[]): Item[] {
  const hoje = hojeISO();
  // `concluidoEm` é gravado em UTC (toISOString); comparar o prefixo da
  // string com a data local (hojeISO) dá falso negativo perto da virada do
  // dia em UTC pra quem está em fuso atrás — por isso converte pra data
  // local antes de comparar, em vez de comparar a string bruta.
  return itens.filter(
    (item) => item.status === 'feito' && item.concluidoEm && format(parseISO(item.concluidoEm), 'yyyy-MM-dd') === hoje,
  );
}

/**
 * Itens concluídos "daquele período": pra Hoje, quem foi concluído hoje
 * (`itensFeitosHoje` — importa a data de conclusão, não a data original,
 * senão um item atrasado concluído hoje desapareceria da lista em vez de
 * aparecer riscado); pros demais períodos, quem tem a data original dentro
 * do intervalo do período e já está concluído.
 */
export function itensConcluidosDoPeriodo(itens: Item[], periodo: PeriodoKey): Item[] {
  if (periodo === 'hoje') return itensFeitosHoje(itens);
  const { inicio, fim } = intervaloDoPeriodo(periodo);
  return itens.filter((item) => {
    if (item.status !== 'feito') return false;
    const data = startOfDay(parseISO(item.data));
    return isWithinInterval(data, { start: inicio, end: fim });
  });
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

/**
 * Ordena por prioridade primeiro (prioritários todos antes dos demais) e,
 * dentro de cada grupo, por urgência: quem tem horário mais próximo (ou mais
 * atrasado) vem primeiro; itens sem horário específico resolvem pro fim do
 * dia (ver `dataHoraLimiteDoItem`), então naturalmente ficam depois dos itens
 * com horário do mesmo dia. Não precisa de timer pra "recalcular com o
 * tempo" — a ordem relativa entre dois itens é fixa (vem da prioridade e da
 * data/hora agendada de cada um), então qualquer re-render (item novo,
 * editado, ou só o relógio virando pro próximo dia) já reflete a ordem certa.
 */
export function ordenarPorUrgencia(itens: Item[]): Item[] {
  return [...itens].sort((a, b) => {
    if (a.prioridade !== b.prioridade) return a.prioridade ? -1 : 1;
    return dataHoraLimiteDoItem(a).getTime() - dataHoraLimiteDoItem(b).getTime();
  });
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
