import { StatusBar } from 'expo-status-bar';
import AuthScreen from '../components/AuthScreen';

/** Tela de login (entrar, criar conta, esqueci a senha). Acessível só sem sessão; ao entrar, a casca leva à central. */
export default function LoginRoute() {
  return <><StatusBar style="light" /><AuthScreen /></>;
}
