import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useItems } from '../context/ItemsContext';
import { useTransferencias } from '../context/TransferenciasContext';
import { campoOuBloqueado } from '../crypto/itemCriptografia';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';

/**
 * Menu de "segurar o dedo" numa tarefa: antes o gesto marcava prioridade
 * direto; agora abre este menu, com a prioridade como primeira opção (o
 * atalho continua a um toque) e a seleção pra mover para outra conta.
 */
export function MenuTarefa() {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const { alternarPrioridade } = useItems();
  const { itemDoMenu, fecharMenu, iniciarSelecao } = useTransferencias();

  if (!itemDoMenu) return null;
  const item = itemDoMenu;
  const titulo = campoOuBloqueado(item.titulo) ?? item.titulo;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={fecharMenu}>
      <Pressable style={styles.fundo} onPress={fecharMenu} accessibilityLabel="Fechar menu">
        <Pressable style={styles.caixa} onPress={() => {}}>
          <Text style={styles.titulo} numberOfLines={2}>
            {titulo}
          </Text>
          <Pressable
            style={styles.opcao}
            accessibilityRole="button"
            onPress={() => {
              fecharMenu();
              alternarPrioridade(item.id);
            }}
          >
            <Text style={styles.opcaoTexto}>{item.prioridade ? '☆ Tirar prioridade' : '⭐ Marcar como prioridade'}</Text>
          </Pressable>
          <Pressable
            style={styles.opcao}
            accessibilityRole="button"
            onPress={() => {
              fecharMenu();
              iniciarSelecao(item.id);
            }}
          >
            <Text style={styles.opcaoTexto}>☑️ Selecionar para mover</Text>
          </Pressable>
          <Pressable style={[styles.opcao, styles.opcaoCancelar]} accessibilityRole="button" onPress={fecharMenu}>
            <Text style={[styles.opcaoTexto, styles.cancelarTexto]}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
    fundo: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      padding: 24,
    },
    caixa: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingVertical: 8,
      maxWidth: 420,
      width: '100%',
      alignSelf: 'center',
    },
    titulo: {
      fontFamily: fonts.bold,
      fontSize: 15,
      color: colors.textPrimary,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 8,
    },
    opcao: {
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    opcaoCancelar: {
      alignItems: 'center',
    },
    opcaoTexto: {
      fontFamily: fonts.medium,
      fontSize: 15,
      color: colors.textPrimary,
    },
    cancelarTexto: {
      color: colors.textMuted,
    },
  });
}
