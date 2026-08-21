import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { obterTokenAtual } from '../auth/sessionToken';
import { API_URL } from '../sync/config';
import { solicitarPermissaoNotificacoes } from './notifications';

/**
 * Registra o Expo Push Token deste aparelho no backend, associado à conta
 * logada — é o que permite o Worker mandar notificação push de verdade (ex.:
 * "fulano compartilhou X com você", ver worker/src/index.ts) mesmo com o app
 * fechado. Nunca lança: sem permissão, sem projectId configurado, ou com o
 * Worker fora do ar, é só um registro que fica pendente pra próxima chamada
 * (mesmo espírito de sincronizar() em src/sync/sync.ts).
 */
export async function registrarTokenPush(): Promise<void> {
  try {
    const permitido = await solicitarPermissaoNotificacoes();
    if (!permitido) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await fetch(`${API_URL}/usuario/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${obterTokenAtual()}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    // best-effort — não bloqueia login nem mostra erro pro usuário.
  }
}
