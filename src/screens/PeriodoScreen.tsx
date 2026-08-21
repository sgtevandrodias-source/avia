import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ItemCard } from '../components/ItemCard';
import { ProgressoDoDia } from '../components/ProgressoDoDia';
import { useItems } from '../context/ItemsContext';
import { colors, corPorPeriodo, type PeriodoKey } from '../theme/colors';
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
  const { itens, alternarStatus } = useItems();
  const navigation = useNavigation<any>();
  const corPendente = corPorPeriodo[periodo];

  // Pendentes (ordenados por prioridade + urgência) seguidos dos concluídos
  // daquele período — concluídos não somem da lista principal, só ficam por
  // último (o ItemCard já aplica o risco no título).
  const itensPeriodo = useMemo(() => {
    const pendentes = ordenarPorUrgencia(itensDoPeriodo(itens, periodo));
    const concluidos = ordenarPorUrgencia(itensConcluidosDoPeriodo(itens, periodo));
    return [...pendentes, ...concluidos];
  }, [itens, periodo]);

  const totalHoje = itensPendentesHoje(itens).length + itensFeitosHoje(itens).length;
  const feitosHoje = itensFeitosHoje(itens).length;

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
            onPress={() => navigation.navigate('DetalheItem', { itemId: item.id })}
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

const styles = StyleSheet.create({
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
