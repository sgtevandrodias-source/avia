export type TipoHorario = 'nenhum' | 'compromisso' | 'prazo';

export type Categoria =
  | 'social'
  | 'trabalho'
  | 'pessoal'
  | 'saude'
  | 'compromisso_fixo'
  | 'outro';

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
  lembreteOffsetDias: number;
  criadoEm: string; // ISO datetime
  concluidoEm: string | null; // ISO datetime
  atualizadoEm: string; // ISO datetime — usado pela sincronização (last write wins)
}

export type NovoItem = Omit<Item, 'id' | 'status' | 'criadoEm' | 'concluidoEm' | 'atualizadoEm'>;

export const CATEGORIAS: { valor: Categoria; label: string; icone: string; cor: string }[] = [
  { valor: 'social', label: 'Social', icone: '🎉', cor: '#B084F5' },
  { valor: 'trabalho', label: 'Trabalho', icone: '💼', cor: '#4C9AFF' },
  { valor: 'pessoal', label: 'Pessoal', icone: '🏠', cor: '#F5A623' },
  { valor: 'saude', label: 'Saúde', icone: '⚕️', cor: '#2BB3A3' },
  { valor: 'compromisso_fixo', label: 'Compromisso fixo', icone: '📌', cor: '#7A8CA3' },
  { valor: 'outro', label: 'Outro', icone: '•', cor: '#9AA3AF' },
];

export function categoriaInfo(categoria: Categoria) {
  return CATEGORIAS.find((c) => c.valor === categoria) ?? CATEGORIAS[CATEGORIAS.length - 1];
}
