import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useItems } from '../context/ItemsContext';
import { useCategorias } from '../context/CategoriasContext';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';
import type { CategoriaItem } from '../types/item';
import { avisar, confirmar } from '../utils/confirm';

const PALETA_CORES = [
  '#B084F5',
  '#4C9AFF',
  '#F5A623',
  '#2BB3A3',
  '#7A8CA3',
  '#E85D9C',
  '#9AA3AF',
  '#FF8B94',
  '#6FCF97',
  '#56CCF2',
];

interface EditorEstado {
  categoria: CategoriaItem | null; // null = criando uma nova
}

export function CategoriasScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const { categorias, adicionarCategoria, editarCategoria, removerCategoria } = useCategorias();
  const { itens, editarItem } = useItems();
  const [editor, setEditor] = useState<EditorEstado | null>(null);
  const [nome, setNome] = useState('');
  const [icone, setIcone] = useState('');
  const [cor, setCor] = useState(PALETA_CORES[0]);

  const abrirEdicao = (categoria: CategoriaItem | null) => {
    setNome(categoria?.nome ?? '');
    setIcone(categoria?.icone ?? '🏷️');
    setCor(categoria?.cor ?? PALETA_CORES[0]);
    setEditor({ categoria });
  };

  const salvarEditor = async () => {
    if (!nome.trim()) {
      avisar('Nome vazio', 'Dê um nome pra categoria antes de salvar.');
      return;
    }
    if (editor?.categoria) {
      await editarCategoria({ ...editor.categoria, nome: nome.trim(), icone: icone.trim() || '🏷️', cor });
    } else {
      await adicionarCategoria({ nome: nome.trim(), icone: icone.trim() || '🏷️', cor, sistema: false });
    }
    setEditor(null);
  };

  const excluirCategoria = (categoria: CategoriaItem) => {
    confirmar(
      'Excluir categoria',
      `Os itens em "${categoria.nome}" vão passar para "Outro". Continuar?`,
      async () => {
        const afetados = itens.filter((i) => i.categoria === categoria.id);
        for (const item of afetados) {
          await editarItem({ ...item, categoria: 'outro' });
        }
        await removerCategoria(categoria.id);
        setEditor(null);
      },
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.linhaSecaoComBotao}>
        <Text style={styles.secaoSemPadding}>Categorias</Text>
      </View>
      <FlatList
        data={categorias}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => (
          <Pressable style={styles.linha} onPress={() => abrirEdicao(item)}>
            <View style={[styles.bolinha, { backgroundColor: item.cor }]} />
            <Text style={styles.icone}>{item.icone}</Text>
            <Text style={styles.nome}>{item.nome}</Text>
            {item.sistema && <Text style={styles.tagSistema}>padrão</Text>}
          </Pressable>
        )}
      />

      <Modal visible={!!editor} transparent animationType="fade" onRequestClose={() => setEditor(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitulo}>
              {editor?.categoria ? 'Editar categoria' : 'Nova categoria'}
            </Text>

            <Text style={styles.label}>Nome</Text>
            <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Nome da categoria" />

            <Text style={styles.label}>Ícone (emoji)</Text>
            <TextInput style={styles.input} value={icone} onChangeText={setIcone} placeholder="🏷️" />

            <Text style={styles.label}>Cor</Text>
            <View style={styles.linhaCores}>
              {PALETA_CORES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCor(c)}
                  style={[styles.swatch, { backgroundColor: c }, cor === c && styles.swatchAtivo]}
                />
              ))}
            </View>

            <Pressable style={styles.botaoSalvar} onPress={salvarEditor}>
              <Text style={styles.botaoSalvarTexto}>Salvar</Text>
            </Pressable>

            {editor?.categoria && !editor.categoria.sistema && (
              <Pressable style={styles.botaoExcluir} onPress={() => excluirCategoria(editor.categoria!)}>
                <Text style={styles.botaoExcluirTexto}>Excluir categoria</Text>
              </Pressable>
            )}

            <Pressable style={styles.botaoCancelar} onPress={() => setEditor(null)}>
              <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  linhaSecaoComBotao: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  secaoSemPadding: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  linkNova: { fontFamily: fonts.medium, fontSize: 13, color: colors.urgentHoje },
  lista: { paddingHorizontal: 16 },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bolinha: { width: 10, height: 10, borderRadius: 5 },
  icone: { fontSize: 16 },
  nome: { fontFamily: fonts.medium, fontSize: 14, color: colors.textPrimary, flex: 1 },
  tagSistema: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
  },
  modalTitulo: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 15,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  linhaCores: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  swatchAtivo: { borderColor: colors.textPrimary },
  botaoSalvar: {
    marginTop: 20,
    backgroundColor: colors.urgentHoje,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botaoSalvarTexto: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  botaoExcluir: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  botaoExcluirTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
  botaoCancelar: { marginTop: 4, alignItems: 'center', paddingVertical: 8 },
  botaoCancelarTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  });
}
