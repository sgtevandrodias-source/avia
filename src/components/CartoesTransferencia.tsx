import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import { useTransferencias } from '../context/TransferenciasContext';
import type { TransferenciaEnviada, TransferenciaRecebida } from '../transferencias/api';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';
import { avisar, confirmar } from '../utils/confirm';

const MAX_TITULOS_VISIVEIS = 5;

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

function dataCurta(data: string): string {
  try {
    return format(parseISO(data), 'dd/MM');
  } catch {
    return data;
  }
}

/** Topo da tela Hoje: pedidos de transferência recebidos e respostas às que eu enviei. */
export function CartoesTransferencia() {
  const { recebidas, avisos } = useTransferencias();
  if (recebidas.length === 0 && avisos.length === 0) return null;
  return (
    <View style={{ marginBottom: 4 }}>
      {recebidas.map((t) => (
        <CartaoRecebida key={t.id} transferencia={t} />
      ))}
      {avisos.map((t) => (
        <CartaoAviso key={t.id} transferencia={t} />
      ))}
    </View>
  );
}

function CartaoRecebida({ transferencia }: { transferencia: TransferenciaRecebida }) {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const { responderRecebida } = useTransferencias();
  const [respondendo, setRespondendo] = useState(false);
  const n = transferencia.itens.length;
  const visiveis = transferencia.itens.slice(0, MAX_TITULOS_VISIVEIS);

  const responder = async (aceitar: boolean) => {
    setRespondendo(true);
    try {
      const movidas = await responderRecebida(transferencia.id, aceitar);
      if (aceitar) {
        avisar('Tarefas recebidas', `${plural(movidas ?? n, 'tarefa agora é sua', 'tarefas agora são suas')}.`);
      }
    } catch (e) {
      avisar('Transferência', e instanceof Error ? e.message : 'Não foi possível responder. Tente de novo.');
    } finally {
      setRespondendo(false);
    }
  };

  return (
    <View style={styles.cartao}>
      <Text style={styles.titulo}>
        📦 {transferencia.deNome} quer te enviar {plural(n, 'tarefa', 'tarefas')}
      </Text>
      {visiveis.map((i) => (
        <Text key={i.id} style={styles.linhaTarefa} numberOfLines={1}>
          • {dataCurta(i.data)}
          {i.horaCompromisso ? ` ${i.horaCompromisso}` : ''} — {i.titulo}
        </Text>
      ))}
      {n > visiveis.length && <Text style={styles.mais}>e mais {n - visiveis.length}…</Text>}
      <Text style={styles.explicacao}>Se aceitar, elas passam a ser suas e você pode editar tudo.</Text>
      <View style={styles.botoes}>
        <Pressable
          style={[styles.botao, styles.botaoSecundario]}
          disabled={respondendo}
          accessibilityRole="button"
          onPress={() =>
            confirmar('Recusar tarefas', `As tarefas continuam com ${transferencia.deNome}. Recusar?`, () =>
              responder(false),
            )
          }
        >
          <Text style={styles.botaoSecundarioTexto}>Recusar</Text>
        </Pressable>
        <Pressable
          style={[styles.botao, styles.botaoPrincipal]}
          disabled={respondendo}
          accessibilityRole="button"
          onPress={() => responder(true)}
        >
          {respondendo ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.botaoPrincipalTexto}>Aceitar</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function CartaoAviso({ transferencia }: { transferencia: TransferenciaEnviada }) {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const { dispensarAviso } = useTransferencias();
  const n = transferencia.itemIds.length;
  const texto =
    transferencia.status === 'aceita'
      ? `✅ ${transferencia.paraNome} aceitou ${plural(transferencia.quantidadeMovida, 'tarefa sua', 'tarefas suas')}.`
      : transferencia.status === 'recusada'
        ? `↩️ ${transferencia.paraNome} recusou ${plural(n, 'a tarefa', 'as tarefas')} que você enviou. Elas continuam com você.`
        : `⌛ A transferência para ${transferencia.paraNome} venceu sem resposta. As tarefas continuam com você.`;

  return (
    <View style={[styles.cartao, styles.cartaoAviso]}>
      <Text style={styles.avisoTexto}>{texto}</Text>
      <Pressable onPress={() => dispensarAviso(transferencia.id)} hitSlop={8} accessibilityRole="button">
        <Text style={styles.link}>OK</Text>
      </Pressable>
    </View>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
    cartao: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.marca,
      padding: 14,
      marginBottom: 10,
      gap: 4,
    },
    cartaoAviso: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderColor: colors.border,
    },
    titulo: {
      fontFamily: fonts.bold,
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    linhaTarefa: {
      fontFamily: fonts.regular,
      fontSize: 13,
      color: colors.textSecondary,
    },
    mais: {
      fontFamily: fonts.medium,
      fontSize: 13,
      color: colors.textMuted,
    },
    explicacao: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 6,
    },
    botoes: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 10,
    },
    botao: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    botaoPrincipal: { backgroundColor: colors.marca },
    botaoPrincipalTexto: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
    botaoSecundario: { borderWidth: 1, borderColor: colors.border },
    botaoSecundarioTexto: { fontFamily: fonts.medium, fontSize: 14, color: colors.textPrimary },
    avisoTexto: {
      flex: 1,
      fontFamily: fonts.medium,
      fontSize: 14,
      color: colors.textPrimary,
    },
    link: {
      fontFamily: fonts.bold,
      fontSize: 14,
      color: colors.marca,
    },
  });
}
