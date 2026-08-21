import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';

interface Props {
  feitos: number;
  total: number;
}

export function ProgressoDoDia({ feitos, total }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const progresso = useRef(new Animated.Value(0)).current;
  const proporcao = total > 0 ? feitos / total : 0;

  useEffect(() => {
    Animated.timing(progresso, {
      toValue: proporcao,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [proporcao]);

  if (total === 0) return null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.linhaTexto}>
        <Text style={styles.texto}>
          {feitos} de {total} feitos hoje
        </Text>
        {feitos === total && <Text style={styles.completo}>Tudo em dia 🎉</Text>}
      </View>
      <View style={styles.trilha}>
        <Animated.View
          style={[
            styles.barra,
            {
              width: progresso.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  linhaTexto: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  texto: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  completo: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.done,
  },
  trilha: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  barra: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.done,
  },
  });
}
