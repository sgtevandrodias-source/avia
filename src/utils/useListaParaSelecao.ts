import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTransferencias } from '../context/TransferenciasContext';
import type { Item } from '../types/item';

/** A tela em foco informa as tarefas que mostra — é o que "Selecionar todas desta seção" seleciona. */
export function useListaParaSelecao(lista: Item[]): void {
  const { definirListaVisivel } = useTransferencias();
  useFocusEffect(
    useCallback(() => {
      definirListaVisivel(lista);
    }, [definirListaVisivel, lista]),
  );
}
