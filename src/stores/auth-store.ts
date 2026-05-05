import { FirebaseError } from 'firebase/app';
import {
    signOut as firebaseSignOut,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    type User,
} from 'firebase/auth';
import { create } from 'zustand';

import { auth } from '@/lib/firebase/auth';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

type AuthState = {
  status: AuthStatus;
  user: User | null;
  isSigningIn: boolean;
  authError: string | null;
  initialize: () => () => void;
  signIn: (username: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
};

let authUnsubscribe: (() => void) | null = null;

function mapAuthError(error: unknown): string {
  if (!(error instanceof FirebaseError)) {
    return 'No se pudo iniciar sesion.';
  }

  switch (error.code) {
    case 'auth/invalid-email':
      return 'El email no es valido.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Usuario o contrasena incorrectos.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Proba de nuevo en unos minutos.';
    default:
      return 'No se pudo iniciar sesion.';
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'loading',
  user: null,
  isSigningIn: false,
  authError: null,
  initialize: () => {
    if (authUnsubscribe) {
      return authUnsubscribe;
    }

    authUnsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        set({
          user,
          status: user ? 'authenticated' : 'anonymous',
          isSigningIn: false,
          authError: null,
        });
      },
      () => {
        set({
          user: null,
          status: 'anonymous',
          isSigningIn: false,
          authError: 'No se pudo recuperar la sesion.',
        });
      }
    );

    return authUnsubscribe;
  },
  signIn: async (username, password) => {
    set({ isSigningIn: true, authError: null });

    try {
      await signInWithEmailAndPassword(auth, username.trim(), password);
      return true;
    } catch (error) {
      set({ isSigningIn: false, authError: mapAuthError(error) });
      return false;
    }
  },
  signOut: async () => {
    await firebaseSignOut(auth);
  },
  clearAuthError: () => set({ authError: null }),
}));