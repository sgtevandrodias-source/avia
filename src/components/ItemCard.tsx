import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { CheckboxConcluir } from './CheckboxConcluir';
import { useCategorias } from '../context/CategoriasContext';
import { useItems } from '../context/ItemsContext';
import { useCompartilhamentos } from '../context/CompartilhamentosContext';
import { useTransferencias } from '../context/TransferenciasContext';
import { campoOuBloqueado } from '../crypto/itemCriptografia';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';
import { dataHoraLimiteDoItem } from '../utils/periodos';
import { avisar, confirmar } from '../utils/confirm';
import { categoriaInfo, type Item } from '../types/item';

// Cor fixa (não muda entre tema claro/escuro, igual as cores de urgência)
// do NOME da categoria na lista de tarefas — só as 4 categorias fixas do
// sistema têm uma cor de identidade própria aqui; qualquer outra (custom
// do usuário, ou o sentinela de item compartilhado) cai no cinza padrão.
const COR_NOME_CATEGORIA: Record<string, string> = {
  trabalho: '#4C9AFF',
  pessoal: '#2ECC71',
  aniversario: '#B084F5',
  outro: '#FFC107',
};

interface Props {
  item: Item;
  corPendente: string;
  onToggle: () => void;
  onPress: () => void;
}

export function ItemCard({ item, corPendente, onToggle, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const { removerItem } = useItems();
  const { alternarConclusaoCompartilhado, removerCompartilhamento } = useCompartilhamentos();
  const {
    modoSelecao,
    selecionados,
    alternarSelecao,
    podeSelecionar,
    abrirMenu,
    transferenciaPendenteDoItem,
    cancelarTransferencia,
  } = useTransferencias();
  const titulo = campoOuBloqueado(item.titulo) ?? item.titulo;
  // Item vindo de um compartilhamento aceito (ver utils/compartilhamentos.ts)
  // — só quem criou o item de verdade pode editar/excluir/priorizar; aqui só
  // dá pra marcar como feito (do seu lado) ou remover da própria agenda.
  const somenteLeitura = item.somenteLeitura === true;
  // Tarefa que eu mandei pra outra conta e ainda espera aceite: fica
  // bloqueada (sem editar, concluir ou apagar) pra não dar conflito.
  const transferencia = somenteLeitura ? undefined : transferenciaPendenteDoItem(item.id);
  const selecionavel = podeSelecionar(item);
  const selecionado = modoSelecao && selecionados.has(item.id);

  // Segurar o dedo: abre o menu (prioridade ou selecionar para mover).
  const abrirMenuDaTarefa = () => {
    if (somenteLeitura || modoSelecao || transferencia) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    abrirMenu(item);
  };

  const avisarBloqueada = () => {
    if (!transferencia) return;
    confirmar(
      'Aguardando aceite',
      `Esta tarefa está esperando ${transferencia.paraNome} aceitar. Quer cancelar a transferência? (Vale para todas as tarefas desse envio.)`,
      () => {
        cancelarTransferencia(transferencia.id).catch((e) =>
          avisar('Transferência', e instanceof Error ? e.message : 'Não foi possível cancelar.'),
        );
      },
    );
  };

  const tocar = () => {
    if (modoSelecao) {
      if (selecionavel) alternarSelecao(item.id);
      return;
    }
    if (transferencia) {
      avisarBloqueada();
      return;
    }
    onPress();
  };

  const alternarConcluido = () => {
    if (modoSelecao) {
      if (selecionavel) alternarSelecao(item.id);
      return;
    }
    if (transferencia) {
      avisarBloqueada();
      return;
    }
    if (somenteLeitura) {
      alternarConclusaoCompartilhado(item.compartilhamentoId!);
    } else {
      onToggle();
    }
  };

  const excluir = () => {
    if (transferencia) {
      avisarBloqueada();
      return;
    }
    if (somenteLeitura) {
      confirmar(
        'Remover da minha agenda',
        `Isso não afeta o compromisso de ${item.compartilhadoPorNome}. Remover mesmo assim?`,
        () => removerCompartilhamento(item.compartilhamentoId!),
      );
      return;
    }
    confirmar('Excluir item', `Tem certeza que deseja excluir "${titulo}"?`, () => {
      removerItem(item.id);
    });
  };

  const concluido = item.status === 'feito';
  const opacidadeTexto = useRef(new Animated.Value(concluido ? 0.45 : 1)).current;

  useEffect(() => {
    Animated.timing(opacidadeTexto, {
      toValue: concluido ? 0.45 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [concluido]);

  const { categorias } = useCategorias();
  // Item compartilhado nunca tem uma categoria de verdade em
  // CategoriasContext (quem criou pode nem ter essa categoria cadastrada) —
  // usa o nome/ícone/cor do próprio snapshot em vez de categoriaInfo.
  const categoria = somenteLeitura
    ? {
        icone: item.categoriaIconeCompartilhado ?? '🔗',
        nome: item.categoriaNomeCompartilhado ?? '',
        cor: item.categoriaCorCompartilhado ?? colors.border,
      }
    : categoriaInfo(categorias, item.categoria);
  const dataFormatada = format(parseISO(item.data), 'dd/MM');
  const atrasado = item.status === 'pendente' && dataHoraLimiteDoItem(item) < new Date();
  const indicadorHorario =
    item.tipoHorario === 'compromisso'
      ? `🕒 ${item.horaCompromisso}`
      : item.tipoHorario === 'prazo'
        ? `até ${item.horaLimite}`
        : item.tipoHorario === 'dia_todo'
          ? 'Dia todo'
          : null;

  return (
    <Pressable
      onPress={tocar}
      onLongPress={somenteLeitura ? undefined : abrirMenuDaTarefa}
      style={[
        styles.card,
        item.prioridade && styles.cardPrioridade,
        atrasado && styles.cardAtrasado,
        modoSelecao && !selecionavel && styles.cardIndisponivel,
        selecionado && styles.cardSelecionado,
      ]}
      accessibilityState={modoSelecao ? { selected: selecionado, disabled: !selecionavel } : undefined}
    >
      {modoSelecao ? (
        <View
          style={[styles.marcaSelecao, selecionado && styles.marcaSelecaoAtiva, !selecionavel && styles.marcaIndisponivel]}
        >
          {selecionado && <Ionicons name="checkmark" size={16} color={colors.white} />}
        </View>
      ) : (
        <CheckboxConcluir concluido={concluido} corPendente={corPendente} onToggle={alternarConcluido} />
      )}
      <Animated.View style={[styles.textos, { opacity: opacidadeTexto }]}>
        <Text
          style={[styles.titulo, concluido && styles.tituloConcluido]}
          numberOfLines={2}
        >
          {item.prioridade ? '⭐ ' : ''}
          {titulo}
        </Text>
        <View style={styles.linhaMeta}>
          <Text
            style={[
              styles.categoria,
              COR_NOME_CATEGORIA[item.categoria] && {
                fontFamily: fonts.bold,
                color: COR_NOME_CATEGORIA[item.categoria],
              },
            ]}
          >
            {categoria.icone} {categoria.nome}
          </Text>
          <Text style={[styles.horario, atrasado && styles.horarioAtrasado]}>{dataFormatada}</Text>
          {indicadorHorario && (
            <Text style={[styles.horario, atrasado && styles.horarioAtrasado]}>{indicadorHorario}</Text>
          )}
          {atrasado && <Text style={styles.avisoAtrasado}>⚠️ Atrasado</Text>}
          {somenteLeitura && <Text style={styles.seloCompartilhado}>👥 de {item.compartilhadoPorNome}</Text>}
          {transferencia && (
            <Text style={styles.seloTransferencia}>⏳ Aguardando aceite de {transferencia.paraNome}</Text>
          )}
        </View>
      </Animated.View>
      {!modoSelecao && (
      <Pressable
        onPress={excluir}
        hitSlop={8}
        style={styles.botaoExcluir}
        accessibilityRole="button"
        accessibilityLabel={somenteLeitura ? 'Remover da minha agenda' : 'Excluir item'}
      >
        <Ionicons name={somenteLeitura ? 'exit-outline' : 'trash-outline'} size={20} color={colors.textMuted} />
      </Pressable>
      )}
    </Pressable>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPrioridade: {
    borderColor: colors.priority,
    backgroundColor: colors.prioritySoft,
  },
  // Aplicado depois de cardPrioridade no array de estilos: um item pode ser
  // prioritário E estar atrasado ao mesmo tempo — a borda de atraso "ganha"
  // (fica por cima), mas o fundo de prioridade continua.
  cardAtrasado: {
    borderColor: colors.danger,
  },
  textos: {
    flex: 1,
  },
  botaoExcluir: {
    padding: 6,
    alignSelf: 'flex-start',
  },
  titulo: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  tituloConcluido: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  linhaMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 10,
  },
  categoria: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  horario: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  horarioAtrasado: {
    color: colors.danger,
  },
  avisoAtrasado: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.danger,
  },
  seloCompartilhado: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  seloTransferencia: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.marca,
  },
  cardSelecionado: {
    borderColor: colors.marca,
    borderWidth: 2,
  },
  cardIndisponivel: {
    opacity: 0.45,
  },
  marcaSelecao: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.marca,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcaSelecaoAtiva: {
    backgroundColor: colors.marca,
  },
  marcaIndisponivel: {
    borderColor: colors.border,
  },
  });
}
