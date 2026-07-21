import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ItemCard } from '../components/ItemCard';
import { ProgressoDoDia } from '../components/ProgressoDoDia';
import { useAuth } from '../auth/AuthContext';
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

export function PeriodoScreen({ periodo, titulo }: Props) {
  const { itens, alternarStatus } = useItems();
  const { usuario } = useAuth();
  const navigation = useNavigation<any>();
  const corPendente = corPorPeriodo[periodo];
  const primeiroNome = usuario?.nome?.trim().split(/\s+/)[0] ?? '';

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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: corPendente }]}>
        {periodo === 'hoje' && (
          <View style={styles.saudacaoLinha}>
            <Pressable
              onPress={() => navigation.openDrawer()}
              style={styles.botaoMenu}
              hitSlop={8}
            >
              <Text style={styles.iconeMenu}>☰</Text>
            </Pressable>
            <Text style={styles.saudacaoTexto}>Avia, {primeiroNome}!</Text>
          </View>
        )}
        <Text style={styles.headerTitulo}>{titulo}</Text>
      </View>
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
  saudacaoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  botaoMenu: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconeMenu: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  saudacaoTexto: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    color: colors.textPrimary,
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
