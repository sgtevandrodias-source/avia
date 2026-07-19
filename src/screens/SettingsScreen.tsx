import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { useItems } from '../context/ItemsContext';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { CATEGORIAS } from '../types/item';
import { confirmar } from '../utils/confirm';

export function SettingsScreen() {
  const { sincronizando, sincronizarAgora } = useItems();
  const { usuario, logout } = useAuth();

  const confirmarLogout = () => {
    confirmar('Sair', 'Tem certeza que deseja sair da sua conta?', () => logout());
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.titulo}>Configurações</Text>

      <Text style={styles.secao}>Conta</Text>
      <View style={styles.linhaConta}>
        <View>
          <Text style={styles.contaNome}>{usuario?.nome}</Text>
          <Text style={styles.contaEmail}>{usuario?.email}</Text>
        </View>
        <Pressable onPress={confirmarLogout}>
          <Text style={styles.linkSair}>Sair</Text>
        </Pressable>
      </View>

      <Text style={styles.secao}>Sincronização</Text>
      <Pressable style={styles.linhaSync} onPress={sincronizarAgora} disabled={sincronizando}>
        {sincronizando ? (
          <ActivityIndicator color={colors.urgentHoje} />
        ) : (
          <Text style={styles.syncTexto}>🔄 Sincronizar agora</Text>
        )}
      </Pressable>

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
  linhaConta: {
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contaNome: { fontFamily: fonts.bold, fontSize: 14, color: colors.textPrimary },
  contaEmail: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  linkSair: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
  linhaSync: {
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  syncTexto: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textPrimary,
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
