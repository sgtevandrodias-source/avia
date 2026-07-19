import React, { useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CapturaRapida } from '../components/CapturaRapida';
import { ItemCard } from '../components/ItemCard';
import { ProgressoDoDia } from '../components/ProgressoDoDia';
import { useItems } from '../context/ItemsContext';
import { colors, corPorPeriodo, type PeriodoKey } from '../theme/colors';
import { fonts } from '../theme/typography';
import { agruparPorCategoria, itensDoPeriodo, itensFeitosHoje, itensPendentesHoje } from '../utils/periodos';
import { categoriaInfo, type Item } from '../types/item';

interface Props {
  periodo: PeriodoKey;
  titulo: string;
}

export function PeriodoScreen({ periodo, titulo }: Props) {
  const { itens, alternarStatus } = useItems();
  const navigation = useNavigation<any>();
  const corPendente = corPorPeriodo[periodo];

  const itensPeriodo = useMemo(() => itensDoPeriodo(itens, periodo), [itens, periodo]);

  const secoes = useMemo(() => {
    const grupos = agruparPorCategoria(itensPeriodo);
    return Array.from(grupos.entries()).map(([categoria, dados]) => ({
      title: categoriaInfo(categoria).label,
      icone: categoriaInfo(categoria).icone,
      data: dados,
    }));
  }, [itensPeriodo]);

  const totalHoje = itensPendentesHoje(itens).length + itensFeitosHoje(itens).length;
  const feitosHoje = itensFeitosHoje(itens).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: corPendente }]}>
        <Text style={styles.headerTitulo}>{titulo}</Text>
      </View>
      <CapturaRapida />
      {periodo === 'hoje' && <ProgressoDoDia feitos={feitosHoje} total={totalHoje} />}
      <SectionList
        sections={secoes}
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
        renderSectionHeader={({ section }) => (
          <Text style={styles.secaoTitulo}>
            {section.icone} {section.title}
          </Text>
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 3,
  },
  headerTitulo: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.textPrimary,
  },
  lista: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  secaoTitulo: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
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
