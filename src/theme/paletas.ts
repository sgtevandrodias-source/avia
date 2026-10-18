// Paleta AVIA: índigo = marca/pendente, verde = conclusão, vermelho só pra
// alerta de verdade (atrasado, apagar). O índigo substituiu o laranja (que
// remetia a comida/urgência) por uma identidade mais calma: lembra das
// tarefas sem estressar. A intensidade do índigo cai conforme o horizonte de
// tempo se distancia de hoje (as chaves urgent* mantêm o nome antigo).
// Duas paletas (clara/escura) com as MESMAS chaves — ver ThemeContext.tsx,
// que escolhe qual delas expor via useTheme() conforme a preferência do
// usuário (ou o tema do sistema).

// Índigo da identidade visual do Avia (título "Avia", frase do splash,
// ícone do app) — fonte única pra essa cor; as paletas abaixo derivam dela.
export const COR_MARCA = '#5B5BD6';

export interface Paleta {
  // Cor da marca nesse esquema (clara usa COR_MARCA; escura, um tom um pouco
  // mais claro pra manter o contraste sobre fundo escuro).
  marca: string;

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
  marca: COR_MARCA,

  background: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#ECECEC',

  textPrimary: '#1A1A1A',
  textSecondary: '#767676',
  textMuted: '#A3A3A3',

  done: '#2ECC71',
  doneSoft: '#E8F9EF',

  urgentHoje: COR_MARCA,
  urgentAmanha: '#7676E0',
  urgentQuinzena: '#9A9AEA',
  urgentMes: '#BDBDF3',

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
  marca: '#8B8CF0',

  background: '#121212',
  surface: '#1E1E1E',
  border: '#2C2C2C',

  textPrimary: '#F2F2F2',
  textSecondary: '#B0B0B0',
  textMuted: '#7A7A7A',

  done: '#2ECC71',
  doneSoft: '#16301F',

  urgentHoje: '#8B8CF0',
  urgentAmanha: '#7C7DDB',
  urgentQuinzena: '#6E6FC0',
  urgentMes: '#55568A',

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
  hoje: '#ECECFB',
  amanha: '#F0F0FC',
  quinzena: '#F4F4FD',
  mes: '#F7F7FE',
};

const CORES_PERIODO_SOFT_ESCURO: Record<PeriodoKey, string> = {
  hoje: '#24244A',
  amanha: '#212140',
  quinzena: '#1F1F35',
  mes: '#1C1C2A',
};

export function corPorPeriodoSoftDaPaleta(esquema: 'claro' | 'escuro'): Record<PeriodoKey, string> {
  return esquema === 'escuro' ? CORES_PERIODO_SOFT_ESCURO : CORES_PERIODO_SOFT_CLARO;
}
