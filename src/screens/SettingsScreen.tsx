import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { CATEGORIAS } from '../types/item';

export function SettingsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.titulo}>Configurações</Text>
      <Text style={styles.secao}>Categorias</Text>
      <FlatList
        data={CATEGORIAS}
        keyExtractor={(c) => c.valor}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => (
          <View style={styles.linha}>
            <View style={[styles.bolinha, { backgroundColor: item.cor }]} />
            <Text style={styles.icone}>{item.icone}</Text>
            <Text style={styles.nome}>{item.label}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  titulo: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.textPrimary,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  secao: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  lista: { paddingHorizontal: 16 },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bolinha: { width: 10, height: 10, borderRadius: 5 },
  icone: { fontSize: 16 },
  nome: { fontFamily: fonts.medium, fontSize: 14, color: colors.textPrimary },
});
