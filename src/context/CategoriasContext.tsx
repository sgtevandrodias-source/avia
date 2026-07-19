import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as db from '../db/database';
import type { CategoriaItem, NovaCategoria } from '../types/item';

interface CategoriasContextValue {
  categorias: CategoriaItem[];
  carregando: boolean;
  recarregar: () => Promise<void>;
  adicionarCategoria: (nova: NovaCategoria) => Promise<CategoriaItem>;
  editarCategoria: (categoria: CategoriaItem) => Promise<void>;
  removerCategoria: (id: string) => Promise<void>;
}

const CategoriasContext = createContext<CategoriasContextValue | null>(null);

export function CategoriasProvider({ children }: { children: React.ReactNode }) {
  const [categorias, setCategorias] = useState<CategoriaItem[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    const lista = await db.listarCategorias();
    setCategorias(lista);
  }, []);

  useEffect(() => {
    recarregar().finally(() => setCarregando(false));
  }, [recarregar]);

  const adicionarCategoria = useCallback(async (nova: NovaCategoria) => {
    const categoria = await db.criarCategoria(nova);
    setCategorias((atual) => [...atual, categoria]);
    return categoria;
  }, []);

  const editarCategoria = useCallback(async (categoria: CategoriaItem) => {
    await db.atualizarCategoria(categoria);
    setCategorias((atual) => atual.map((c) => (c.id === categoria.id ? categoria : c)));
  }, []);

  const removerCategoria = useCallback(async (id: string) => {
    await db.excluirCategoria(id);
    setCategorias((atual) => atual.filter((c) => c.id !== id));
  }, []);

  return (
    <CategoriasContext.Provider
      value={{ categorias, carregando, recarregar, adicionarCategoria, editarCategoria, removerCategoria }}
    >
      {children}
    </CategoriasContext.Provider>
  );
}

export function useCategorias() {
  const ctx = useContext(CategoriasContext);
  if (!ctx) throw new Error('useCategorias deve ser usado dentro de CategoriasProvider');
  return ctx;
}
