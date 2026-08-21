import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as db from '../db/database';
import { useAuth } from '../auth/AuthContext';
import { useItems } from '../context/ItemsContext';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';
import { avisar } from '../utils/confirm';

const TAMANHO_MINIMO_SENHA = 8;

type Passo = 'senha' | 'recuperacao' | 'concluido';

export function ConfigurarCriptografiaScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const navigation = useNavigation<any>();
  const { configurarCriptografia } = useAuth();
  const { sincronizarAgora } = useItems();

  const [passo, setPasso] = useState<Passo>('senha');
  const [fraseSenha, setFraseSenha] = useState('');
  const [confirmaFraseSenha, setConfirmaFraseSenha] = useState('');
  const [processando, setProcessando] = useState(false);
  const [codigoRecuperacao, setCodigoRecuperacao] = useState('');
  const [confirmouQueSalvou, setConfirmouQueSalvou] = useState(false);
  const [migrando, setMigrando] = useState(false);

  const continuarComSenha = async () => {
    if (fraseSenha.length < TAMANHO_MINIMO_SENHA) {
      avisar('Frase curta', `Use pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
      return;
    }
    if (fraseSenha !== confirmaFraseSenha) {
      avisar('Não bateu', 'As duas frases digitadas são diferentes.');
      return;
    }
    setProcessando(true);
    try {
      const codigo = await configurarCriptografia(fraseSenha);
      setCodigoRecuperacao(codigo);
      setPasso('recuperacao');
    } catch (e) {
      avisar('Não foi possível configurar', e instanceof Error ? e.message : 'Tente de novo em alguns instantes.');
    } finally {
      setProcessando(false);
    }
  };

  const continuarComRecuperacao = async () => {
    setPasso('concluido');
    setMigrando(true);
    try {
      // Sincroniza ANTES de tocar em qualquer coisa: precisa ter certeza que
      // o que está local reflete o que o servidor tem de mais atual (algo
      // pode ter sido excluído/editado em outro aparelho e ainda não ter
      // chegado aqui). Sem esse passo, "tocar" e reenviar um item que na
      // verdade já foi excluído em outro lugar recriaria esse item — LWW só
      // protege contra dado antigo se o dado local já estiver em dia.
      await sincronizarAgora();

      // Recifra e reenvia o que já existia em texto puro antes desta
      // configuração — a partir de agora os hooks em sync.ts/database.web.ts
      // já cifram tudo automaticamente, mas o que já estava sincronizado
      // precisa desse empurrão pra ser reenviado cifrado (ver
      // db.tocarTodosItens em src/db/database.ts).
      if (Platform.OS === 'web') {
        const itensAtuais = await db.listarItens();
        for (const item of itensAtuais) {
          await db.atualizarItem(item);
        }
      } else {
        await db.tocarTodosItens();
      }
      await sincronizarAgora();
    } catch {
      // Sem rede agora: não é grave, a próxima sincronização automática
      // (a cada 20s, ver ItemsContext) tenta de novo.
    } finally {
      setMigrando(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {passo === 'senha' && (
          <>
            <Text style={styles.titulo}>Proteger seus dados</Text>
            <Text style={styles.texto}>
              Crie uma frase secreta pra cifrar o título, a descrição e as notas dos seus itens. Ela é diferente da
              sua senha de login e nunca é enviada pro servidor — a partir de agora, nem quem administra o AVIA
              consegue ler esse conteúdo.
            </Text>
            <Text style={[styles.texto, styles.aviso]}>
              Se você esquecer essa frase, só o código de recuperação da próxima tela vai poder recuperar o acesso.
              Guarde os dois com cuidado.
            </Text>

            <Text style={styles.label}>Frase secreta</Text>
            <TextInput
              style={styles.input}
              value={fraseSenha}
              onChangeText={setFraseSenha}
              placeholder="Frase secreta"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
            <Text style={[styles.label, styles.labelComEspaco]}>Confirmar frase secreta</Text>
            <TextInput
              style={styles.input}
              value={confirmaFraseSenha}
              onChangeText={setConfirmaFraseSenha}
              placeholder="Confirmar frase secreta"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />

            <Pressable style={styles.botaoPrimario} onPress={continuarComSenha} disabled={processando}>
              {processando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.botaoPrimarioTexto}>Continuar</Text>}
            </Pressable>
            <Pressable style={styles.botaoCancelar} onPress={() => navigation.goBack()} disabled={processando}>
              <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
            </Pressable>
          </>
        )}

        {passo === 'recuperacao' && (
          <>
            <Text style={styles.titulo}>Seu código de recuperação</Text>
            <Text style={styles.texto}>
              Guarde esse código em um lugar seguro (um gerenciador de senhas, por exemplo). Ele é a única forma de
              recuperar seus dados se você esquecer a frase secreta — nem nós conseguimos recuperar sem ele.
            </Text>
            <View style={styles.caixaCodigo}>
              <Text style={styles.codigo} selectable>
                {codigoRecuperacao}
              </Text>
            </View>
            <Text style={styles.dica}>Toque e segure o código pra copiar.</Text>

            <Pressable
              style={styles.linhaConfirmacao}
              onPress={() => setConfirmouQueSalvou((valor) => !valor)}
            >
              <Text style={styles.caixaSelecao}>{confirmouQueSalvou ? '☑' : '☐'}</Text>
              <Text style={styles.textoConfirmacao}>Eu salvei esse código em um lugar seguro</Text>
            </Pressable>

            <Pressable
              style={[styles.botaoPrimario, !confirmouQueSalvou && styles.botaoDesabilitado]}
              onPress={continuarComRecuperacao}
              disabled={!confirmouQueSalvou}
            >
              <Text style={styles.botaoPrimarioTexto}>Continuar</Text>
            </Pressable>
          </>
        )}

        {passo === 'concluido' && (
          <>
            <Text style={styles.titulo}>{migrando ? 'Protegendo seus itens…' : 'Tudo pronto!'}</Text>
            <Text style={styles.texto}>
              {migrando
                ? 'Recriptografando os itens que você já tinha. Isso pode levar alguns segundos.'
                : 'Seus itens agora são cifrados antes de sair do aparelho. Novos itens já saem protegidos automaticamente.'}
            </Text>
            {migrando ? (
              <ActivityIndicator color={colors.urgentHoje} style={styles.spinner} />
            ) : (
              <Pressable style={styles.botaoPrimario} onPress={() => navigation.goBack()}>
                <Text style={styles.botaoPrimarioTexto}>Concluir</Text>
              </Pressable>
            )}
          </>
        )}
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
  aviso: { marginTop: 12, color: colors.danger },
  label: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 20,
    marginBottom: 6,
  },
  labelComEspaco: { marginTop: 14 },
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
  botaoDesabilitado: { opacity: 0.5 },
  botaoPrimarioTexto: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  botaoCancelar: { marginTop: 14, alignItems: 'center', paddingVertical: 10 },
  botaoCancelarTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  caixaCodigo: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  codigo: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 1,
  },
  dica: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  linhaConfirmacao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
  },
  caixaSelecao: { fontSize: 20, color: colors.textPrimary },
  textoConfirmacao: { fontFamily: fonts.regular, fontSize: 14, color: colors.textPrimary, flex: 1 },
  spinner: { marginTop: 24 },
  });
}
