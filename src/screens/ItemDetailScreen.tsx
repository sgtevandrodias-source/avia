import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parse } from 'date-fns';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useItems } from '../context/ItemsContext';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { CATEGORIAS, type Categoria, type Item, type NovoItem, type Recorrencia, type TipoHorario } from '../types/item';

const TIPOS_HORARIO: { valor: TipoHorario; label: string }[] = [
  { valor: 'nenhum', label: 'Sem horário' },
  { valor: 'compromisso', label: 'Compromisso' },
  { valor: 'prazo', label: 'Prazo' },
];

const RECORRENCIAS: { valor: Recorrencia; label: string }[] = [
  { valor: 'nenhuma', label: 'Não repete' },
  { valor: 'semanal', label: 'Semanal' },
  { valor: 'mensal', label: 'Mensal' },
  { valor: 'anual', label: 'Anual' },
];

export function ItemDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { itens, adicionarItem, editarItem, removerItem } = useItems();

  const itemExistente: Item | undefined = route.params?.itemId
    ? itens.find((i) => i.id === route.params.itemId)
    : undefined;
  const rascunho: NovoItem | undefined = route.params?.rascunho;
  const ehNovo = !itemExistente;

  const base = itemExistente ?? {
    ...rascunho,
    id: '',
    status: 'pendente' as const,
    criadoEm: '',
    concluidoEm: null,
  };

  const [titulo, setTitulo] = useState(base.titulo ?? '');
  const [dataTexto, setDataTexto] = useState(
    base.data ? format(parse(base.data, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : '',
  );
  const [tipoHorario, setTipoHorario] = useState<TipoHorario>(base.tipoHorario ?? 'nenhum');
  const [horaCompromisso, setHoraCompromisso] = useState(base.horaCompromisso ?? '');
  const [horaLimite, setHoraLimite] = useState(base.horaLimite ?? '');
  const [categoria, setCategoria] = useState<Categoria>(base.categoria ?? 'outro');
  const [recorrencia, setRecorrencia] = useState<Recorrencia>(base.recorrencia ?? 'nenhuma');
  const [lembreteOffsetDias, setLembreteOffsetDias] = useState(String(base.lembreteOffsetDias ?? 0));
  const [status, setStatus] = useState(base.status ?? 'pendente');

  const salvar = async () => {
    if (!titulo.trim()) {
      Alert.alert('Título vazio', 'Escreva um título antes de salvar.');
      return;
    }
    const dataParseada = parse(dataTexto, 'dd/MM/yyyy', new Date());
    if (isNaN(dataParseada.getTime())) {
      Alert.alert('Data inválida', 'Use o formato dd/MM/yyyy.');
      return;
    }

    const dadosComuns = {
      titulo: titulo.trim(),
      data: format(dataParseada, 'yyyy-MM-dd'),
      tipoHorario,
      horaCompromisso: tipoHorario === 'compromisso' ? horaCompromisso || null : null,
      horaLimite: tipoHorario === 'prazo' ? horaLimite || null : null,
      categoria,
      recorrencia,
      lembreteOffsetDias: parseInt(lembreteOffsetDias, 10) || 0,
    };

    if (ehNovo) {
      await adicionarItem({
        textoOriginal: rascunho?.textoOriginal ?? titulo.trim(),
        ...dadosComuns,
      });
    } else {
      await editarItem({
        ...(itemExistente as Item),
        ...dadosComuns,
        status,
        concluidoEm: status === 'feito' ? (itemExistente!.concluidoEm ?? new Date().toISOString()) : null,
      });
    }
    navigation.goBack();
  };

  const excluir = () => {
    if (!itemExistente) return;
    Alert.alert('Excluir item', 'Tem certeza que deseja excluir este item?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await removerItem(itemExistente.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.label}>Título</Text>
          <TextInput style={styles.input} value={titulo} onChangeText={setTitulo} placeholder="Título" />

          <Text style={styles.label}>Data (dd/MM/yyyy)</Text>
          <TextInput
            style={styles.input}
            value={dataTexto}
            onChangeText={setDataTexto}
            placeholder="dd/MM/yyyy"
            keyboardType="numbers-and-punctuation"
          />

          <Text style={styles.label}>Horário</Text>
          <View style={styles.linhaChips}>
            {TIPOS_HORARIO.map((tipo) => (
              <Pressable
                key={tipo.valor}
                style={[styles.chip, tipoHorario === tipo.valor && styles.chipAtivo]}
                onPress={() => setTipoHorario(tipo.valor)}
              >
                <Text style={[styles.chipTexto, tipoHorario === tipo.valor && styles.chipTextoAtivo]}>
                  {tipo.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {tipoHorario === 'compromisso' && (
            <>
              <Text style={styles.label}>Hora do compromisso (HH:mm)</Text>
              <TextInput
                style={styles.input}
                value={horaCompromisso}
                onChangeText={setHoraCompromisso}
                placeholder="15:00"
              />
            </>
          )}
          {tipoHorario === 'prazo' && (
            <>
              <Text style={styles.label}>Hora limite (HH:mm)</Text>
              <TextInput
                style={styles.input}
                value={horaLimite}
                onChangeText={setHoraLimite}
                placeholder="18:00"
              />
            </>
          )}

          <Text style={styles.label}>Categoria</Text>
          <View style={styles.linhaChips}>
            {CATEGORIAS.map((cat) => (
              <Pressable
                key={cat.valor}
                style={[styles.chip, categoria === cat.valor && { backgroundColor: cat.cor }]}
                onPress={() => setCategoria(cat.valor)}
              >
                <Text style={[styles.chipTexto, categoria === cat.valor && styles.chipTextoAtivo]}>
                  {cat.icone} {cat.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Recorrência</Text>
          <View style={styles.linhaChips}>
            {RECORRENCIAS.map((rec) => (
              <Pressable
                key={rec.valor}
                style={[styles.chip, recorrencia === rec.valor && styles.chipAtivo]}
                onPress={() => setRecorrencia(rec.valor)}
              >
                <Text style={[styles.chipTexto, recorrencia === rec.valor && styles.chipTextoAtivo]}>
                  {rec.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Lembrar quantos dias antes?</Text>
          <TextInput
            style={styles.input}
            value={lembreteOffsetDias}
            onChangeText={setLembreteOffsetDias}
            keyboardType="number-pad"
          />

          {!ehNovo && (
            <Pressable
              style={[styles.chip, status === 'feito' && styles.chipConcluido, styles.chipStatus]}
              onPress={() => setStatus(status === 'feito' ? 'pendente' : 'feito')}
            >
              <Text style={[styles.chipTexto, status === 'feito' && styles.chipTextoAtivo]}>
                {status === 'feito' ? '✓ Concluído' : 'Marcar como feito'}
              </Text>
            </Pressable>
          )}

          <Pressable style={styles.botaoSalvar} onPress={salvar}>
            <Text style={styles.botaoSalvarTexto}>Salvar</Text>
          </Pressable>

          {!ehNovo && (
            <Pressable style={styles.botaoExcluir} onPress={excluir}>
              <Text style={styles.botaoExcluirTexto}>Excluir item</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, paddingBottom: 40 },
  label: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 15,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  linhaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipAtivo: { backgroundColor: colors.urgentHoje, borderColor: colors.urgentHoje },
  chipConcluido: { backgroundColor: colors.done, borderColor: colors.done },
  chipStatus: { marginTop: 20, alignSelf: 'flex-start' },
  chipTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.textPrimary },
  chipTextoAtivo: { color: colors.white },
  botaoSalvar: {
    marginTop: 28,
    backgroundColor: colors.urgentHoje,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botaoSalvarTexto: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  botaoExcluir: { marginTop: 14, alignItems: 'center', paddingVertical: 10 },
  botaoExcluirTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
});
