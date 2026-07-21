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

export interface ResultadoSerieRecorrente {
  novasOcorrencias: NovoItem[];
  // ids dos itens que JÁ EXISTIAM nessa série antes desta chamada — também
  // precisam receber o bookmark abaixo (não só os recém-criados).
  idsExistentesParaAtualizar: string[];
  // Até que data a série foi gerada nesta passada. Precisa ser gravado em
  // TODO item da série (os existentes acima E os recém-criados, depois que o
  // chamador tiver os ids reais deles) — não só na raiz. Sem isso, apagar a
  // ocorrência mais recente (ou a própria raiz) expõe uma data mais antiga
  // como a mais recente sobrevivente, que já passou, fazendo o gerador
  // recriar a ocorrência que foi apagada.
  recorrenciaGeradaAte: string;
}

export interface ResultadoGeracaoRecorrencia {
  series: ResultadoSerieRecorrente[];
}

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
 *
 * O ponto de partida de cada série é o MAIOR entre (a) o bookmark
 * `recorrenciaGeradaAte` de qualquer item sobrevivente da série e (b) a
 * maior data entre as ocorrências sobreviventes — nunca só a segunda opção,
 * senão apagar a ocorrência mais recente de uma série (ou a própria raiz) a
 * faz ser gerada de novo no próximo carregamento. Não grava o bookmark
 * diretamente (é só uma função pura) — devolve o que precisa ser gravado
 * pro chamador (ItemsContext.tsx) fazer isso depois de criar as novas
 * ocorrências, já que só ele sabe os ids reais delas.
 */
export function gerarOcorrenciasPendentes(itens: Item[]): ResultadoGeracaoRecorrencia {
  const agora = new Date();
  const series: ResultadoSerieRecorrente[] = [];

  const seriePorRaiz = new Map<string, Item[]>();
  for (const item of itens) {
    if (item.recorrencia === 'nenhuma') continue;
    const raizId = raizDaSerie(item);
    const lista = seriePorRaiz.get(raizId) ?? [];
    lista.push(item);
    seriePorRaiz.set(raizId, lista);
  }

  for (const serie of seriePorRaiz.values()) {
    const modelo = serie.reduce((maisRecente, atual) => (atual.data > maisRecente.data ? atual : maisRecente));
    const maiorDataSobrevivente = modelo.data;
    const maiorBookmarkSobrevivente = serie.reduce<string | null>((maior, item) => {
      if (!item.recorrenciaGeradaAte) return maior;
      return !maior || item.recorrenciaGeradaAte > maior ? item.recorrenciaGeradaAte : maior;
    }, null);
    let dataAtual =
      maiorBookmarkSobrevivente && maiorBookmarkSobrevivente > maiorDataSobrevivente
        ? maiorBookmarkSobrevivente
        : maiorDataSobrevivente;

    const datasExistentes = new Set(serie.map((i) => i.data));
    const novasOcorrencias: NovoItem[] = [];
    let geracoes = 0;
    let bookmarkAvancou = false;
    while (geracoes < MAX_GERACOES_POR_SERIE) {
      const limiteDaDataAtual = dataHoraLimiteDoItem({ ...modelo, data: dataAtual });
      if (limiteDaDataAtual >= agora) break;

      const proximaData = proximaDataRecorrencia(dataAtual, modelo.recorrencia);
      if (!proximaData) break;

      if (!datasExistentes.has(proximaData)) {
        novasOcorrencias.push(proximaOcorrencia(modelo, proximaData));
        datasExistentes.add(proximaData);
      }
      dataAtual = proximaData;
      bookmarkAvancou = true;
      geracoes += 1;
    }

    if (bookmarkAvancou) {
      series.push({
        novasOcorrencias,
        idsExistentesParaAtualizar: serie.map((i) => i.id),
        recorrenciaGeradaAte: dataAtual,
      });
    }
  }

  return { series };
}
