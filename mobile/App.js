import React, { useEffect } from 'react';
import { AppState, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import Toast from './src/components/Toast';
import { useAppStore } from './src/store';
import { api } from './src/api';
import { loadAccount } from './src/lib/account';
import { stopAllPlayback } from './src/lib/playback';
import { logError } from './src/lib/toast';

export default function App() {
  const token = useAppStore((s) => s.token);

  // Minimising or closing the app stops every video at once
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopAllPlayback();
    });
    return () => sub.remove();
  }, []);

  // Refresh the signed-in account in the background; the app never waits for this
  useEffect(() => {
    if (!token) return;
    api('/v1/auth/me')
      .then(({ user }) => useAppStore.getState().setSession(token, user))
      .then(loadAccount)
      .catch(logError);
  }, [token]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <NavigationContainer>
        <RootNavigator signedIn={Boolean(token)} />
      </NavigationContainer>
      <Toast />
    </SafeAreaProvider>
  );
}
