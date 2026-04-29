type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function getRequiredEnv(key: keyof FirebaseClientConfigMap): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
}

type FirebaseClientConfigMap = {
  EXPO_PUBLIC_FIREBASE_API_KEY: string;
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: string;
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: string;
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: string;
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
  EXPO_PUBLIC_FIREBASE_APP_ID: string;
};

export function getFirebaseClientConfig(): FirebaseClientConfig {
  return {
    apiKey: getRequiredEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: getRequiredEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: getRequiredEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: getRequiredEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getRequiredEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getRequiredEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
  };
}
