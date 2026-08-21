// Paleta AVIA: laranja-avermelhado = urgência/pendente, verde = conclusão.
// A saturação do laranja cai conforme o horizonte de tempo se distancia de hoje.
// Duas paletas (clara/escura) com as MESMAS chaves — ver ThemeContext.tsx,
// que escolhe qual delas expor via useTheme() conforme a preferência do
// usuário (ou o tema do sistema).
export interface Paleta {
  background: string;
  surface: string;
  border: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  done: string;
  doneSoft: string;

  urgentHoje: string;
  urgentAmanha: string;
  urgentQuinzena: string;
  urgentMes: string;

  danger: string;
  white: string;

  priority: string;
  prioritySoft: string;
}

export const paletaClara: Paleta = {
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

  priority: '#FFC107',
  prioritySoft: '#FFF8E1',
};

// "Soft" na paleta clara é um lavado quase-branco de uma cor viva; na escura
// vira um tingimento quase-preto da mesma cor, em vez de um branco que
// destoaria do resto do fundo escuro. As cores "vivas" (done/urgent*/danger/
// priority) ficam praticamente as mesmas — já são saturadas o bastante pra
// continuar legíveis sobre fundo escuro.
export const paletaEscura: Paleta = {
  background: '#121212',
  surface: '#1E1E1E',
  border: '#2C2C2C',

  textPrimary: '#F2F2F2',
  textSecondary: '#B0B0B0',
  textMuted: '#7A7A7A',

  done: '#2ECC71',
  doneSoft: '#16301F',

  urgentHoje: '#FF6A42',
  urgentAmanha: '#FF8961',
  urgentQuinzena: '#E0987A',
  urgentMes: '#8F6B5C',

  danger: '#F26355',
  white: '#FFFFFF',

  priority: '#FFC107',
  prioritySoft: '#3D3315',
};

export type PeriodoKey = 'hoje' | 'amanha' | 'quinzena' | 'mes';

export function corPorPeriodoDaPaleta(paleta: Paleta): Record<PeriodoKey, string> {
  return {
    hoje: paleta.urgentHoje,
    amanha: paleta.urgentAmanha,
    quinzena: paleta.urgentQuinzena,
    mes: paleta.urgentMes,
  };
}

const CORES_PERIODO_SOFT_CLARO: Record<PeriodoKey, string> = {
  hoje: '#FFE8E1',
  amanha: '#FFEEE7',
  quinzena: '#FFF2EC',
  mes: '#FFF6F1',
};

const CORES_PERIODO_SOFT_ESCURO: Record<PeriodoKey, string> = {
  hoje: '#3A2118',
  amanha: '#33231C',
  quinzena: '#2C2420',
  mes: '#282624',
};

export function corPorPeriodoSoftDaPaleta(esquema: 'claro' | 'escuro'): Record<PeriodoKey, string> {
  return esquema === 'escuro' ? CORES_PERIODO_SOFT_ESCURO : CORES_PERIODO_SOFT_CLARO;
}
