import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ItemCard } from '../components/ItemCard';
import { ProgressoDoDia } from '../components/ProgressoDoDia';
import { useItems } from '../context/ItemsContext';
import { useCompartilhamentos } from '../context/CompartilhamentosContext';
import { itemDeCompartilhamento } from '../utils/compartilhamentos';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta, PeriodoKey } from '../theme/paletas';
import { fonts } from '../theme/typography';
import {
  itensConcluidosDoPeriodo,
  itensDoPeriodo,
  itensFeitosHoje,
  itensPendentesHoje,
  ordenarPorUrgencia,
} from '../utils/periodos';
import type { Item } from '../types/item';

interface Props {
  periodo: PeriodoKey;
  titulo: string;
}

export function PeriodoScreen({ periodo }: Props) {
  const { colors, corPorPeriodo } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const { itens, alternarStatus } = useItems();
  const { recebidos } = useCompartilhamentos();
  const navigation = useNavigation<any>();
  const corPendente = corPorPeriodo[periodo];

  // Itens compartilhados com a gente e já aceitos entram nas mesmas listas
  // de período, lado a lado com os próprios — convertidos pra forma de Item
  // (somenteLeitura: true, ver utils/compartilhamentos.ts).
  const todosOsItens = useMemo(() => {
    const aceitos = recebidos.filter((c) => c.status === 'aceito').map(itemDeCompartilhamento);
    return [...itens, ...aceitos];
  }, [itens, recebidos]);

  // Pendentes (ordenados por prioridade + urgência) seguidos dos concluídos
  // daquele período — concluídos não somem da lista principal, só ficam por
  // último (o ItemCard já aplica o risco no título).
  const itensPeriodo = useMemo(() => {
    const pendentes = ordenarPorUrgencia(itensDoPeriodo(todosOsItens, periodo));
    const concluidos = ordenarPorUrgencia(itensConcluidosDoPeriodo(todosOsItens, periodo));
    return [...pendentes, ...concluidos];
  }, [todosOsItens, periodo]);

  const totalHoje = itensPendentesHoje(todosOsItens).length + itensFeitosHoje(todosOsItens).length;
  const feitosHoje = itensFeitosHoje(todosOsItens).length;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {periodo === 'hoje' && <ProgressoDoDia feitos={feitosHoje} total={totalHoje} />}
      <FlatList
        data={itensPeriodo}
        keyExtractor={(item: Item) => item.id}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            corPendente={corPendente}
            onToggle={() => alternarStatus(item.id)}
            onPress={() =>
              item.somenteLeitura
                ? navigation.navigate('DetalheItem', { itemCompartilhado: item })
                : navigation.navigate('DetalheItem', { itemId: item.id })
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Nada por aqui. Aproveite ✌️</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  lista: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  vazio: {
    paddingTop: 60,
    alignItems: 'center',
  },
  vazioTexto: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  });
}
