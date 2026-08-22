import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { useItems } from '../context/ItemsContext';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';
import { aguardarProximoFrame } from '../utils/aguardarProximoFrame';
import { avisar } from '../utils/confirm';

export function DesbloquearCriptografiaScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const navigation = useNavigation<any>();
  const { desbloquearCriptografia } = useAuth();
  const { sincronizarAgora } = useItems();

  const [segredo, setSegredo] = useState('');
  const [processando, setProcessando] = useState(false);

  const desbloquear = async () => {
    if (!segredo.trim()) return;
    setProcessando(true);
    try {
      await aguardarProximoFrame();
      const ok = await desbloquearCriptografia(segredo.trim());
      if (!ok) {
        avisar('Não bateu', 'Essa frase secreta ou código de recuperação não confere. Tente de novo.');
        return;
      }
      await sincronizarAgora();
      navigation.goBack();
    } catch {
      avisar('Não foi possível verificar', 'Tente de novo em alguns instantes.');
    } finally {
      setProcessando(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.titulo}>Desbloquear criptografia</Text>
        <Text style={styles.texto}>
          Este aparelho ainda não tem a chave dessa conta. Digite sua frase secreta ou, se não lembrar dela, o código
          de recuperação que você guardou na configuração.
        </Text>

        <Text style={styles.label}>Frase secreta ou código de recuperação</Text>
        <TextInput
          style={styles.input}
          value={segredo}
          onChangeText={setSegredo}
          placeholder="Frase secreta ou código"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
        />

        <Pressable style={styles.botaoPrimario} onPress={desbloquear} disabled={processando}>
          {processando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.botaoPrimarioTexto}>Desbloquear</Text>}
        </Pressable>
        <Pressable style={styles.botaoCancelar} onPress={() => navigation.goBack()} disabled={processando}>
          <Text style={styles.botaoCancelarTexto}>Agora não</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, paddingBottom: 40 },
  titulo: { fontFamily: fonts.extraBold, fontSize: 20, color: colors.textPrimary, marginBottom: 12 },
  texto: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  label: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 20,
    marginBottom: 6,
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
  botaoPrimario: {
    marginTop: 24,
    backgroundColor: colors.urgentHoje,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botaoPrimarioTexto: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  botaoCancelar: { marginTop: 14, alignItems: 'center', paddingVertical: 10 },
  botaoCancelarTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  });
}
