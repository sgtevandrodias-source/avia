import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';
import { avisar } from '../utils/confirm';

export function ExcluirContaScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const navigation = useNavigation<any>();
  const { usuario, excluirConta } = useAuth();
  const [emailDigitado, setEmailDigitado] = useState('');
  const [excluindo, setExcluindo] = useState(false);

  const emailConfere = usuario != null && emailDigitado.trim().toLowerCase() === usuario.email.toLowerCase();

  const confirmarExclusao = async () => {
    if (!emailConfere || excluindo) return;
    setExcluindo(true);
    try {
      await excluirConta();
      // Sem "Pronto" aqui: excluirConta já fecha a sessão (removerConta) e a
      // árvore de navegação autenticada desmonta sozinha (volta pro login ou
      // pra outra conta salva) — não sobra tela pra mostrar um aviso em cima.
    } catch (e) {
      setExcluindo(false);
      avisar('Não foi possível excluir', e instanceof Error ? e.message : 'Tente de novo em alguns instantes.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.aviso}>Isso é irreversível</Text>
        <Text style={styles.texto}>
          Excluir a conta apaga definitivamente do servidor, pra sempre: todas as tarefas e categorias, o histórico
          arquivado, os compartilhamentos enviados e recebidos, e a configuração de criptografia. Não tem como
          desfazer nem recuperar depois.
        </Text>
        <Text style={styles.texto}>
          Isso remove só a conta <Text style={styles.destaque}>{usuario?.email}</Text> — se você tiver outras contas
          salvas neste aparelho, elas não são afetadas.
        </Text>

        <Text style={styles.label}>
          Pra confirmar, digite o e-mail <Text style={styles.destaque}>{usuario?.email}</Text> abaixo:
        </Text>
        <TextInput
          style={styles.input}
          value={emailDigitado}
          onChangeText={setEmailDigitado}
          placeholder="seu@email.com"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <Pressable
          style={[styles.botaoExcluir, !emailConfere && styles.botaoExcluirDesabilitado]}
          onPress={confirmarExclusao}
          disabled={!emailConfere || excluindo}
        >
          {excluindo ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.botaoExcluirTexto}>Excluir conta definitivamente</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: 16, paddingBottom: 40 },
    aviso: {
      fontFamily: fonts.bold,
      fontSize: 16,
      color: colors.danger,
      marginBottom: 12,
    },
    texto: {
      fontFamily: fonts.regular,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
      marginBottom: 12,
    },
    destaque: {
      fontFamily: fonts.bold,
      color: colors.textPrimary,
    },
    label: {
      fontFamily: fonts.medium,
      fontSize: 13,
      color: colors.textPrimary,
      marginTop: 8,
      marginBottom: 8,
    },
    input: {
      fontFamily: fonts.regular,
      fontSize: 15,
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.textPrimary,
    },
    botaoExcluir: {
      marginTop: 20,
      backgroundColor: colors.danger,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
    },
    botaoExcluirDesabilitado: {
      opacity: 0.4,
    },
    botaoExcluirTexto: {
      fontFamily: fonts.bold,
      fontSize: 14,
      color: colors.white,
    },
  });
}
