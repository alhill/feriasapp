import { getApp, getApps, initializeApp } from 'firebase/app';

import { getFirebaseClientConfig } from '@/lib/firebase/config';

const firebaseConfig = getFirebaseClientConfig();

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
