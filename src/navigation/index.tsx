import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CapturaRapida } from '../components/CapturaRapida';
import { HojeScreen } from '../screens/HojeScreen';
import { AmanhaScreen } from '../screens/AmanhaScreen';
import { QuinzenaScreen } from '../screens/QuinzenaScreen';
import { MesScreen } from '../screens/MesScreen';
import { AtrasadosScreen } from '../screens/AtrasadosScreen';
import { CalendarioScreen } from '../screens/CalendarioScreen';
import { HistoricoScreen } from '../screens/HistoricoScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ItemDetailScreen } from '../screens/ItemDetailScreen';
import { useItems } from '../context/ItemsContext';
import { colors, corPorPeriodo } from '../theme/colors';
import { fonts } from '../theme/typography';
import { itensAtrasados } from '../utils/periodos';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const ICONES_ABA: Record<string, string> = {
  Hoje: '🔥',
  Amanha: '➡️',
  Quinzena: '🗓️',
  Mes: '📆',
  Atrasados: '⏰',
  Calendario: '📅',
  Historico: '✅',
  Config: '⚙️',
};

function Tabs() {
  const { itens } = useItems();
  const quantidadeAtrasados = useMemo(() => itensAtrasados(itens).length, [itens]);

  return (
    <View style={{ flex: 1 }}>
      {/* Uma única instância pra tudo — antes cada aba de período (Hoje/Amanhã/
          15 dias/Mês) montava a própria CapturaRapida, e cada uma reagia à
          mesma transcrição de voz/texto de forma independente, criando o
          mesmo item várias vezes. */}
      <CapturaRapida />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: corPorPeriodo.hoje,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
          tabBarBadgeStyle: { backgroundColor: colors.danger },
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>{ICONES_ABA[route.name]}</Text>,
        })}
      >
        <Tab.Screen name="Hoje" component={HojeScreen} />
        <Tab.Screen name="Amanha" component={AmanhaScreen} options={{ title: 'Amanhã' }} />
        <Tab.Screen name="Quinzena" component={QuinzenaScreen} options={{ title: '15 dias' }} />
        <Tab.Screen name="Mes" component={MesScreen} options={{ title: 'Mês' }} />
        <Tab.Screen
          name="Atrasados"
          component={AtrasadosScreen}
          options={{ title: 'Atrasados', tabBarBadge: quantidadeAtrasados > 0 ? quantidadeAtrasados : undefined }}
        />
        <Tab.Screen name="Calendario" component={CalendarioScreen} options={{ title: 'Calendário' }} />
        <Tab.Screen name="Historico" component={HistoricoScreen} options={{ title: 'Feitos' }} />
        <Tab.Screen name="Config" component={SettingsScreen} options={{ title: 'Config' }} />
      </Tab.Navigator>
    </View>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
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
