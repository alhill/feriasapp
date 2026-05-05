import {
    DrawerContentScrollView,
    DrawerItem,
    DrawerItemList,
    type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useRouter, useSegments } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import React, { useEffect } from 'react';
import { Alert, Switch, Text, useColorScheme, View } from 'react-native';

import '@/global.css';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { shouldAutoSyncCatalog, syncCatalogFromFirestore } from '@/lib/catalog-sync';
import { hasWorkingInternet } from '@/lib/check-connectivity';
import { useAuthStore } from '@/stores/auth-store';
import { useCacheStore } from '@/stores/cache-store';
import { useNetworkStore } from '@/stores/network-store';
import { useSalesQueueStore } from '@/stores/sales-queue-store';

function formatLastSyncLabel(lastCatalogSyncAt: string | null): string {
  if (!lastCatalogSyncAt) {
    return 'Ult. sync: sin datos';
  }

  const parsed = new Date(lastCatalogSyncAt);
  if (Number.isNaN(parsed.getTime())) {
    return 'Ult. sync: sin datos';
  }

  return `Ult. sync: ${parsed.toLocaleString('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
  })}`;
}

function AppDrawerContent(props: DrawerContentComponentProps) {
  const signOut = useAuthStore((state) => state.signOut);
  const isOfflineMode = useNetworkStore((state) => state.isOfflineMode);
  const setOfflineMode = useNetworkStore((state) => state.setOfflineMode);
  const pendingSalesCount = useSalesQueueStore((state) => state.pendingSales.length);
  const lastCatalogSyncAt = useCacheStore((state) => state.lastCatalogSyncAt);

  const handleSignOut = React.useCallback(async () => {
    try {
      await signOut();
    } catch {
      // Keep UI responsive even if sign out fails temporarily.
    }
  }, [signOut]);

  const handleOfflineModeChange = React.useCallback(
    (offline: boolean) => {
      if (offline) {
        void setOfflineMode(true);
        return;
      }

      if (!isOfflineMode) {
        return;
      }

      if (pendingSalesCount === 0) {
        void setOfflineMode(false);
        return;
      }

      const pendingSalesLabel = pendingSalesCount === 1 ? '1 venta pendiente' : `${pendingSalesCount} ventas pendientes`;

      Alert.alert(
        'Confirmar sincronizacion',
        `Hay ${pendingSalesLabel} en la cola. Si desactivas el modo sin conexion, se intentaran sincronizar ahora.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Sincronizar',
            onPress: () => {
              void setOfflineMode(false);
            },
          },
        ]
      );
    },
    [isOfflineMode, pendingSalesCount, setOfflineMode]
  );

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ flex: 1 }}>
      <View>
        <DrawerItemList {...props} />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ flex: 1, fontSize: 14, color: '#888' }}>Modo sin conexión</Text>
          <Switch value={isOfflineMode} onValueChange={handleOfflineModeChange} />
        </View>
        <DrawerItem label="Cerrar sesion" onPress={handleSignOut} />
      </View>

      <View style={{ marginTop: 'auto', paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ fontSize: 11, color: '#888' }}>{formatLastSyncLabel(lastCatalogSyncAt)}</Text>
      </View>
    </DrawerContentScrollView>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const initialize = useAuthStore((state) => state.initialize);
  const authStatus = useAuthStore((state) => state.status);
  const isOfflineMode = useNetworkStore((state) => state.isOfflineMode);
  const lastCatalogSyncAt = useCacheStore((state) => state.lastCatalogSyncAt);
  const setOfflineMode = useNetworkStore((state) => state.setOfflineMode);
  const applyPersistedMode = useNetworkStore((state) => state.applyPersistedMode);
  const syncAllPendingSales = useSalesQueueStore((state) => state.syncAllPendingSales);

  // Restore Firestore network state from persisted preference.
  useEffect(() => {
    applyPersistedMode();
  }, [applyPersistedMode]);

  // On startup, check network connectivity via real probe.
  useEffect(() => {
    let cancelled = false;

    async function checkConnectivity() {
      try {
        const working = await hasWorkingInternet();
        if (cancelled) return;

        if (!working && !isOfflineMode) {
          Alert.alert(
            'Sin conexión a Internet',
            'No se pudo conectar con el servidor. La red puede estar colapsada o sin acceso. ¿Querés activar el modo sin conexión para seguir trabajando?',
            [
              { text: 'No, reintentar', style: 'cancel' },
              {
                text: 'Activar modo sin conexión',
                onPress: () => setOfflineMode(true),
              },
            ]
          );
        }
      } catch {
        // Connectivity check unavailable; proceed normally.
      }
    }

    checkConnectivity();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  useEffect(() => {
    if (isOfflineMode) {
      return;
    }

    void syncAllPendingSales();
  }, [isOfflineMode, syncAllPendingSales]);

  useEffect(() => {
    if (isOfflineMode || !shouldAutoSyncCatalog(lastCatalogSyncAt)) {
      return;
    }

    let cancelled = false;

    async function syncCatalog() {
      try {
        await syncCatalogFromFirestore();
      } catch {
        if (cancelled) {
          return;
        }
        // Keep cached data if the online refresh fails.
      }
    }

    void syncCatalog();

    return () => {
      cancelled = true;
    };
  }, [isOfflineMode, lastCatalogSyncAt]);

  useEffect(() => {
    if (authStatus === 'loading') return;

    const inLoginScreen = segments[0] === 'login';

    if (authStatus === 'anonymous' && !inLoginScreen) {
      router.replace('/login');
    } else if (authStatus === 'authenticated' && inLoginScreen) {
      router.replace('/');
    }
  }, [authStatus, segments, router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Drawer
        drawerContent={(props) => <AppDrawerContent {...props} />}
        screenOptions={{
          headerTitleAlign: 'left',
        }}>
        <Drawer.Screen
          name="index"
          options={{
            title: 'Evento activo',
            drawerLabel: 'Evento activo',
          }}
        />
        <Drawer.Screen
          name="resumen"
          options={{
            title: 'Resumen',
            drawerLabel: 'Resumen',
          }}
        />
        <Drawer.Screen
          name="tareas-pendientes"
          options={{
            title: 'Tareas pendientes',
            drawerLabel: 'Tareas pendientes',
          }}
        />
        <Drawer.Screen
          name="eventos"
          options={{
            title: 'Eventos',
            drawerLabel: 'Eventos',
          }}
        />
        <Drawer.Screen
          name="productos"
          options={{
            title: 'Productos',
            drawerLabel: 'Productos',
          }}
        />
        <Drawer.Screen
          name="producto"
          options={{
            drawerItemStyle: { display: 'none' },
            title: 'Producto',
          }}
        />
        <Drawer.Screen
          name="explore"
          options={{
            drawerItemStyle: { display: 'none' },
            headerShown: false,
          }}
        />
        <Drawer.Screen
          name="login"
          options={{
            drawerItemStyle: { display: 'none' },
            headerShown: false,
          }}
        />
      </Drawer>
    </ThemeProvider>
  );
}
