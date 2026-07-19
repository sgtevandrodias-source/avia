import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';

interface Props {
  concluido: boolean;
  corPendente: string;
  onToggle: () => void;
}

export function CheckboxConcluir({ concluido, corPendente, onToggle }: Props) {
  const escala = useRef(new Animated.Value(concluido ? 1 : 0)).current;
  const escalaAnel = useRef(new Animated.Value(0)).current;
  const opacidadeAnel = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (concluido) {
      Animated.sequence([
        Animated.parallel([
          Animated.spring(escala, { toValue: 1, useNativeDriver: true, friction: 4, tension: 160 }),
          Animated.timing(opacidadeAnel, { toValue: 1, duration: 80, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(escalaAnel, { toValue: 1.9, duration: 260, useNativeDriver: true }),
          Animated.timing(opacidadeAnel, { toValue: 0, duration: 260, useNativeDriver: true }),
        ]),
      ]).start(() => {
        escalaAnel.setValue(0);
      });
    } else {
      Animated.timing(escala, { toValue: 0, duration: 120, useNativeDriver: true }).start();
    }
  }, [concluido]);

  const lidarComToque = () => {
    Haptics.notificationAsync(
      concluido ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
    );
    onToggle();
  };

  return (
    <Pressable onPress={lidarComToque} hitSlop={12} style={styles.wrapper}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.anel,
          {
            opacity: opacidadeAnel,
            transform: [{ scale: escalaAnel }],
          },
        ]}
      />
      <View style={[styles.caixa, { borderColor: concluido ? colors.done : corPendente }]}>
        <Animated.View
          style={[
            styles.preenchimento,
            {
              backgroundColor: colors.done,
              opacity: escala,
              transform: [{ scale: escala }],
            },
          ]}
        >
          <View style={styles.check} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const TAMANHO = 26;

const styles = StyleSheet.create({
  wrapper: {
    width: TAMANHO,
    height: TAMANHO,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caixa: {
    width: TAMANHO,
    height: TAMANHO,
    borderRadius: TAMANHO / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  preenchimento: {
    width: TAMANHO,
    height: TAMANHO,
    borderRadius: TAMANHO / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: 10,
    height: 6,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.white,
    transform: [{ rotate: '-45deg' }, { translateY: -1 }],
  },
  anel: {
    position: 'absolute',
    width: TAMANHO,
    height: TAMANHO,
    borderRadius: TAMANHO / 2,
    borderWidth: 2,
    borderColor: colors.done,
  },
});
