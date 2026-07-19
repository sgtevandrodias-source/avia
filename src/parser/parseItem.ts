import { addDays, addMonths, format, setDate } from 'date-fns';
import type { Categoria, NovoItem, Recorrencia, TipoHorario } from '../types/item';

export interface ResultadoParse {
  item: NovoItem;
  trechosReconhecidos: string[]; // trechos de texto que foram interpretados (para preview)
}

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0,
  'segunda-feira': 1,
  segunda: 1,
  'terça-feira': 2,
  terca: 2,
  terça: 2,
  'quarta-feira': 3,
  quarta: 3,
  'quinta-feira': 4,
  quinta: 4,
  'sexta-feira': 5,
  sexta: 5,
  sábado: 6,
  sabado: 6,
};

const NUMEROS_EXTENSO: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  três: 3,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
};

function normalizar(texto: string): string {
  return texto.toLowerCase().trim();
}

function removerAcentosLeve(texto: string): string {
  // Normaliza pra NFC primeiro: acentos digitados/gerados em NFD (ex.: "a" + combining tilde)
  // têm o mesmo visual mas comprimento e bytes diferentes, o que quebraria as comparações abaixo.
  return texto
    .normalize('NFC')
    .replace(/[áàãâ]/g, 'a')
    .replace(/[éê]/g, 'e')
    .replace(/[í]/g, 'i')
    .replace(/[óõô]/g, 'o')
    .replace(/[ú]/g, 'u')
    .replace(/[ç]/g, 'c');
}

interface DeteccaoData {
  data: Date;
  recorrenciaSugerida?: Recorrencia;
  trecho: string;
}

