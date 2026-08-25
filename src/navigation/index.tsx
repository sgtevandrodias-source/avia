import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CapturaRapida } from '../components/CapturaRapida';
import { TopBar } from '../components/TopBar';
import { HojeScreen } from '../screens/HojeScreen';
import { AmanhaScreen } from '../screens/AmanhaScreen';
import { AtrasadosScreen } from '../screens/AtrasadosScreen';
import { CalendarioScreen } from '../screens/CalendarioScreen';
import { HistoricoScreen } from '../screens/HistoricoScreen';
import { CategoriasScreen } from '../screens/CategoriasScreen';
import { ItensDaCategoriaScreen } from '../screens/ItensDaCategoriaScreen';
import { CompartilhadosScreen } from '../screens/CompartilhadosScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ItemDetailScreen } from '../screens/ItemDetailScreen';
import { ConfigurarCriptografiaScreen } from '../screens/ConfigurarCriptografiaScreen';
import { DesbloquearCriptografiaScreen } from '../screens/DesbloquearCriptografiaScreen';
import { ContasScreen } from '../screens/ContasScreen';
import { AdicionarContaScreen } from '../screens/AdicionarContaScreen';
import { ExcluirContaScreen } from '../screens/ExcluirContaScreen';
import { CriptografiaAvisos } from '../components/CriptografiaAvisos';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../auth/AuthContext';
import { useItems } from '../context/ItemsContext';
import { useCompartilhamentos } from '../context/CompartilhamentosContext';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta, PeriodoKey } from '../theme/paletas';
import { fonts } from '../theme/typography';
import { itensAtrasados } from '../utils/periodos';

// Configuração do TopBar por rota do Drawer — usada pra renderizar UM único
// TopBar compartilhado (ver DrawerNavigator abaixo), já que ele agora
// precisa ficar ACIMA da CapturaRapida em toda tela (melhoria de UI pedida),
// e não mais dentro de cada tela individualmente. As cores de "hoje"/"amanhã"
// dependem do tema ativo — por isso essa config vira uma função chamada
// dentro do componente (useTheme() só pode ser lido lá), não mais um objeto
// fixo no escopo do módulo.
function configTopBar(corPorPeriodo: Record<PeriodoKey, string>): Record<string, { titulo: string; saudacao?: boolean; cor?: string }> {
  return {
    Hoje: { titulo: 'Hoje', saudacao: true, cor: corPorPeriodo.hoje },
    Amanha: { titulo: 'Amanhã', cor: corPorPeriodo.amanha },
    Calendario: { titulo: 'Calendário' },
    Atrasados: { titulo: 'Atrasados' },
    Historico: { titulo: 'Feitos' },
    Categorias: { titulo: 'Categorias' },
    Compartilhados: { titulo: 'Compartilhados' },
    Config: { titulo: 'Configurações' },
  };
}

const Drawer = createDrawerNavigator();
const Stack = createNativeStackNavigator();

// Ordem exata pedida pro menu (item 4 do round de UI/UX). "15 dias" e "Mês"
// ficam sem entrada aqui — as telas continuam no código, só perderam o
// atalho direto de navegação.
const ITENS_MENU: { rota: string; label: string; icone: string }[] = [
  { rota: 'Hoje', label: 'Hoje', icone: '🔥' },
  { rota: 'Amanha', label: 'Amanhã', icone: '➡️' },
  { rota: 'Calendario', label: 'Calendário', icone: '📅' },
  { rota: 'Atrasados', label: 'Atrasados', icone: '⏰' },
  { rota: 'Historico', label: 'Feitos', icone: '✅' },
  { rota: 'Categorias', label: 'Categorias', icone: '🏷️' },
  { rota: 'Compartilhados', label: 'Compartilhados', icone: '👥' },
  { rota: 'Config', label: 'Configurações', icone: '⚙️' },
];

