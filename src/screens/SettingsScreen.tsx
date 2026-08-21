import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { useItems } from '../context/ItemsContext';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { avisar, confirmar } from '../utils/confirm';

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { sincronizando, sincronizarAgora } = useItems();
  const { usuario, logout, definirSenha, criptografiaConfigurada, criptografiaBloqueada } = useAuth();
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  const confirmarLogout = () => {
    confirmar('Sair', 'Tem certeza que deseja sair da sua conta?', () => logout());
  };

  const salvarSenha = async () => {
    if (novaSenha.length < 6) {
      avisar('Senha curta', 'A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmaSenha) {
      avisar('Senhas diferentes', 'As duas senhas digitadas não são iguais.');
      return;
    }
    setSalvandoSenha(true);
    try {
      await definirSenha(novaSenha);
      setNovaSenha('');
      setConfirmaSenha('');
      avisar('Senha definida', 'Agora você já pode entrar com seu e-mail e essa senha em outros aparelhos, como no site.');
    } catch (e) {
      avisar('Não foi possível salvar', e instanceof Error ? e.message : 'Tente de novo em alguns instantes.');
    } finally {
      setSalvandoSenha(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
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

      <Text style={styles.secao}>Definir senha</Text>
      <View style={styles.cartaoSenha}>
        <Text style={styles.textoAjudaSenha}>
          Quem entra com Google só consegue usar o app no celular. Defina uma senha aqui pra também poder entrar
          com seu e-mail em outros lugares, como no site.
        </Text>
        <TextInput
          style={styles.input}
          value={novaSenha}
          onChangeText={setNovaSenha}
          placeholder="Nova senha"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
        />
        <TextInput
          style={[styles.input, styles.inputComEspaco]}
          value={confirmaSenha}
          onChangeText={setConfirmaSenha}
          placeholder="Confirmar senha"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
        />
        <Pressable style={styles.botaoSalvarSenha} onPress={salvarSenha} disabled={salvandoSenha}>
          {salvandoSenha ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.botaoSalvarSenhaTexto}>Salvar senha</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.secao}>Criptografia</Text>
      <View style={styles.cartaoSenha}>
        {criptografiaBloqueada ? (
          <>
            <Text style={styles.textoAjudaSenha}>
              Este aparelho ainda não tem a chave dessa conta. Título, descrição e notas ficam ocultos até você
              desbloquear.
            </Text>
            <Pressable style={styles.botaoSalvarSenha} onPress={() => navigation.navigate('DesbloquearCriptografia')}>
              <Text style={styles.botaoSalvarSenhaTexto}>Desbloquear</Text>
            </Pressable>
          </>
        ) : criptografiaConfigurada ? (
          <Text style={styles.textoAjudaSenha}>
            ✓ Ativada — título, descrição e notas são cifrados antes de sair do aparelho.
          </Text>
        ) : (
          <>
            <Text style={styles.textoAjudaSenha}>
              Opcional: cifre título, descrição e notas com uma frase secreta só sua, pra que nem quem administra o
              AVIA consiga ler esse conteúdo.
            </Text>
            <Pressable
              style={styles.botaoSalvarSenha}
              onPress={() => navigation.navigate('ConfigurarCriptografia')}
            >
              <Text style={styles.botaoSalvarSenhaTexto}>Configurar criptografia</Text>
            </Pressable>
          </>
        )}
      </View>

      <Text style={styles.secao}>Sincronização</Text>
      <Pressable style={styles.linhaSync} onPress={sincronizarAgora} disabled={sincronizando}>
        {sincronizando ? (
          <ActivityIndicator color={colors.urgentHoje} />
        ) : (
          <Text style={styles.syncTexto}>🔄 Sincronizar agora</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  cartaoSenha: {
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textoAjudaSenha: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  inputComEspaco: { marginTop: 8 },
  botaoSalvarSenha: {
    marginTop: 12,
    backgroundColor: colors.urgentHoje,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  botaoSalvarSenhaTexto: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
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
  input: {
    fontFamily: fonts.regular,
    fontSize: 15,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
});
