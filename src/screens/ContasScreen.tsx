import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth, type Usuario } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';
import { confirmar } from '../utils/confirm';

export function ContasScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const navigation = useNavigation<any>();
  const { usuario, contas, alternarConta, removerConta } = useAuth();
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  const trocar = async (conta: Usuario) => {
    if (conta.id === usuario?.id || processandoId) return;
    setProcessandoId(conta.id);
    try {
      await alternarConta(conta.id);
    } finally {
      setProcessandoId(null);
    }
  };

  const remover = (conta: Usuario) => {
    const ultima = contas.length === 1;
    confirmar(
      'Remover deste aparelho',
      ultima
        ? `Isso vai te desconectar de "${conta.email}" neste aparelho. Continuar?`
        : `"${conta.email}" deixa de ficar salva neste aparelho — pra usar de novo, será preciso entrar outra vez. Continuar?`,
      async () => {
        setProcessandoId(conta.id);
        try {
          await removerConta(conta.id);
        } finally {
          setProcessandoId(null);
        }
      },
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={contas}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => {
          const ativa = item.id === usuario?.id;
          const processando = processandoId === item.id;
          return (
            <Pressable style={[styles.linha, ativa && styles.linhaAtiva]} onPress={() => trocar(item)}>
              <Avatar nome={item.nome} email={item.email} fotoUrl={item.fotoUrl} tamanho={40} />
              <View style={styles.info}>
                <Text style={styles.nome}>{item.nome}</Text>
                <Text style={styles.email}>{item.email}</Text>
              </View>
              {processando ? (
                <ActivityIndicator color={colors.urgentHoje} />
              ) : ativa ? (
                <Text style={styles.tagAtiva}>Ativa</Text>
              ) : (
                <Pressable hitSlop={8} onPress={() => remover(item)}>
                  <Text style={styles.linkRemover}>Remover</Text>
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />
      <Pressable style={styles.botaoAdicionar} onPress={() => navigation.navigate('AdicionarConta')}>
        <Text style={styles.botaoAdicionarTexto}>+ Adicionar conta</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    lista: { padding: 16 },
    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    linhaAtiva: { borderColor: colors.urgentHoje },
    info: { flex: 1 },
    nome: { fontFamily: fonts.bold, fontSize: 14, color: colors.textPrimary },
    email: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    tagAtiva: {
      fontFamily: fonts.bold,
      fontSize: 11,
      color: colors.urgentHoje,
      textTransform: 'uppercase',
    },
    linkRemover: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
    botaoAdicionar: {
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    botaoAdicionarTexto: { fontFamily: fonts.bold, fontSize: 14, color: colors.textPrimary },
  });
}