function ConteudoDrawer(props: DrawerContentComponentProps) {
  const { colors, corPorPeriodo, corPorPeriodoSoft } = useTheme();
  const styles = useMemo(
    () => criarEstilos(colors, corPorPeriodo, corPorPeriodoSoft),
    [colors, corPorPeriodo, corPorPeriodoSoft],
  );
  const { usuario } = useAuth();
  const { itens } = useItems();
  const { recebidos } = useCompartilhamentos();
  const quantidadeAtrasados = useMemo(() => itensAtrasados(itens).length, [itens]);
  const quantidadeConvitesPendentes = useMemo(
    () => recebidos.filter((c) => c.status === 'pendente').length,
    [recebidos],
  );
  const rotaAtiva = props.state.routeNames[props.state.index];

  return (
    <DrawerContentScrollView {...props} style={styles.drawer} contentContainerStyle={styles.drawerConteudo}>
      {usuario && (
        // Ponto mais visível/frequente pra saber com que e-mail está logado
        // (o Drawer é aberto o tempo todo) — tocar abre a tela de contas,
        // ponto de entrada natural pra trocar ou adicionar outra conta.
        <Pressable style={styles.contaAtiva} onPress={() => props.navigation.navigate('Contas')}>
          <Avatar nome={usuario.nome} email={usuario.email} fotoUrl={usuario.fotoUrl} tamanho={40} />
          <View style={styles.contaAtivaInfo}>
            <Text style={styles.contaAtivaNome} numberOfLines={1}>
              {usuario.nome}
            </Text>
            <Text style={styles.contaAtivaEmail} numberOfLines={1}>
              {usuario.email}
            </Text>
          </View>
        </Pressable>
      )}
      {ITENS_MENU.map((item) => {
        const ativo = item.rota === rotaAtiva;
        const quantidadeBadge =
          item.rota === 'Atrasados'
            ? quantidadeAtrasados
            : item.rota === 'Compartilhados'
              ? quantidadeConvitesPendentes
              : 0;
        return (
          <Pressable
            key={item.rota}
            style={[styles.itemMenu, ativo && styles.itemMenuAtivo]}
            onPress={() => props.navigation.navigate(item.rota)}
          >
            <Text style={styles.itemIcone}>{item.icone}</Text>
            <Text style={[styles.itemLabel, ativo && styles.itemLabelAtivo]}>{item.label}</Text>
            {quantidadeBadge > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeTexto}>{quantidadeBadge}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </DrawerContentScrollView>
  );
}

function DrawerNavigator() {
  const { colors, corPorPeriodo } = useTheme();
  // Rota ativa do Drawer, pra saber qual título/saudação o TopBar
  // compartilhado abaixo deve mostrar — ver screenListeners no
  // Drawer.Navigator. Começa em "Hoje" (rota inicial do drawer).
  const [rotaAtiva, setRotaAtiva] = useState('Hoje');
  const configuracoesTopBar = useMemo(() => configTopBar(corPorPeriodo), [corPorPeriodo]);
  const configTopo = configuracoesTopBar[rotaAtiva] ?? configuracoesTopBar.Hoje;

  return (
    <View style={{ flex: 1 }}>
      {/* TopBar (☰ + título/saudação + busca) e CapturaRapida ficam ACIMA do
          Drawer.Navigator, uma única instância pra cada, compartilhada por
          toda tela — nunca dentro de uma tela individual. Pra CapturaRapida
          isso já era assim (antes cada aba de período montava a própria,
          cada uma reagindo à mesma transcrição de voz/texto de forma
          independente e criando o mesmo item várias vezes); o TopBar passou
          a seguir o mesmo padrão pra poder ficar ordenado ACIMA da
          CapturaRapida (melhoria de UI pedida), o que não seria possível
          renderizando-o dentro de cada tela (elas vêm depois da
          CapturaRapida na árvore). Como o TopBar agora está fora da árvore
          do Drawer, o botão de menu não usa useNavigation().openDrawer()
          (não teria acesso ao navegador do Drawer) — usa abrirDrawer(), que
          alcança o Drawer de fora via o ref do NavigationContainer (ver
          navigationRef.ts). */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.surface }}>
        <TopBar titulo={configTopo.titulo} saudacao={configTopo.saudacao} cor={configTopo.cor} />
        <CriptografiaAvisos />
        <CapturaRapida />
      </SafeAreaView>
      <Drawer.Navigator
        drawerContent={(props) => <ConteudoDrawer {...props} />}
        screenListeners={{
          state: (e: any) => {
            const state = e.data.state;
            const rota = state?.routes?.[state.index]?.name;
            if (rota) setRotaAtiva(rota);
          },
        }}
        screenOptions={{
          headerShown: false,
          drawerType: 'front',
          overlayColor: 'rgba(0,0,0,0.4)',
          swipeEnabled: true,
        }}
      >
        <Drawer.Screen name="Hoje" component={HojeScreen} />
        <Drawer.Screen name="Amanha" component={AmanhaScreen} />
        <Drawer.Screen name="Calendario" component={CalendarioScreen} />
        <Drawer.Screen name="Atrasados" component={AtrasadosScreen} />
        <Drawer.Screen name="Historico" component={HistoricoScreen} />
        <Drawer.Screen name="Categorias" component={CategoriasScreen} />
        <Drawer.Screen name="Compartilhados" component={CompartilhadosScreen} />
        <Drawer.Screen name="Config" component={SettingsScreen} />
      </Drawer.Navigator>
    </View>
  );
}

export function RootNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={DrawerNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="DetalheItem"
        component={ItemDetailScreen}
        options={{
          title: 'Detalhe',
          presentation: 'modal',
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { fontFamily: fonts.bold },
        }}
      />
      <Stack.Screen
        name="ConfigurarCriptografia"
        component={ConfigurarCriptografiaScreen}
        options={{
          title: 'Criptografia',
          presentation: 'modal',
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { fontFamily: fonts.bold },
        }}
      />
      <Stack.Screen
        name="DesbloquearCriptografia"
        component={DesbloquearCriptografiaScreen}
        options={{
          title: 'Desbloquear',
          presentation: 'modal',
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { fontFamily: fonts.bold },
        }}
      />
      <Stack.Screen
        name="Contas"
        component={ContasScreen}
        options={{
          title: 'Contas',
          presentation: 'modal',
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { fontFamily: fonts.bold },
        }}
      />
      <Stack.Screen
        name="AdicionarConta"
        component={AdicionarContaScreen}
        options={{
          title: 'Adicionar conta',
          presentation: 'modal',
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { fontFamily: fonts.bold },
        }}
      />
      <Stack.Screen
        name="ExcluirConta"
        component={ExcluirContaScreen}
        options={{
          title: 'Excluir conta',
          presentation: 'modal',
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { fontFamily: fonts.bold },
        }}
      />
      <Stack.Screen
        name="ItensDaCategoria"
        component={ItensDaCategoriaScreen}
        options={({ route }: any) => ({
          title: route.params?.categoriaNome ?? 'Categoria',
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { fontFamily: fonts.bold },
        })}
      />
    </Stack.Navigator>
  );
}

function criarEstilos(
  colors: Paleta,
  corPorPeriodo: Record<PeriodoKey, string>,
  corPorPeriodoSoft: Record<PeriodoKey, string>,
) {
  return StyleSheet.create({
  drawer: {
    backgroundColor: colors.surface,
  },
  drawerConteudo: {
    paddingTop: 24,
    paddingHorizontal: 12,
  },
  contaAtiva: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 18,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contaAtivaInfo: { flex: 1 },
  contaAtivaNome: { fontFamily: fonts.bold, fontSize: 15, color: colors.textPrimary },
  contaAtivaEmail: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  itemMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  itemMenuAtivo: {
    backgroundColor: corPorPeriodoSoft.hoje,
  },
  itemIcone: {
    fontSize: 20,
  },
  itemLabel: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  itemLabelAtivo: {
    fontFamily: fonts.bold,
    color: corPorPeriodo.hoje,
  },
  badge: {
    backgroundColor: colors.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeTexto: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.white,
  },
  });
}
