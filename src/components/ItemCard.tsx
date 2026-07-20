import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { CheckboxConcluir } from './CheckboxConcluir';
import { useCategorias } from '../context/CategoriasContext';
import { useItems } from '../context/ItemsContext';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { categoriaInfo, type Item } from '../types/item';

interface Props {
  item: Item;
  corPendente: string;
  onToggle: () => void;
  onPress: () => void;
}

export function ItemCard({ item, corPendente, onToggle, onPress }: Props) {
  const { alternarPrioridade } = useItems();

  const marcarPrioridade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    alternarPrioridade(item.id);
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
  const categoria = categoriaInfo(categorias, item.categoria);
  const dataFormatada = format(parseISO(item.data), 'dd/MM');
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
      onPress={onPress}
      onLongPress={marcarPrioridade}
      style={[styles.card, item.prioridade && styles.cardPrioridade]}
    >
      <CheckboxConcluir concluido={concluido} corPendente={corPendente} onToggle={onToggle} />
      <Animated.View style={[styles.textos, { opacity: opacidadeTexto }]}>
        <Text
          style={[styles.titulo, concluido && styles.tituloConcluido]}
          numberOfLines={2}
        >
          {item.prioridade ? '⭐ ' : ''}
          {item.titulo}
        </Text>
        <View style={styles.linhaMeta}>
          <Text style={styles.categoria}>
            {categoria.icone} {categoria.nome}
          </Text>
          <Text style={styles.horario}>{dataFormatada}</Text>
          {indicadorHorario && <Text style={styles.horario}>{indicadorHorario}</Text>}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  textos: {
    flex: 1,
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
});
