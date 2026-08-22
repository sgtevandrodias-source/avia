import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { useItems } from '../context/ItemsContext';
import { obterStatusSincronizacao, type StatusSincronizacao } from '../sync/sync';
import { useTheme, type PreferenciaTema } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';
import { avisar, confirmar } from '../utils/confirm';

const CHAVE_PIX = 'ee48f134-99b4-4232-ac32-9a1b14f474a0';
const EMAIL_CONTATO = 'edsideasfactory@gmail.com';

const OPCOES_TEMA: { valor: PreferenciaTema; label: string }[] = [
  { valor: 'claro', label: 'Claro' },
  { valor: 'escuro', label: 'Escuro' },
  { valor: 'sistema', label: 'Automático' },
];

export function SettingsScreen() {
  const { colors, preferencia, definirPreferencia } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const navigation = useNavigation<any>();
  const { sincronizando, sincronizarAgora } = useItems();
  const { usuario, contas, logout, definirSenha, criptografiaConfigurada, criptografiaBloqueada } = useAuth();
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [statusSync, setStatusSync] = useState<StatusSincronizacao | null>(null);

  const atualizarStatusSync = useCallback(() => {
    obterStatusSincronizacao().then(setStatusSync);
  }, []);

  // Lê o status já salvo ao abrir a tela, e de novo assim que "sincronizando"
  // volta pra false (ou seja, um ciclo de sincronizarAgora() acabou de
  // terminar, disparado por essa tela ou por qualquer outro lugar do app).
  useEffect(() => {
    atualizarStatusSync();
  }, [atualizarStatusSync, sincronizando]);

  const outrasContasSalvas = contas.length > 1;

  const copiarChavePix = async () => {
    await Clipboard.setStringAsync(CHAVE_PIX);
    setPixCopiado(true);
    setTimeout(() => setPixCopiado(false), 2000);
  };

  const confirmarLogout = () => {
    confirmar(
      outrasContasSalvas ? 'Sair desta conta' : 'Sair',
      outrasContasSalvas
        ? 'Vai remover essa conta deste aparelho — as outras salvas continuam disponíveis. Continuar?'
        : 'Tem certeza que deseja sair da sua conta?',
      () => logout(),
    );
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
      <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.secao}>Conta</Text>
      <View style={styles.linhaConta}>
        <View style={styles.linhaContaComAvatar}>
          {usuario && (
            <Avatar nome={usuario.nome} email={usuario.email} fotoUrl={usuario.fotoUrl} tamanho={44} />
          )}
          <View>
            <Text style={styles.contaNome}>{usuario?.nome}</Text>
            <Text style={styles.contaEmail}>{usuario?.email}</Text>
          </View>
        </View>
        <Pressable onPress={confirmarLogout}>
          <Text style={styles.linkSair}>{outrasContasSalvas ? 'Sair desta conta' : 'Sair'}</Text>
        </Pressable>
      </View>
      <Pressable style={styles.linkTrocarConta} onPress={() => navigation.navigate('Contas')}>
        <Text style={styles.linkTrocarContaTexto}>Trocar ou adicionar conta neste aparelho</Text>
      </Pressable>

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
      {!sincronizando && statusSync && (
        <Text style={[styles.textoStatusSync, !statusSync.ok && styles.textoStatusSyncErro]}>
          {statusSync.ok
            ? `Sincronizado há ${formatDistanceToNow(new Date(statusSync.quando), { locale: ptBR })}`
            : 'Não foi possível sincronizar — tentaremos de novo em breve'}
        </Text>
      )}

      <Text style={styles.secao}>Aparência</Text>
      <View style={styles.linhaTema}>
        {OPCOES_TEMA.map((opcao) => {
          const ativo = preferencia === opcao.valor;
          return (
            <Pressable
              key={opcao.valor}
              style={[styles.botaoTema, ativo && styles.botaoTemaAtivo]}
              onPress={() => definirPreferencia(opcao.valor)}
            >
              <Text style={[styles.botaoTemaTexto, ativo && styles.botaoTemaTextoAtivo]}>{opcao.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.secao}>Sobre</Text>
      <View style={styles.cartaoSenha}>
        <Text style={styles.textoSobre}>
          &quot;Avia&quot; é gíria nordestina pra &quot;resolve logo, dá um jeito&quot; — e é exatamente essa a
          proposta do app: parar de espalhar compromisso em três lugares (papel, agenda do Google, memória) e ter
          um único lugar que te diz, sem enrolação, o que precisa da sua atenção agora.
        </Text>
        <Text style={styles.textoSobre}>
          Funciona assim: você fala ou digita rápido o que precisa fazer — &quot;reunião amanhã às 15h&quot;,
          &quot;pagar o boleto até sexta&quot; — e o Avia entende sozinho a data, o horário e a categoria. Ele
          separa o urgente do que pode esperar, avisa antes de você esquecer (não depois), e deixa claro o que já
          passou da hora. Quando alguém mais também precisa saber de um compromisso, dá pra compartilhar na hora,
          sem duplicar anotação nem depender de mensagem que se perde na conversa.
        </Text>
        <Text style={styles.textoSobre}>
          Nasceu de um problema bem real: eu vivia perdido entre papel, agenda do Google e memória, tentando dar
          conta do trabalho e da casa ao mesmo tempo, sem confiar de verdade em nenhum desses lugares. Cansei
          disso e construí o app que eu mesmo precisava — daí o nome: &quot;Avia, Evandro! Resolve isso!&quot;
        </Text>
        <Text style={[styles.textoSobre, styles.textoSobreApoio]}>
          O Avia é gratuito e vai continuar sendo. Se ele te ajudou a organizar a vida, um Pix de qualquer valor
          ajuda a manter o projeto no ar — mas é só se fizer sentido pra você. E se tiver ideia ou encontrar algo
          que não funciona bem, me manda um feedback, é o que mais me ajuda a melhorar o app.
        </Text>

        <Pressable style={styles.linhaPix} onPress={copiarChavePix}>
          <View style={styles.linhaPixInfo}>
            <Text style={styles.labelPix}>Chave Pix</Text>
            <Text style={styles.valorPix}>{CHAVE_PIX}</Text>
          </View>
          <Text style={styles.linkCopiarPix}>{pixCopiado ? 'Copiado!' : 'Copiar'}</Text>
        </Pressable>
        <Text style={styles.textoContato}>Feedback: {EMAIL_CONTATO}</Text>

        <Text style={styles.textoVersao}>Versão {Constants.expoConfig?.version ?? '—'}</Text>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 40 },
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
  linhaContaComAvatar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  contaNome: { fontFamily: fonts.bold, fontSize: 14, color: colors.textPrimary },
  contaEmail: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  linkSair: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
  linkTrocarConta: { marginHorizontal: 16, marginTop: 8, paddingVertical: 4 },
  linkTrocarContaTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.urgentHoje },
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
  textoStatusSync: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 16,
  },
  textoStatusSyncErro: {
    color: colors.danger,
  },
  textoVersao: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 12,
  },
  textoSobre: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: 10,
  },
  textoSobreApoio: {
    marginTop: 4,
  },
  linhaPix: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  linhaPixInfo: { flex: 1 },
  labelPix: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  valorPix: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: 2,
  },
  linkCopiarPix: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.urgentHoje,
    marginLeft: 12,
  },
  textoContato: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 10,
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
  linhaTema: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
  },
  botaoTema: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  botaoTemaAtivo: {
    backgroundColor: colors.urgentHoje,
    borderColor: colors.urgentHoje,
  },
  botaoTemaTexto: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  botaoTemaTextoAtivo: {
    fontFamily: fonts.bold,
    color: colors.white,
  },
  });
}
