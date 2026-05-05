import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionButton } from '@/components/ui/action-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
    type FirestoreTimestampValue,
    type PendingSale,
    useSalesQueueStore,
} from '@/stores/sales-queue-store';

function formatDateTime(value: FirestoreTimestampValue): string {
  const parsed = new Date(value.seconds * 1000 + Math.floor(value.nanoseconds / 1000000));

  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
}

export default function PendingTasksScreen() {
  const navigation = useNavigation();
  const theme = useTheme();
  const pendingSales = useSalesQueueStore((state) => state.pendingSales);
  const isSyncing = useSalesQueueStore((state) => state.isSyncing);
  const syncPendingSale = useSalesQueueStore((state) => state.syncPendingSale);
  const syncAllPendingSales = useSalesQueueStore((state) => state.syncAllPendingSales);
  const deletePendingSale = useSalesQueueStore((state) => state.deletePendingSale);
  const clearPendingSales = useSalesQueueStore((state) => state.clearPendingSales);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRightContainerStyle: { paddingRight: Spacing.three },
      headerRight: () => (
        <View style={[styles.headerBadge, { backgroundColor: theme.backgroundSelected }]}> 
          <ThemedText type="smallBold">{pendingSales.length}</ThemedText>
        </View>
      ),
    });
  }, [navigation, pendingSales.length, theme.backgroundSelected]);

  const handleSyncOne = React.useCallback(
    async (sale: PendingSale) => {
      const result = await syncPendingSale(sale.id, { ignoreOfflineMode: true });
      if (result.ok) {
        Alert.alert('Sincronizado', 'La venta se sincronizo correctamente.');
        return;
      }

      Alert.alert('Sincronizacion pendiente', result.message ?? 'No se pudo sincronizar la venta.');
    },
    [syncPendingSale]
  );

  const handleDeleteOne = React.useCallback(
    (sale: PendingSale) => {
      Alert.alert('Borrar tarea', 'Esta tarea pendiente se eliminara de la cola. Continuar?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: () => deletePendingSale(sale.id),
        },
      ]);
    },
    [deletePendingSale]
  );

  const handleSyncAll = React.useCallback(() => {
    if (pendingSales.length === 0) {
      Alert.alert('Sin tareas', 'No hay ventas pendientes por sincronizar.');
      return;
    }

    Alert.alert('Sincronizar todo', 'Se intentaran sincronizar todas las ventas pendientes. Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sincronizar',
        onPress: () => {
          void (async () => {
            const result = await syncAllPendingSales({ ignoreOfflineMode: true });
            Alert.alert('Resultado de sincronizacion', `Sincronizadas: ${result.synced}. Fallidas: ${result.failed}.`);
          })();
        },
      },
    ]);
  }, [pendingSales.length, syncAllPendingSales]);

  const handleDeleteAll = React.useCallback(() => {
    if (pendingSales.length === 0) {
      Alert.alert('Sin tareas', 'No hay ventas pendientes para borrar.');
      return;
    }

    Alert.alert('Borrar todo', 'Se eliminaran todas las tareas pendientes. Esta accion no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar todo',
        style: 'destructive',
        onPress: clearPendingSales,
      },
    ]);
  }, [clearPendingSales, pendingSales.length]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerCard}>
          <View style={styles.globalActionsRow}>
            <ActionButton
              label="Sincronizar todo"
              variant="secondary"
              size="md"
              leftIcon={<MaterialIcons name="sync" size={18} color={theme.text} />}
              onPress={handleSyncAll}
              disabled={isSyncing || pendingSales.length === 0}
              style={styles.globalButton}
            />

            <ActionButton
              label="Borrar todo"
              variant="danger"
              size="md"
              leftIcon={<MaterialIcons name="delete-outline" size={18} color="#8a1c1c" />}
              onPress={handleDeleteAll}
              disabled={pendingSales.length === 0}
              style={styles.globalButton}
            />
          </View>
        </View>

        {pendingSales.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.emptyCard}>
            <ThemedText type="smallBold">Todo al dia</ThemedText>
            <ThemedText themeColor="textSecondary">No hay ventas pendientes de sincronizacion.</ThemedText>
          </ThemedView>
        ) : (
          <FlatList
            data={pendingSales}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <ThemedView type="backgroundElement" style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <ThemedText type="smallBold">{item.saleEventName ?? item.saleEventId}</ThemedText>
                  <ThemedText themeColor="textSecondary">{formatDateTime(item.createdAt)}</ThemedText>
                </View>

                <ThemedText themeColor="textSecondary">Items: {item.items.length}</ThemedText>
                <ThemedText themeColor="textSecondary">Total: {item.total.toFixed(2)} EUR</ThemedText>
                {item.lastError ? <ThemedText style={styles.errorText}>{item.lastError}</ThemedText> : null}

                <View style={styles.itemActionsRow}>
                  <ActionButton
                    label="Sincronizar venta"
                    iconOnly
                    size="sm"
                    variant="secondary"
                    leftIcon={<MaterialIcons name="sync" size={16} color={theme.text} />}
                    onPress={() => {
                      void handleSyncOne(item);
                    }}
                    surfaceStyle={{ backgroundColor: theme.background, borderColor: theme.backgroundSelected }}
                    style={styles.iconButton}
                  />

                  <ActionButton
                    label="Borrar venta pendiente"
                    iconOnly
                    size="sm"
                    variant="danger"
                    leftIcon={<MaterialIcons name="delete-outline" size={16} color="#8a1c1c" />}
                    onPress={() => handleDeleteOne(item)}
                    surfaceStyle={styles.deleteIconButton}
                    style={styles.iconButton}
                  />
                </View>
              </ThemedView>
            )}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  headerCard: {
    width: '100%',
    paddingTop: Spacing.one,
  },
  headerBadge: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globalActionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  globalButton: {
    flex: 1,
  },
  emptyCard: {
    width: '100%',
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  itemCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  itemActionsRow: {
    marginTop: Spacing.one,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.one,
  },
  iconButton: {
    minHeight: 36,
  },
  deleteIconButton: {
    backgroundColor: '#ffe2e2',
    borderColor: '#efb4b4',
  },
  errorText: {
    color: '#9b1c1c',
  },
});
