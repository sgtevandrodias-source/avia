import React, { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { RootNavigator } from './src/navigation';
import { navigationRef, navegarPara } from './src/navigation/navigationRef';
import { ItemsProvider } from './src/context/ItemsContext';
import { CategoriasProvider } from './src/context/CategoriasContext';
import { CompartilhamentosProvider } from './src/context/CompartilhamentosContext';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { useAviaFonts } from './src/theme/typography';
import { configurarCanalAndroid, solicitarPermissaoNotificacoes } from './src/notifications/notifications';
import { sincronizar } from './src/sync/sync';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Conteudo() {
  const { usuario, carregando } = useAuth();

  if (carregando) return null;

  return (
    <NavigationContainer ref={navigationRef}>
      {usuario ? (
        <CategoriasProvider>
          <CompartilhamentosProvider>
            <ItemsProvider>
              <RootNavigator />
            </ItemsProvider>
          </CompartilhamentosProvider>
        </CategoriasProvider>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}

export default function App() {
  const [fontesCarregadas] = useAviaFonts();

  useEffect(() => {
    configurarCanalAndroid();
    solicitarPermissaoNotificacoes().catch(() => {});
  }, []);

  // Tocou numa notificação push de compartilhamento (ver worker/src/index.ts,
  // enviarPushCompartilhamento): sincroniza na hora em vez de esperar o poll
  // de 20s (ver INTERVALO_POLLING_MS em ItemsContext) e já leva pra
  // Compartilhados — resolve tanto o aviso quanto a demora percebida.
  useEffect(() => {
    const assinatura = Notifications.addNotificationResponseReceivedListener((resposta) => {
      const dados = resposta.notification.request.content.data;
      if (dados?.tipo === 'compartilhamento') {
        sincronizar().finally(() => navegarPara('Compartilhados'));
      }
    });
    return () => assinatura.remove();
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
        <AuthProvider>
          <Conteudo />
        </AuthProvider>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
