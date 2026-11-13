import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTransferencias } from '../context/TransferenciasContext';
import { obterChaveAtual } from '../crypto/chaveAtual';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';
import { avisar } from '../utils/confirm';

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/**
 * Barra do modo de seleção (aparece no lugar do campo de nova tarefa):
 * contador, "Selecionar todas desta seção", "Cancelar" e "Mover para outra
 * conta", que abre a janela de envio.
 */
export function BarraSelecao() {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const { selecionados, selecionarTodas, sairDaSelecao, enviarSelecionadas } = useTransferencias();
  const [janelaAberta, setJanelaAberta] = useState(false);
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const quantidade = selecionados.size;
  const contaCifrada = obterChaveAtual() !== null;
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const abrirJanela = () => {
    setErro(null);
    setJanelaAberta(true);
  };

  const enviar = async () => {
    setEnviando(true);
    setErro(null);
    try {
      const nome = await enviarSelecionadas(email);
      setJanelaAberta(false);
      setEmail('');
      avisar(
        'Transferência enviada',
        `Agora é só ${nome} aceitar. Até lá, as tarefas ficam com você, marcadas como "Aguardando aceite".`,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={styles.barra}>
      <View style={styles.linha}>
        <Text style={styles.contador}>{plural(quantidade, 'selecionada', 'selecionadas')}</Text>
        <Pressable onPress={selecionarTodas} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>Selecionar todas desta seção</Text>
        </Pressable>
      </View>
      <View style={styles.linha}>
        <Pressable style={[styles.botao, styles.botaoSecundario]} onPress={sairDaSelecao} accessibilityRole="button">
          <Text style={styles.botaoSecundarioTexto}>Cancelar</Text>
        </Pressable>
        <Pressable
          style={[styles.botao, styles.botaoPrincipal, quantidade === 0 && styles.desabilitado]}
          onPress={abrirJanela}
          disabled={quantidade === 0}
          accessibilityRole="button"
        >
          <Text style={styles.botaoPrincipalTexto}>Mover para outra conta</Text>
        </Pressable>
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={janelaAberta}
        onRequestClose={() => !enviando && setJanelaAberta(false)}
      >
        <View style={styles.fundo}>
          <View style={styles.caixa}>
            <Text style={styles.janelaTitulo}>Mover para outra conta</Text>
            <TextInput
              style={styles.campo}
              placeholder="E-mail da outra conta"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!enviando}
              autoFocus
            />
            <Text style={styles.resumo}>
              {plural(quantidade, 'tarefa será movida', 'tarefas serão movidas')} para{' '}
              {email.trim() || 'essa conta'}. Depois que a pessoa aceitar, {quantidade === 1 ? 'ela sairá' : 'elas sairão'}{' '}
              da sua conta.
            </Text>
            {contaCifrada && (
              <Text style={styles.aviso}>
                🔓 Sua conta usa criptografia. Para a outra pessoa conseguir ler, o texto dessas tarefas será
                enviado sem criptografia.
              </Text>
            )}
            {erro && <Text style={styles.erro}>{erro}</Text>}
            <View style={styles.linha}>
              <Pressable
                style={[styles.botao, styles.botaoSecundario]}
                onPress={() => setJanelaAberta(false)}
                disabled={enviando}
                accessibilityRole="button"
              >
                <Text style={styles.botaoSecundarioTexto}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.botao, styles.botaoPrincipal, (!emailValido || enviando) && styles.desabilitado]}
                onPress={enviar}
                disabled={!emailValido || enviando}
                accessibilityRole="button"
              >
                {enviando ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.botaoPrincipalTexto}>Enviar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
    barra: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 10,
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    contador: {
      fontFamily: fonts.bold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    link: {
      fontFamily: fonts.medium,
      fontSize: 13,
      color: colors.marca,
    },
    botao: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 46,
    },
    botaoPrincipal: {
      backgroundColor: colors.marca,
    },
    botaoPrincipalTexto: {
      fontFamily: fonts.bold,
      fontSize: 14,
      color: colors.white,
    },
    botaoSecundario: {
      borderWidth: 1,
      borderColor: colors.border,
    },
    botaoSecundarioTexto: {
      fontFamily: fonts.medium,
      fontSize: 14,
      color: colors.textPrimary,
    },
    desabilitado: {
      opacity: 0.45,
    },
    fundo: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      padding: 20,
    },
    caixa: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 18,
      gap: 12,
      maxWidth: 440,
      width: '100%',
      alignSelf: 'center',
    },
    janelaTitulo: {
      fontFamily: fonts.extraBold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    campo: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: fonts.regular,
      fontSize: 15,
      color: colors.textPrimary,
    },
    resumo: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.textSecondary,
    },
    aviso: {
      fontFamily: fonts.medium,
      fontSize: 13,
      color: colors.danger,
    },
    erro: {
      fontFamily: fonts.medium,
      fontSize: 13,
      color: colors.danger,
    },
  });
}
