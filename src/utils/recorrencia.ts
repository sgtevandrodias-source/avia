import { addDays, addMonths, addYears, format, parseISO } from 'date-fns';
import type { Item, NovoItem } from '../types/item';
import { dataHoraLimiteDoItem } from './periodos';

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

/** Id do item raiz da série (o primeiro, criado manualmente) — este item, se ele mesmo já for a raiz. */
export function raizDaSerie(item: Item): string {
  return item.origemRecorrenciaId ?? item.id;
}

/** Já existe, entre os itens dados, uma ocorrência da mesma série pra essa data? */
export function existeOcorrenciaNaSerie(itens: Item[], raizId: string, data: string): boolean {
  return itens.some((i) => raizDaSerie(i) === raizId && i.data === data);
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
    origemRecorrenciaId: raizDaSerie(item),
  };
}

const MAX_GERACOES_POR_SERIE = 60;

/**
 * Gera, pra cada série recorrente, todas as ocorrências que faltam desde a
 * última existente até hoje — sem depender do usuário ter concluído nenhuma
 * delas (esse é o gatilho por tempo; o gatilho por conclusão em
 * ItemsContext.tsx continua existindo, os dois convivem). Isso corrige o bug
 * de a série "travar" pra sempre quando um ciclo não é marcado como feito:
 * mesmo que "parabenizar João" (anual) fique pendente/atrasado por dias, a
 * ocorrência do ano seguinte é gerada assim que a data original passar por
 * completo — sem nunca alterar a `data` das ocorrências já existentes.
 *
 * Idempotente: nunca gera uma ocorrência pra uma data que a série já tem
 * (comparando pelo id raiz da série, não por título/categoria — assim
 * continua correto mesmo se o usuário editar o título de uma ocorrência).
 */
export function gerarOcorrenciasPendentes(itens: Item[]): NovoItem[] {
  const agora = new Date();
  const geradas: NovoItem[] = [];

  const seriePorRaiz = new Map<string, Item[]>();
  for (const item of itens) {
    if (item.recorrencia === 'nenhuma') continue;
    const raizId = raizDaSerie(item);
    const lista = seriePorRaiz.get(raizId) ?? [];
    lista.push(item);
    seriePorRaiz.set(raizId, lista);
  }

  for (const [raizId, serie] of seriePorRaiz) {
    const tip = serie.reduce((maisRecente, atual) => (atual.data > maisRecente.data ? atual : maisRecente));
    const datasExistentes = new Set(serie.map((i) => i.data));

    let dataAtual = tip.data;
    let geracoes = 0;
    while (geracoes < MAX_GERACOES_POR_SERIE) {
      const limiteDaDataAtual = dataHoraLimiteDoItem({ ...tip, data: dataAtual });
      if (limiteDaDataAtual >= agora) break;

      const proximaData = proximaDataRecorrencia(dataAtual, tip.recorrencia);
      if (!proximaData) break;

      if (!datasExistentes.has(proximaData)) {
        geradas.push(proximaOcorrencia(tip, proximaData));
        datasExistentes.add(proximaData);
      }
      dataAtual = proximaData;
      geracoes += 1;
    }
  }

  return geradas;
}
