import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ItemCard } from '../components/ItemCard';
import { useItems } from '../context/ItemsContext';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { dataHoraLimiteDoItem, itensAtrasados } from '../utils/periodos';
import type { Item } from '../types/item';

export function AtrasadosScreen() {
  const { itens, alternarStatus } = useItems();
  const navigation = useNavigation<any>();

  const lista = useMemo(() => itensAtrasados(itens), [itens]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitulo}>Atrasados</Text>
      </View>
      <FlatList
        data={lista}
        keyExtractor={(item: Item) => item.id}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => (
          <View>
            <Text style={styles.atraso}>
              atrasado há {formatDistanceToNow(dataHoraLimiteDoItem(item), { locale: ptBR })}
            </Text>
            <ItemCard
              item={item}
              corPendente={colors.danger}
              onToggle={() => alternarStatus(item.id)}
              onPress={() => navigation.navigate('DetalheItem', { itemId: item.id })}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Nada atrasado. Tudo em dia! ✌️</Text>
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
  atraso: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.danger,
    marginTop: 10,
    marginBottom: 2,
  },
  vazio: { paddingTop: 60, alignItems: 'center' },
  vazioTexto: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
});
