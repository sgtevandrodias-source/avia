import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import {
  corPorPeriodoDaPaleta,
  corPorPeriodoSoftDaPaleta,
  paletaClara,
  paletaEscura,
  type Paleta,
  type PeriodoKey,
} from './paletas';
import { lerTema, salvarTema } from './temaStorage';

export type PreferenciaTema = 'claro' | 'escuro' | 'sistema';

interface ThemeContextValue {
  colors: Paleta;
  corPorPeriodo: Record<PeriodoKey, string>;
  corPorPeriodoSoft: Record<PeriodoKey, string>;
  esquemaAtivo: 'claro' | 'escuro';
  preferencia: PreferenciaTema;
  definirPreferencia: (preferencia: PreferenciaTema) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function preferenciaValida(valor: string | null): valor is PreferenciaTema {
  return valor === 'claro' || valor === 'escuro' || valor === 'sistema';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const esquemaSistema = useColorScheme();
  const [preferencia, setPreferencia] = useState<PreferenciaTema>('sistema');

  useEffect(() => {
    lerTema().then((salvo) => {
      if (preferenciaValida(salvo)) setPreferencia(salvo);
    });
  }, []);

  const definirPreferencia = useCallback((nova: PreferenciaTema) => {
    setPreferencia(nova);
    salvarTema(nova).catch(() => {});
  }, []);

  const esquemaAtivo: 'claro' | 'escuro' =
    preferencia === 'sistema' ? (esquemaSistema === 'dark' ? 'escuro' : 'claro') : preferencia;

  const valor = useMemo<ThemeContextValue>(() => {
    const paleta = esquemaAtivo === 'escuro' ? paletaEscura : paletaClara;
    return {
      colors: paleta,
      corPorPeriodo: corPorPeriodoDaPaleta(paleta),
      corPorPeriodoSoft: corPorPeriodoSoftDaPaleta(esquemaAtivo),
      esquemaAtivo,
      preferencia,
      definirPreferencia,
    };
  }, [esquemaAtivo, preferencia, definirPreferencia]);

  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  return ctx;
}
