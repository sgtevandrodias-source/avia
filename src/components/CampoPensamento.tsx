import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { LIMITE_CARACTERES_PENSAMENTO } from '../alivia/tipos';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';
import { avisar } from '../utils/confirm';

interface Props {
  texto: string;
  onChangeTexto: (texto: string) => void;
  onEnviar: () => void;
  editando: boolean;
  onCancelarEdicao: () => void;
  desabilitado?: boolean;
  salvando?: boolean;
}

/**
 * Campo do "Avia que alivia!" (fixo no rodapé da tela, mesmo estilo da
 * CapturaRapida): texto ou voz, até 500 caracteres, com contador. Usa o
 * mesmo reconhecimento de voz do app SEM alterá-lo — e só reage aos eventos
 * de ditado que ELE MESMO iniciou (ditandoAquiRef): os eventos do
 * expo-speech-recognition são globais, e a tela fica montada no Drawer
 * mesmo quando a pessoa volta pras tarefas.
 */
export function CampoPensamento({
  texto,
  onChangeTexto,
  onEnviar,
  editando,
  onCancelarEdicao,
  desabilitado,
  salvando,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const [ouvindo, setOuvindo] = useState(false);
  const ditandoAquiRef = useRef(false);
  const textoAntesDoDitadoRef = useRef('');
  const escalaPulso = useRef(new Animated.Value(1)).current;
  const inputRef = useRef<TextInput>(null);

  // Tocou em "Editar": já abre o teclado no campo, com o texto do registro.
  useEffect(() => {
    if (editando) inputRef.current?.focus();
  }, [editando]);

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

  // Saiu da tela no meio de um ditado: interrompe, pra transcrição não ir
  // parar no campo de tarefas.
  useFocusEffect(
    useCallback(
      () => () => {
        if (ditandoAquiRef.current) {
          ExpoSpeechRecognitionModule.abort();
          ditandoAquiRef.current = false;
          setOuvindo(false);
        }
      },
      [],
    ),
  );

  useSpeechRecognitionEvent('start', () => {
    if (ditandoAquiRef.current) setOuvindo(true);
  });

  useSpeechRecognitionEvent('end', () => {
    if (!ditandoAquiRef.current) return;
    ditandoAquiRef.current = false;
    setOuvindo(false);
  });

  useSpeechRecognitionEvent('result', (evento) => {
    if (!ditandoAquiRef.current) return;
    const transcricao = evento.results[0]?.transcript ?? '';
    const base = textoAntesDoDitadoRef.current;
    const combinado = base ? `${base} ${transcricao}` : transcricao;
    onChangeTexto(combinado.slice(0, LIMITE_CARACTERES_PENSAMENTO));
  });

  useSpeechRecognitionEvent('error', (evento) => {
    if (!ditandoAquiRef.current) return;
    ditandoAquiRef.current = false;
    setOuvindo(false);
    if (evento.error !== 'no-speech' && evento.error !== 'aborted') {
      avisar('Não entendi', 'Não conseguimos reconhecer sua fala. Tente de novo ou digite.');
    }
  });

  const alternarDitado = async () => {
    if (ouvindo) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    try {
      const permissao = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permissao.granted) {
        avisar('Permissão necessária', 'Ative a permissão de microfone pra usar o ditado por voz.');
        return;
      }
      textoAntesDoDitadoRef.current = texto.trim();
      ditandoAquiRef.current = true;
      ExpoSpeechRecognitionModule.start({ lang: 'pt-BR', interimResults: true });
    } catch {
      ditandoAquiRef.current = false;
      avisar('Ditado indisponível', 'Seu navegador não tem suporte a ditado por voz. Digite normalmente.');
    }
  };

  const quantidade = texto.length;
  const noLimite = quantidade >= LIMITE_CARACTERES_PENSAMENTO;
  const podeEnviar = texto.trim().length > 0 && !salvando && !desabilitado;

  if (desabilitado) {
    return (
      <View style={styles.bloqueado}>
        <Text style={styles.bloqueadoTexto}>
          🔒 Desbloqueie a criptografia em Configurações pra escrever aqui — assim seus registros continuam protegidos.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {editando && (
        <View style={styles.faixaEdicao}>
          <Text style={styles.faixaEdicaoTexto}>✏️ Editando registro</Text>
          <Pressable onPress={onCancelarEdicao} hitSlop={8} accessibilityRole="button">
            <Text style={styles.faixaEdicaoCancelar}>Cancelar</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.wrapper}>
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={ouvindo ? 'Ouvindo...' : 'Como você está? Escreva ou fale o que está pensando...'}
            placeholderTextColor={colors.textMuted}
            value={texto}
            onChangeText={onChangeTexto}
            maxLength={LIMITE_CARACTERES_PENSAMENTO}
            editable={!ouvindo}
            multiline
            textAlignVertical="top"
          />
          <Text
            style={[styles.contador, noLimite && styles.contadorLimite]}
            accessibilityLabel={`${quantidade} de ${LIMITE_CARACTERES_PENSAMENTO} caracteres`}
          >
            {quantidade}/{LIMITE_CARACTERES_PENSAMENTO}
          </Text>
        </View>
        <Pressable
          onPress={alternarDitado}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={ouvindo ? 'Parar ditado' : 'Ditar por voz'}
        >
          <Animated.View style={[styles.botaoRedondo, { transform: [{ scale: escalaPulso }] }]}>
            <Ionicons name="mic" size={22} color={colors.white} />
          </Animated.View>
        </Pressable>
        <Pressable
          onPress={onEnviar}
          disabled={!podeEnviar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={editando ? 'Salvar alteração' : 'Registrar'}
        >
          <View style={[styles.botaoRedondo, styles.botaoEnviar, !podeEnviar && styles.botaoDesabilitado]}>
            <Ionicons name={editando ? 'checkmark' : 'send'} size={20} color={colors.white} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
    wrapper: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    inputContainer: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 4,
    },
    input: {
      fontFamily: fonts.regular,
      fontSize: 15,
      minHeight: 40,
      maxHeight: 120,
      color: colors.textPrimary,
      padding: 0,
    },
    contador: {
      alignSelf: 'flex-end',
      fontFamily: fonts.medium,
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    contadorLimite: {
      color: colors.danger,
    },
    botaoRedondo: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.marca,
      alignItems: 'center',
      justifyContent: 'center',
    },
    botaoEnviar: {
      backgroundColor: colors.done,
    },
    botaoDesabilitado: {
      opacity: 0.4,
    },
    faixaEdicao: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.prioritySoft,
    },
    faixaEdicaoTexto: {
      fontFamily: fonts.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    faixaEdicaoCancelar: {
      fontFamily: fonts.bold,
      fontSize: 13,
      color: colors.marca,
    },
    bloqueado: {
      padding: 16,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    bloqueadoTexto: {
      fontFamily: fonts.regular,
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
