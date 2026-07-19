// Paleta AVIA: laranja-avermelhado = urgência/pendente, verde = conclusão.
// A saturação do laranja cai conforme o horizonte de tempo se distancia de hoje.
export const colors = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#ECECEC',

  textPrimary: '#1A1A1A',
  textSecondary: '#767676',
  textMuted: '#A3A3A3',

  done: '#2ECC71',
  doneSoft: '#E8F9EF',

  urgentHoje: '#FF5C33',
  urgentAmanha: '#FF7A52',
  urgentQuinzena: '#FF9B7A',
  urgentMes: '#FFC2AC',

  danger: '#E64A3B',
  white: '#FFFFFF',
} as const;

export type PeriodoKey = 'hoje' | 'amanha' | 'quinzena' | 'mes';

export const corPorPeriodo: Record<PeriodoKey, string> = {
  hoje: colors.urgentHoje,
  amanha: colors.urgentAmanha,
  quinzena: colors.urgentQuinzena,
  mes: colors.urgentMes,
};

export const corPorPeriodoSoft: Record<PeriodoKey, string> = {
  hoje: '#FFE8E1',
  amanha: '#FFEEE7',
  quinzena: '#FFF2EC',
  mes: '#FFF6F1',
};
