import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { fonts } from '../theme/typography';

// Splash "de verdade" mostrado em JS, por cima do resto do app — o splash
// NATIVO (ver plugin expo-splash-screen em app.json) só existe pelo tempo
// mínimo inevitável até o JS montar (não dá pra animar nele). Nesse meio
// tempo ele usa android-icon-foreground.png (mesmo asset do ícone
// adaptativo, já com margem de segurança) em vez do logo largo original —
// esse tinha a arte quase colada na borda do quadro, e o recorte
// circular/arredondado que o Android 12+ aplica sobre o ícone do splash
// (mesmo raciocínio de ícone adaptativo) cortava as pontas (ex.: o final
// das linhas de movimento), causando o corte no canto relatado num
// aparelho específico. Esse componente é quem realmente marca a abertura
// do app: logo entra com movimento (desliza e cresce), a frase aparece em
// seguida, segura um instante e desvanece — revelando o app por trás, que
// já carregou em paralelo (ver App.tsx: AuthProvider monta ao mesmo tempo
// que este splash anima, não espera um pelo outro).
interface Props {
  aoTerminar: () => void;
}

const DURACAO_ENTRADA_LOGO = 550;
const ATRASO_ANTES_DA_FRASE = 100;
const DURACAO_FRASE = 400;
const DURACAO_SEGURAR = 900;
const DURACAO_SAIDA = 450;

export function SplashAnimado({ aoTerminar }: Props) {
  const opacidadeLogo = useRef(new Animated.Value(0)).current;
  const posicaoLogo = useRef(new Animated.Value(24)).current;
  const escalaLogo = useRef(new Animated.Value(0.88)).current;
  const opacidadeFrase = useRef(new Animated.Value(0)).current;
  const opacidadeTela = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacidadeLogo, {
          toValue: 1,
          duration: DURACAO_ENTRADA_LOGO,
          useNativeDriver: true,
        }),
        Animated.spring(posicaoLogo, {
          toValue: 0,
          friction: 6,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.spring(escalaLogo, {
          toValue: 1,
          friction: 6,
          tension: 60,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(opacidadeFrase, {
        toValue: 1,
        duration: DURACAO_FRASE,
        delay: ATRASO_ANTES_DA_FRASE,
        useNativeDriver: true,
      }),
      Animated.delay(DURACAO_SEGURAR),
      Animated.timing(opacidadeTela, {
        toValue: 0,
        duration: DURACAO_SAIDA,
        useNativeDriver: true,
      }),
    ]).start(() => aoTerminar());
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: opacidadeTela }]} pointerEvents="none">
      <Animated.Image
        source={require('../../assets/splash-icon.png')}
        style={[
          styles.logo,
          {
            opacity: opacidadeLogo,
            transform: [{ translateY: posicaoLogo }, { scale: escalaLogo }],
          },
        ]}
        resizeMode="contain"
      />
      <Animated.Text style={[styles.frase, { opacity: opacidadeFrase }]}>
        faça o que tem que ser feito!
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    elevation: 999,
  },
  logo: {
    width: 220,
    height: 220,
  },
  frase: {
    marginTop: 4,
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: '#FF5C33',
    letterSpacing: 0.2,
  },
});
