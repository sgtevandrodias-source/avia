import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

export function LoginScreen() {
  const { login, registrar, loginComGoogle, googleDisponivel, erro } = useAuth();
  const [modoCadastro, setModoCadastro] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    if (!email.trim() || !senha.trim() || (modoCadastro && !nome.trim())) return;
    setEnviando(true);
    try {
      if (modoCadastro) {
        await registrar(email.trim(), senha, nome.trim());
      } else {
        await login(email.trim(), senha);
      }
    } catch {
      // erro já fica exposto via useAuth().erro
    } finally {
      setEnviando(false);
    }
  };

  const entrarComGoogle = async () => {
    setEnviando(true);
    try {
      await loginComGoogle();
    } catch {
      // erro já fica exposto via useAuth().erro
    } finally {
      setEnviando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={styles.subtitulo}>{modoCadastro ? 'Criar conta' : 'Entrar'}</Text>

        {modoCadastro && (
          <TextInput
            style={styles.input}
            placeholder="Nome"
            placeholderTextColor={colors.textMuted}
            value={nome}
            onChangeText={setNome}
            autoCapitalize="words"
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="E-mail"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Senha"
          placeholderTextColor={colors.textMuted}
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
        />

        {erro && <Text style={styles.erro}>{erro}</Text>}

        <Pressable style={styles.botaoPrimario} onPress={confirmar} disabled={enviando}>
          {enviando ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.botaoPrimarioTexto}>{modoCadastro ? 'Criar conta' : 'Entrar'}</Text>
          )}
        </Pressable>

        <Pressable onPress={() => setModoCadastro((v) => !v)} style={styles.linkAlternar}>
          <Text style={styles.linkAlternarTexto}>
            {modoCadastro ? 'Já tenho conta — entrar' : 'Não tenho conta — criar'}
          </Text>
        </Pressable>

        <View style={styles.divisorLinha}>
          <View style={styles.divisor} />
          <Text style={styles.divisorTexto}>ou</Text>
          <View style={styles.divisor} />
        </View>

        <Pressable
          style={[styles.botaoGoogle, !googleDisponivel && styles.botaoDesabilitado]}
          onPress={entrarComGoogle}
          disabled={enviando || !googleDisponivel}
        >
          <Text style={styles.botaoGoogleTexto}>Continuar com Google</Text>
        </Pressable>
        {!googleDisponivel && (
          <Text style={styles.avisoGoogle}>Disponível só no app instalado no Android.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 24, paddingTop: 32, alignItems: 'center' },
  logo: { width: 288, height: 288, borderRadius: 48, marginBottom: 12 },
  subtitulo: { fontFamily: fonts.medium, fontSize: 15, color: colors.textSecondary, marginBottom: 24 },
  input: {
    width: '100%',
    fontFamily: fonts.regular,
    fontSize: 15,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    marginBottom: 10,
  },
  erro: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.danger,
    marginBottom: 10,
    textAlign: 'center',
  },
  botaoPrimario: {
    width: '100%',
    backgroundColor: colors.urgentHoje,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  botaoPrimarioTexto: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  linkAlternar: { marginTop: 16, marginBottom: 12 },
  linkAlternarTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.urgentHoje },
  divisorLinha: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 8 },
  divisor: { flex: 1, height: 1, backgroundColor: colors.border },
  divisorTexto: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginHorizontal: 10 },
  botaoGoogle: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  botaoDesabilitado: { opacity: 0.5 },
  botaoGoogleTexto: { fontFamily: fonts.medium, fontSize: 15, color: colors.textPrimary },
  avisoGoogle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
});
