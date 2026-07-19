import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { parseItem, type ResultadoParse } from '../parser/parseItem';
import { useItems } from '../context/ItemsContext';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { categoriaInfo } from '../types/item';
import { avisar } from '../utils/confirm';

export function CapturaRapida() {
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<ResultadoParse | null>(null);
  const [ouvindo, setOuvindo] = useState(false);
  const transcricaoRef = useRef('');
  const escalaPulso = useRef(new Animated.Value(1)).current;
  const { adicionarItem } = useItems();
  const navigation = useNavigation<any>();

  useEffect(() => {
    if (!ouvindo) {
      escalaPulso.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(escalaPulso, { toValue: 1.3, duration: 450, useNativeDriver: true }),
        Animated.timing(escalaPulso, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ouvindo]);

  useSpeechRecognitionEvent('start', () => setOuvindo(true));

  useSpeechRecognitionEvent('end', () => {
    setOuvindo(false);
    const transcricaoFinal = transcricaoRef.current.trim();
    if (transcricaoFinal) {
      setResultado(parseItem(transcricaoFinal));
    }
  });

  useSpeechRecognitionEvent('result', (evento) => {
    const transcricao = evento.results[0]?.transcript ?? '';
    transcricaoRef.current = transcricao;
    setTexto(transcricao);
  });

  useSpeechRecognitionEvent('error', (evento) => {
    setOuvindo(false);
    if (evento.error !== 'no-speech' && evento.error !== 'aborted') {
      avisar('Não entendi', 'Não conseguimos reconhecer sua fala. Tente de novo ou digite.');
    }
  });

  const lidarComSubmit = () => {
    if (!texto.trim()) return;
    setResultado(parseItem(texto));
  };

  const alternarDitado = async () => {
    if (ouvindo) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const permissao = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permissao.granted) {
      avisar('Permissão necessária', 'Ative a permissão de microfone pra usar o ditado por voz.');
      return;
    }
    transcricaoRef.current = '';
    setTexto('');
    try {
      ExpoSpeechRecognitionModule.start({ lang: 'pt-BR', interimResults: true });
    } catch {
      avisar('Ditado indisponível', 'Não foi possível iniciar o reconhecimento de fala agora.');
    }
  };

  const confirmar = async () => {
    if (!resultado) return;
    await adicionarItem(resultado.item);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTexto('');
    setResultado(null);
  };

  const editarManualmente = () => {
    if (!resultado) return;
    setTexto('');
    setResultado(null);
    navigation.navigate('DetalheItem', { rascunho: resultado.item });
  };

  const cancelar = () => {
    setResultado(null);
  };

  if (resultado) {
    const categoria = categoriaInfo(resultado.item.categoria);
    const dataFormatada = format(parseISO(resultado.item.data), "dd/MM/yyyy");
    const horario =
      resultado.item.tipoHorario === 'compromisso'
        ? `às ${resultado.item.horaCompromisso}`
        : resultado.item.tipoHorario === 'prazo'
          ? `até ${resultado.item.horaLimite}`
          : null;

    return (
      <View style={styles.previewCard}>
        <Text style={styles.previewTitulo}>{resultado.item.titulo}</Text>
        <View style={styles.chips}>
          <View style={styles.chip}>
            <Text style={styles.chipTexto}>📅 {dataFormatada}</Text>
          </View>
          {horario && (
            <View style={styles.chip}>
              <Text style={styles.chipTexto}>🕒 {horario}</Text>
            </View>
          )}
          <View style={[styles.chip, { backgroundColor: categoria.cor + '22' }]}>
            <Text style={styles.chipTexto}>
              {categoria.icone} {categoria.label}
            </Text>
          </View>
        </View>
        <View style={styles.acoes}>
          <Pressable style={styles.botaoSecundario} onPress={cancelar}>
            <Text style={styles.botaoSecundarioTexto}>Cancelar</Text>
          </Pressable>
          <Pressable style={styles.botaoSecundario} onPress={editarManualmente}>
            <Text style={styles.botaoSecundarioTexto}>Corrigir</Text>
          </Pressable>
          <Pressable style={styles.botaoPrimario} onPress={confirmar}>
            <Text style={styles.botaoPrimarioTexto}>Confirmar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <TextInput
        style={styles.input}
        placeholder={ouvindo ? 'Ouvindo...' : 'Adicionar algo... ex: reunião amanhã às 15h'}
        placeholderTextColor={colors.textMuted}
        value={texto}
        onChangeText={setTexto}
        onSubmitEditing={lidarComSubmit}
        returnKeyType="done"
        editable={!ouvindo}
      />
      <Pressable onPress={alternarDitado} hitSlop={8}>
        <Animated.View
          style={[
            styles.botaoMic,
            ouvindo && styles.botaoMicAtivo,
            { transform: [{ scale: escalaPulso }] },
          ]}
        >
          <Text style={styles.botaoMicTexto}>🎤</Text>
        </Animated.View>
      </Pressable>
      <Pressable style={styles.botaoAdicionar} onPress={lidarComSubmit}>
        <Text style={styles.botaoAdicionarTexto}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
  },
  botaoMic: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  botaoMicAtivo: {
    backgroundColor: colors.urgentHoje,
    borderColor: colors.urgentHoje,
  },
  botaoMicTexto: { fontSize: 18 },
  botaoAdicionar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.urgentHoje,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoAdicionarTexto: {
    color: colors.white,
    fontSize: 22,
    fontFamily: fonts.bold,
    lineHeight: 24,
  },
  previewCard: {
    margin: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.urgentHoje,
  },
  previewTitulo: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipTexto: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textPrimary,
  },
  acoes: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  botaoSecundario: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  botaoSecundarioTexto: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  botaoPrimario: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.done,
    alignItems: 'center',
  },
  botaoPrimarioTexto: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
  },
});
