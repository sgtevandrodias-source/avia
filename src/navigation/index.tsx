import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HojeScreen } from '../screens/HojeScreen';
import { AmanhaScreen } from '../screens/AmanhaScreen';
import { QuinzenaScreen } from '../screens/QuinzenaScreen';
import { MesScreen } from '../screens/MesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ItemDetailScreen } from '../screens/ItemDetailScreen';
import { colors, corPorPeriodo } from '../theme/colors';
import { fonts } from '../theme/typography';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const ICONES_ABA: Record<string, string> = {
  Hoje: '🔥',
  Amanha: '➡️',
  Quinzena: '🗓️',
  Mes: '📆',
  Config: '⚙️',
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: corPorPeriodo.hoje,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarIcon: () => <Text style={{ fontSize: 18 }}>{ICONES_ABA[route.name]}</Text>,
      })}
    >
      <Tab.Screen name="Hoje" component={HojeScreen} />
      <Tab.Screen name="Amanha" component={AmanhaScreen} options={{ title: 'Amanhã' }} />
      <Tab.Screen name="Quinzena" component={QuinzenaScreen} options={{ title: '15 dias' }} />
      <Tab.Screen name="Mes" component={MesScreen} options={{ title: 'Mês' }} />
      <Tab.Screen name="Config" component={SettingsScreen} options={{ title: 'Config' }} />
    </Tab.Navigator>
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