function detectarData(textoOriginal: string, agora: Date): DeteccaoData | null {
  const texto = normalizar(textoOriginal);
  const textoSemAcento = removerAcentosLeve(texto);

  // "dia 25/12/2026", "dia 25/12", "25/12"
  const matchDataCompleta = texto.match(/\b(?:dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (matchDataCompleta) {
    const dia = parseInt(matchDataCompleta[1], 10);
    const mes = parseInt(matchDataCompleta[2], 10) - 1;
    let ano = matchDataCompleta[3] ? parseInt(matchDataCompleta[3], 10) : agora.getFullYear();
    if (ano < 100) ano += 2000;
    const data = new Date(ano, mes, dia);
    return { data, trecho: matchDataCompleta[0] };
  }

  // "daqui a 15 dias" / "daqui a uma semana" / "daqui a 2 semanas"
  const matchDaquiADias = textoSemAcento.match(/daqui\s+a\s+(\d+|[a-z]+)\s+dias?/);
  if (matchDaquiADias) {
    const qtd = /^\d+$/.test(matchDaquiADias[1])
      ? parseInt(matchDaquiADias[1], 10)
      : NUMEROS_EXTENSO[matchDaquiADias[1]] ?? 1;
    return { data: addDays(agora, qtd), trecho: matchDaquiADias[0] };
  }
  const matchDaquiASemanas = textoSemAcento.match(/daqui\s+a\s+(\d+|[a-z]+)\s+semanas?/);
  if (matchDaquiASemanas) {
    const qtd = /^\d+$/.test(matchDaquiASemanas[1])
      ? parseInt(matchDaquiASemanas[1], 10)
      : NUMEROS_EXTENSO[matchDaquiASemanas[1]] ?? 1;
    return { data: addDays(agora, qtd * 7), trecho: matchDaquiASemanas[0] };
  }

  // "mês que vem" / "mes que vem"
  const matchMesQueVem = textoSemAcento.match(/m[eê]s\s+que\s+vem/);
  if (matchMesQueVem) {
    return { data: addMonths(agora, 1), trecho: matchMesQueVem[0] };
  }

  // "dia 25" (dia do mês atual, rolando pro mês seguinte se já passou)
  const matchDiaDoMes = texto.match(/\bdia\s+(\d{1,2})\b/);
  if (matchDiaDoMes) {
    const dia = parseInt(matchDiaDoMes[1], 10);
    let data = setDate(agora, dia);
    if (data < agora && data.toDateString() !== agora.toDateString()) {
      data = setDate(addMonths(agora, 1), dia);
    }
    return { data, trecho: matchDiaDoMes[0] };
  }

  // "depois de amanhã"
  if (/depois\s+de\s+amanh/.test(textoSemAcento)) {
    return { data: addDays(agora, 2), trecho: 'depois de amanhã' };
  }

  // "amanhã" — testado sem acento porque \b do JS não trata "ã" como caractere
  // de palavra, o que quebraria a fronteira \b logo após ele.
  if (/\bamanha\b/.test(textoSemAcento)) {
    return { data: addDays(agora, 1), trecho: 'amanhã' };
  }

  // "hoje"
  if (/\bhoje\b/.test(texto)) {
    return { data: agora, trecho: 'hoje' };
  }

  // dias da semana
  for (const [nomeDia, indiceDia] of Object.entries(DIAS_SEMANA)) {
    const nomeDiaSemAcento = removerAcentosLeve(nomeDia);
    const regex = new RegExp(`\\b${nomeDiaSemAcento}\\b`);
    if (regex.test(textoSemAcento)) {
      const diaAtual = agora.getDay();
      let diff = indiceDia - diaAtual;
      if (diff < 0) diff += 7;
      return { data: addDays(agora, diff), trecho: nomeDia };
    }
  }

  // aniversário sem data explícita não deveria cair aqui pois precisa de data;
  // se disser só "aniversário" sem dia, não conseguimos inferir — cai no fallback "hoje".

  return null;
}

interface DeteccaoHorario {
  tipoHorario: TipoHorario;
  hora: string; // HH:mm — vazio quando tipoHorario === 'dia_todo' (não se aplica)
  trecho: string;
}

function parseHora(horaStr: string, minutoStr: string | undefined, periodo: string | undefined): string {
  let hora = parseInt(horaStr, 10);
  const minuto = minutoStr ? parseInt(minutoStr, 10) : 0;
  if (periodo && /tarde|noite/.test(periodo) && hora < 12) {
    hora += 12;
  }
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

function detectarHorario(textoOriginal: string): DeteccaoHorario | null {
  const texto = normalizar(textoOriginal);
  const textoSemAcento = removerAcentosLeve(texto);

  // "dia todo", "o dia todo", "dia inteiro", "o dia inteiro"
  const matchDiaTodo = textoSemAcento.match(/\bo\s+dia\s+(?:todo|inteiro)\b|\bdia\s+(?:todo|inteiro)\b/);
  if (matchDiaTodo) {
    return { tipoHorario: 'dia_todo', hora: '', trecho: matchDiaTodo[0] };
  }

  // "até as 18h", "até às 18:30", "até 18h", "até 18"
  const matchPrazo = textoSemAcento.match(
    /\bate\s+(?:as\s+|a\s+)?(\d{1,2})(?:[:h](\d{2}))?h?\s*(da\s+manh[aã]|da\s+tarde|da\s+noite)?/,
  );
  if (matchPrazo) {
    return {
      tipoHorario: 'prazo',
      hora: parseHora(matchPrazo[1], matchPrazo[2], matchPrazo[3]),
      trecho: matchPrazo[0],
    };
  }

  // "as 15h", "às 15:30", "as 15"
  const matchCompromisso = textoSemAcento.match(
    /\b[aà]s\s+(\d{1,2})(?:[:h](\d{2}))?h?\s*(da\s+manh[aã]|da\s+tarde|da\s+noite)?/,
  );
  if (matchCompromisso) {
    return {
      tipoHorario: 'compromisso',
      hora: parseHora(matchCompromisso[1], matchCompromisso[2], matchCompromisso[3]),
      trecho: matchCompromisso[0],
    };
  }

  return null;
}

interface DeteccaoCategoria {
  categoria: Categoria;
  trecho: string;
}

const PALAVRAS_CATEGORIA: { categoria: Categoria; palavras: string[] }[] = [
  {
    categoria: 'aniversario',
    palavras: ['aniversario', 'aniversário', 'parabenizar', 'felicitar', 'presente de aniversario', 'presente de aniversário'],
  },
  { categoria: 'trabalho', palavras: ['reuniao', 'reunião', 'call', 'entregar', 'relatorio', 'relatório', 'apresentacao', 'apresentação'] },
  { categoria: 'saude', palavras: ['medico', 'médico', 'consulta', 'exame', 'dentista'] },
];

function detectarCategoria(textoOriginal: string): DeteccaoCategoria {
  const textoSemAcento = removerAcentosLeve(normalizar(textoOriginal));
  for (const { categoria, palavras } of PALAVRAS_CATEGORIA) {
    for (const palavra of palavras) {
      const palavraSemAcento = removerAcentosLeve(palavra);
      if (textoSemAcento.includes(palavraSemAcento)) {
        return { categoria, trecho: palavra };
      }
    }
  }
  return { categoria: 'outro', trecho: '' };
}

function detectarRecorrencia(textoOriginal: string): Recorrencia {
  const textoSemAcento = removerAcentosLeve(normalizar(textoOriginal));
  if (/aniversario/.test(textoSemAcento) || /todo\s+ano/.test(textoSemAcento)) {
    return 'anual';
  }
  return 'nenhuma';
}

function limparTitulo(textoOriginal: string, trechos: string[]): string {
  let titulo = textoOriginal.normalize('NFC');
  for (const trecho of trechos) {
    if (!trecho) continue;
    // Compara versões normalizadas (sem acento/maiúsculas) pra achar a posição,
    // já que a normalização preserva o comprimento caractere-a-caractere em PT-BR.
    const trechoNormalizado = removerAcentosLeve(trecho.toLowerCase());
    const tituloNormalizado = removerAcentosLeve(titulo.toLowerCase());
    const idx = tituloNormalizado.indexOf(trechoNormalizado);
    if (idx !== -1) {
      titulo = titulo.slice(0, idx) + ' ' + titulo.slice(idx + trecho.length);
    }
  }
  titulo = titulo.replace(/\s+/g, ' ').trim();
  if (!titulo) titulo = textoOriginal.trim();
  return titulo.charAt(0).toUpperCase() + titulo.slice(1);
}

/**
 * Parser de linguagem natural PT-BR. Função pura: nunca lança erro,
 * sempre retorna um item utilizável (fallback: hoje / categoria "outro").
 */
export function parseItem(textoOriginal: string, agora: Date = new Date()): ResultadoParse {
  const trechosReconhecidos: string[] = [];

  const deteccaoData = detectarData(textoOriginal, agora);
  const data = deteccaoData?.data ?? agora;
  if (deteccaoData) trechosReconhecidos.push(deteccaoData.trecho);

  const deteccaoHorario = detectarHorario(textoOriginal);
  if (deteccaoHorario) trechosReconhecidos.push(deteccaoHorario.trecho);

  const deteccaoCategoria = detectarCategoria(textoOriginal);
  if (deteccaoCategoria.trecho) trechosReconhecidos.push(deteccaoCategoria.trecho);

  const recorrencia = detectarRecorrencia(textoOriginal);
  const categoria: Categoria = deteccaoCategoria.categoria;

  // Só removemos data/hora do título — a palavra-chave de categoria costuma
  // ser o próprio assunto (ex.: "reunião amanhã às 15h" → título "Reunião").
  const trechosParaTitulo = [deteccaoData?.trecho, deteccaoHorario?.trecho].filter(
    (t): t is string => !!t,
  );
  const titulo = limparTitulo(textoOriginal, trechosParaTitulo);

  const item: NovoItem = {
    textoOriginal,
    titulo,
    data: format(data, 'yyyy-MM-dd'),
    horaCompromisso: deteccaoHorario?.tipoHorario === 'compromisso' ? deteccaoHorario.hora : null,
    horaLimite: deteccaoHorario?.tipoHorario === 'prazo' ? deteccaoHorario.hora : null,
    tipoHorario: deteccaoHorario?.tipoHorario ?? 'nenhum',
    categoria,
    recorrencia,
    lembreteOffsetDias: 0,
  };

  return { item, trechosReconhecidos: trechosReconhecidos.filter(Boolean) };
}
