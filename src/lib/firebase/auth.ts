import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    getAuth,
    initializeAuth,
    type Auth,
    type Persistence,
} from 'firebase/auth';
import { Platform } from 'react-native';

import { firebaseApp } from '@/lib/firebase/app';

let authInstance: Auth;

type AuthWithReactNativePersistence = {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
};

function getReactNativePersistenceSafe(): ((storage: typeof AsyncStorage) => Persistence) | null {
  try {
    // `firebase/auth` types do not expose RN persistence in this SDK setup.
    const authModule = require('@firebase/auth') as AuthWithReactNativePersistence;
    return authModule.getReactNativePersistence ?? null;
  } catch {
    return null;
  }
}

if (Platform.OS === 'web') {
  authInstance = getAuth(firebaseApp);
} else {
  try {
    const getReactNativePersistence = getReactNativePersistenceSafe();

    authInstance = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence ? getReactNativePersistence(AsyncStorage) : undefined,
    });
  } catch {
    authInstance = getAuth(firebaseApp);
  }
}

export const auth = authInstance;
