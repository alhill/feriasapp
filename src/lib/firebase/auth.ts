import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { getReactNativePersistence } from 'firebase/auth/react-native';
import { Platform } from 'react-native';

import { firebaseApp } from '@/lib/firebase/app';

let authInstance: Auth;

if (Platform.OS === 'web') {
  authInstance = getAuth(firebaseApp);
} else {
  try {
    authInstance = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    authInstance = getAuth(firebaseApp);
  }
}

export const auth = authInstance;
