import React, { useState } from 'react';
import {
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
import DateTimePicker from '@react-native-community/datetimepicker';
import { useItems } from '../context/ItemsContext';
import { useCategorias } from '../context/CategoriasContext';
import { SeletorHora } from '../components/SeletorHora';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import {
  PRESETS_LEMBRETE,
  type Categoria,
  type Item,
  type NovoItem,
  type Recorrencia,
  type TipoHorario,
} from '../types/item';
import { avisar, confirmar } from '../utils/confirm';

const TIPOS_HORARIO: { valor: TipoHorario; label: string }[] = [
  { valor: 'nenhum', label: 'Sem horário' },
  { valor: 'compromisso', label: 'Compromisso' },
  { valor: 'prazo', label: 'Prazo' },
  { valor: 'dia_todo', label: 'O dia todo' },
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
  const { categorias } = useCategorias();

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
  const [lembreteOffsetMinutos, setLembreteOffsetMinutos] = useState(base.lembreteOffsetMinutos ?? 0);
  const [status, setStatus] = useState(base.status ?? 'pendente');
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [seletorHoraAberto, setSeletorHoraAberto] = useState<'compromisso' | 'prazo' | null>(null);

  const salvar = async () => {
    if (!titulo.trim()) {
      avisar('Título vazio', 'Escreva um título antes de salvar.');
      return;
    }
    const dataParseada = parse(dataTexto, 'dd/MM/yyyy', new Date());
    if (isNaN(dataParseada.getTime())) {
      avisar('Data inválida', 'Use o formato dd/MM/yyyy.');
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
      lembreteOffsetMinutos,
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
    confirmar('Excluir item', 'Tem certeza que deseja excluir este item?', async () => {
      await removerItem(itemExistente.id);
      navigation.goBack();
    });
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

          <Text style={styles.label}>Data</Text>
          {Platform.OS === 'web' ? (
            <TextInput
              style={styles.input}
              value={dataTexto}
              onChangeText={setDataTexto}
              placeholder="dd/MM/yyyy"
              keyboardType="numbers-and-punctuation"
            />
          ) : (
            <Pressable style={styles.input} onPress={() => setMostrarCalendario(true)}>
              <Text style={styles.inputTexto}>{dataTexto || 'Selecionar data'}</Text>
            </Pressable>
          )}
          {mostrarCalendario && (
            <DateTimePicker
              value={
                dataTexto && !isNaN(parse(dataTexto, 'dd/MM/yyyy', new Date()).getTime())
                  ? parse(dataTexto, 'dd/MM/yyyy', new Date())
                  : new Date()
              }
              mode="date"
              display="calendar"
              onChange={(_evento, dataSelecionada) => {
                setMostrarCalendario(false);
                if (dataSelecionada) setDataTexto(format(dataSelecionada, 'dd/MM/yyyy'));
              }}
            />
          )}

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
              <Text style={styles.label}>Hora do compromisso</Text>
              <Pressable style={styles.input} onPress={() => setSeletorHoraAberto('compromisso')}>
                <Text style={styles.inputTexto}>{horaCompromisso || 'Selecionar horário'}</Text>
              </Pressable>
            </>
          )}
          {tipoHorario === 'prazo' && (
            <>
              <Text style={styles.label}>Hora limite</Text>
              <Pressable style={styles.input} onPress={() => setSeletorHoraAberto('prazo')}>
                <Text style={styles.inputTexto}>{horaLimite || 'Selecionar horário'}</Text>
              </Pressable>
            </>
          )}
          <SeletorHora
            visivel={seletorHoraAberto === 'compromisso'}
            valorAtual={horaCompromisso}
            onSelecionar={setHoraCompromisso}
            onFechar={() => setSeletorHoraAberto(null)}
          />
          <SeletorHora
            visivel={seletorHoraAberto === 'prazo'}
            valorAtual={horaLimite}
            onSelecionar={setHoraLimite}
            onFechar={() => setSeletorHoraAberto(null)}
          />

          <Text style={styles.label}>Categoria</Text>
          <View style={styles.linhaChips}>
            {categorias.map((cat) => (
              <Pressable
                key={cat.id}
                style={[styles.chip, categoria === cat.id && { backgroundColor: cat.cor }]}
                onPress={() => setCategoria(cat.id)}
              >
                <Text style={[styles.chipTexto, categoria === cat.id && styles.chipTextoAtivo]}>
                  {cat.icone} {cat.nome}
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

          <Text style={styles.label}>Lembrar</Text>
          <View style={styles.linhaChips}>
            {PRESETS_LEMBRETE.map((preset) => (
              <Pressable
                key={preset.minutos}
                style={[styles.chip, lembreteOffsetMinutos === preset.minutos && styles.chipAtivo]}
                onPress={() => setLembreteOffsetMinutos(preset.minutos)}
              >
                <Text
                  style={[styles.chipTexto, lembreteOffsetMinutos === preset.minutos && styles.chipTextoAtivo]}
                >
                  {preset.label}
                </Text>
              </Pressable>
            ))}
          </View>

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
  inputTexto: {
    fontFamily: fonts.regular,
    fontSize: 15,
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
