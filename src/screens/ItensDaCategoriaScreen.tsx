import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ItemCard } from '../components/ItemCard';
import { useItems } from '../context/ItemsContext';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';
import { itensConcluidosOrdenados, ordenarPorUrgencia } from '../utils/periodos';
import type { Item } from '../types/item';

interface RotaParams {
  categoriaId: string;
  categoriaNome: string;
  categoriaCor: string;
}

/**
 * Tarefas de uma única categoria (aberta a partir de CategoriasScreen) —
 * pendentes primeiro (mesma ordem de urgência/prioridade usada em Hoje/
 * Amanhã/etc.), seguidas das concluídas da mais recente pra mais antiga
 * (itensConcluidosOrdenados já ordena assim).
 */
export function ItensDaCategoriaScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { itens, alternarStatus } = useItems();
  const { categoriaId, categoriaCor } = route.params as RotaParams;

  const lista = useMemo(() => {
    const daCategoria = itens.filter((i) => i.categoria === categoriaId);
    const pendentes = ordenarPorUrgencia(daCategoria.filter((i) => i.status === 'pendente'));
    const concluidos = itensConcluidosOrdenados(daCategoria);
    return [...pendentes, ...concluidos];
  }, [itens, categoriaId]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={lista}
        keyExtractor={(item: Item) => item.id}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            corPendente={categoriaCor || colors.urgentHoje}
            onToggle={() => alternarStatus(item.id)}
            onPress={() => navigation.navigate('DetalheItem', { itemId: item.id })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Nada nessa categoria ainda.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    lista: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
    vazio: { paddingTop: 60, alignItems: 'center' },
    vazioTexto: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
  });
}
