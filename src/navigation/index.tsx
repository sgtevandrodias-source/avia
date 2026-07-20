import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CapturaRapida } from '../components/CapturaRapida';
import { HojeScreen } from '../screens/HojeScreen';
import { AmanhaScreen } from '../screens/AmanhaScreen';
import { AtrasadosScreen } from '../screens/AtrasadosScreen';
import { CalendarioScreen } from '../screens/CalendarioScreen';
import { HistoricoScreen } from '../screens/HistoricoScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ItemDetailScreen } from '../screens/ItemDetailScreen';
import { useItems } from '../context/ItemsContext';
import { colors, corPorPeriodo, corPorPeriodoSoft } from '../theme/colors';
import { fonts } from '../theme/typography';
import { itensAtrasados } from '../utils/periodos';

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
  { rota: 'Config', label: 'Configurações', icone: '⚙️' },
];

function ConteudoDrawer(props: DrawerContentComponentProps) {
  const { itens } = useItems();
  const quantidadeAtrasados = useMemo(() => itensAtrasados(itens).length, [itens]);
  const rotaAtiva = props.state.routeNames[props.state.index];

  return (
    <DrawerContentScrollView {...props} style={styles.drawer} contentContainerStyle={styles.drawerConteudo}>
      {ITENS_MENU.map((item) => {
        const ativo = item.rota === rotaAtiva;
        return (
          <Pressable
            key={item.rota}
            style={[styles.itemMenu, ativo && styles.itemMenuAtivo]}
            onPress={() => props.navigation.navigate(item.rota)}
          >
            <Text style={styles.itemIcone}>{item.icone}</Text>
            <Text style={[styles.itemLabel, ativo && styles.itemLabelAtivo]}>{item.label}</Text>
            {item.rota === 'Atrasados' && quantidadeAtrasados > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeTexto}>{quantidadeAtrasados}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </DrawerContentScrollView>
  );
}

function DrawerNavigator() {
  return (
    <View style={{ flex: 1 }}>
      {/* Uma única instância pra tudo — antes cada aba de período (Hoje/Amanhã/
          15 dias/Mês) montava a própria CapturaRapida, e cada uma reagia à
          mesma transcrição de voz/texto de forma independente, criando o
          mesmo item várias vezes. */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.surface }}>
        <CapturaRapida />
      </SafeAreaView>
      <Drawer.Navigator
        drawerContent={(props) => <ConteudoDrawer {...props} />}
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
        <Drawer.Screen name="Config" component={SettingsScreen} />
      </Drawer.Navigator>
    </View>
  );
}

export function RootNavigator() {
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
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  drawer: {
    backgroundColor: colors.surface,
  },
  drawerConteudo: {
    paddingTop: 24,
    paddingHorizontal: 12,
  },
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
