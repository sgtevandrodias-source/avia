import React, { useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ItemCard } from '../components/ItemCard';
import { useItems } from '../context/ItemsContext';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { itensConcluidosOrdenados } from '../utils/periodos';
import type { Item } from '../types/item';

function labelDoDia(dataIso: string): string {
  const data = parseISO(dataIso);
  if (isToday(data)) return 'Hoje';
  if (isYesterday(data)) return 'Ontem';
  return format(data, 'dd/MM/yyyy');
}

export function HistoricoScreen() {
  const { itens, alternarStatus } = useItems();
  const navigation = useNavigation<any>();

  const secoes = useMemo(() => {
    const concluidos = itensConcluidosOrdenados(itens);
    const grupos = new Map<string, Item[]>();
    for (const item of concluidos) {
      const chave = labelDoDia(item.concluidoEm as string);
      const lista = grupos.get(chave) ?? [];
      lista.push(item);
      grupos.set(chave, lista);
    }
    return Array.from(grupos.entries()).map(([title, data]) => ({ title, data }));
  }, [itens]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitulo}>Feitos</Text>
      </View>
      <SectionList
        sections={secoes}
        keyExtractor={(item: Item) => item.id}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            corPendente={colors.done}
            onToggle={() => alternarStatus(item.id)}
            onPress={() => navigation.navigate('DetalheItem', { itemId: item.id })}
          />
        )}
        renderSectionHeader={({ section }) => <Text style={styles.secaoTitulo}>{section.title}</Text>}
        ListEmptyComponent={
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Nada concluído ainda. Vamos lá! 💪</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerTitulo: { fontFamily: fonts.extraBold, fontSize: 24, color: colors.textPrimary },
  lista: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  secaoTitulo: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  vazio: { paddingTop: 60, alignItems: 'center' },
  vazioTexto: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
});
