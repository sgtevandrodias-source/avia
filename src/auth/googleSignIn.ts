import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

// Client ID tipo "Aplicativo da Web" do Google Cloud Console — usado pra
// pedir um idToken cuja audiencia o backend já sabe validar (GOOGLE_CLIENT_ID
// no Worker). NÃO é o Client ID Android (esse fica só registrado no Google
// Cloud Console, vinculado ao package + SHA-1 do keystore do EAS).
const GOOGLE_WEB_CLIENT_ID = '338993673589-m2tkn6u9sgahq0lndqr1q3j3ncnavs4f.apps.googleusercontent.com';

let configurado = false;

export function googleDisponivel(): boolean {
  return true;
}

/** Retorna o idToken do Google, ou null se o usuário cancelou o login. */
export async function loginComGoogleNativo(): Promise<string | null> {
  if (!configurado) {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    configurado = true;
  }
  await GoogleSignin.hasPlayServices();
  const resposta = await GoogleSignin.signIn();
  if (isSuccessResponse(resposta)) {
    return resposta.data.idToken;
  }
  return null;
}
