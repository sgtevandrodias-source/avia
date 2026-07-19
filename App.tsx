import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { RootNavigator } from './src/navigation';
import { ItemsProvider } from './src/context/ItemsContext';
import { useAviaFonts } from './src/theme/typography';
import { configurarCanalAndroid, solicitarPermissaoNotificacoes } from './src/notifications/notifications';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontesCarregadas] = useAviaFonts();

  useEffect(() => {
    configurarCanalAndroid();
    solicitarPermissaoNotificacoes().catch(() => {});
  }, []);

  useEffect(() => {
    if (fontesCarregadas) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontesCarregadas]);

  if (!fontesCarregadas) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ItemsProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
          <StatusBar style="dark" />
        </ItemsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
