export type TipoHorario = 'nenhum' | 'compromisso' | 'prazo' | 'dia_todo';

// Id de uma categoria — as categorias em si (nome/ícone/cor) agora são
// dinâmicas por usuário, ver CategoriasContext. Strings fixas como
// 'social'/'aniversario'/'outro' continuam existindo como categorias
// padrão semeadas no primeiro login (worker/src/categoriasPadrao.ts).
export type Categoria = string;

export type Status = 'pendente' | 'feito';

export type Recorrencia = 'nenhuma' | 'anual' | 'mensal' | 'semanal';

export interface Item {
  id: string;
  textoOriginal: string;
  titulo: string;
  data: string; // yyyy-MM-dd
  horaCompromisso: string | null; // HH:mm
  horaLimite: string | null; // HH:mm
  tipoHorario: TipoHorario;
  categoria: Categoria;
  status: Status;
  recorrencia: Recorrencia;
  lembreteOffsetMinutos: number; // 0 = no horário do evento; >0 = minutos de antecedência
  criadoEm: string; // ISO datetime
  concluidoEm: string | null; // ISO datetime
  atualizadoEm: string; // ISO datetime — usado pela sincronização (last write wins)
}

export type NovoItem = Omit<Item, 'id' | 'status' | 'criadoEm' | 'concluidoEm' | 'atualizadoEm'>;

export const PRESETS_LEMBRETE: { minutos: number; label: string }[] = [
  { minutos: 0, label: 'No horário' },
  { minutos: 5, label: '5 min antes' },
  { minutos: 15, label: '15 min antes' },
  { minutos: 30, label: '30 min antes' },
  { minutos: 60, label: '1 hora antes' },
  { minutos: 120, label: '2 horas antes' },
  { minutos: 1440, label: '1 dia antes' },
  { minutos: 2880, label: '2 dias antes' },
  { minutos: 10080, label: '1 semana antes' },
];

export interface CategoriaItem {
  id: string;
  nome: string;
  icone: string;
  cor: string;
  sistema: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export type NovaCategoria = Omit<CategoriaItem, 'id' | 'criadoEm' | 'atualizadoEm'>;

const CATEGORIA_DESCONHECIDA_BASE = { nome: 'Outro', icone: '•', cor: '#9AA3AF', sistema: true };

/** Busca a categoria pelo id na lista carregada; se não achar (ex.: ainda sincronizando), devolve um fallback seguro. */
export function categoriaInfo(categorias: CategoriaItem[], categoriaId: string): CategoriaItem {
  const encontrada = categorias.find((c) => c.id === categoriaId);
  if (encontrada) return encontrada;
  return { id: categoriaId, criadoEm: '', atualizadoEm: '', ...CATEGORIA_DESCONHECIDA_BASE };
}
