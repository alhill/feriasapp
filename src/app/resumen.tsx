import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import React from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionButton } from '@/components/ui/action-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { db } from '@/lib/firebase/firestore';
import { syncSalesForEventFromFirestore } from '@/lib/sales-sync';
import { useCacheStore } from '@/stores/cache-store';
import { useNetworkStore } from '@/stores/network-store';
import { useSalesQueueStore } from '@/stores/sales-queue-store';
import { useSessionStore } from '@/stores/session-store';

type SaleListItem = {
  id: string;
  createdAt: Date;
  total: number;
  itemCount: number;
  items: Array<{ id: string; name: string | null; qty: number; price: number }>;
  source: 'remote' | 'pending';
};

export default function ResumenScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const theme = useTheme();
  const sessionId = useSessionStore((state) => state.sessionId);
  const cachedEvents = useCacheStore((state) => state.events);
  const isOfflineMode = useNetworkStore((state) => state.isOfflineMode);
  const pendingSales = useSalesQueueStore((state) => state.pendingSales);
  const [activeEventName, setActiveEventName] = React.useState<string | null>(null);
  const [remoteSales, setRemoteSales] = React.useState<SaleListItem[]>([]);
  const [isLoadingSales, setIsLoadingSales] = React.useState<boolean>(false);
  const [salesError, setSalesError] = React.useState<string | null>(null);
  const [selectedSale, setSelectedSale] = React.useState<SaleListItem | null>(null);

  React.useEffect(() => {
    if (!sessionId) {
      setActiveEventName(null);
      return;
    }

    const cachedEvent = cachedEvents.find((eventItem) => eventItem.id === sessionId);
    if (cachedEvent) {
      setActiveEventName(cachedEvent.name);
    }

    if (isOfflineMode) {
      return;
    }

    const eventRef = doc(db, 'events', sessionId);
    const unsubscribe = onSnapshot(
      eventRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setActiveEventName(null);
          return;
        }

        const data = snapshot.data();
        const name = typeof data.name === 'string' ? data.name.trim() : '';
        setActiveEventName(name.length > 0 ? name : 'Evento sin nombre');
      },
      () => {
        if (cachedEvent) {
          setActiveEventName(cachedEvent.name);
        }
      }
    );

    return unsubscribe;
  }, [cachedEvents, isOfflineMode, sessionId]);

  React.useEffect(() => {
    if (!sessionId) {
      setRemoteSales([]);
      setIsLoadingSales(false);
      setSalesError(null);
      return;
    }

    const cachedSales = useCacheStore.getState().salesByEventId[sessionId] ?? [];
    setRemoteSales(
      cachedSales
        .map((sale) => ({
          id: sale.id,
          createdAt: new Date(sale.createdAtIso),
          total: sale.total,
          itemCount: sale.items.reduce((sum, item) => sum + item.qty, 0),
          items: sale.items.map((item) => ({
            id: item.id,
            name: item.name,
            qty: item.qty,
            price: item.price,
          })),
          source: 'remote' as const,
        }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    );

    if (isOfflineMode) {
      setIsLoadingSales(false);
      setSalesError(null);
      return;
    }

    let isMounted = true;

    setIsLoadingSales(true);
    setSalesError(null);

    void (async () => {
      try {
        const result = await syncSalesForEventFromFirestore(sessionId);

        if (!isMounted) {
          return;
        }

        setRemoteSales(
          result.sales
            .map((sale) => ({
              id: sale.id,
              createdAt: new Date(sale.createdAtIso),
              total: sale.total,
              itemCount: sale.items.reduce((sum, item) => sum + item.qty, 0),
              items: sale.items.map((item) => ({
                id: item.id,
                name: item.name,
                qty: item.qty,
                price: item.price,
              })),
              source: 'remote' as const,
            }))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        );
        setSalesError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : 'No se pudieron cargar las ventas.';
        setSalesError(message);
      } finally {
        if (isMounted) {
          setIsLoadingSales(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOfflineMode, sessionId]);

  const pendingSalesForEvent = React.useMemo(() => {
    if (!sessionId) {
      return [] as SaleListItem[];
    }

    return pendingSales
      .filter((sale) => sale.saleEventId === sessionId)
      .map((sale) => ({
        id: sale.id,
        createdAt: new Date(sale.createdAt.seconds * 1000 + Math.floor(sale.createdAt.nanoseconds / 1_000_000)),
        total: sale.total,
        itemCount: sale.items.reduce((sum, item) => sum + item.qty, 0),
        items: sale.items.map((item) => ({
          id: item.id,
          name: item.name,
          qty: item.qty,
          price: item.price,
        })),
        source: 'pending' as const,
      }));
  }, [pendingSales, sessionId]);

  const allSales = React.useMemo(() => {
    const byId = new Map<string, SaleListItem>();

    for (const sale of remoteSales) {
      byId.set(sale.id, sale);
    }

    for (const sale of pendingSalesForEvent) {
      if (!byId.has(sale.id)) {
        byId.set(sale.id, sale);
      }
    }

    return Array.from(byId.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [pendingSalesForEvent, remoteSales]);

  const salesCount = allSales.length;
  const totalAmount = React.useMemo(() => allSales.reduce((sum, sale) => sum + sale.total, 0), [allSales]);
  const averageAmount = salesCount > 0 ? totalAmount / salesCount : 0;

  const formatMoney = React.useCallback((value: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(value);
  }, []);

  const formatDate = React.useCallback((value: Date) => {
    return value.toLocaleString('es-ES', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }, []);

  const formatDateDay = React.useCallback((value: Date) => {
    return value.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  }, []);

  const formatDateHour = React.useCallback((value: Date) => {
    return value.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: activeEventName ? `Resumen ${activeEventName}` : 'Resumen',
    });
  }, [activeEventName, navigation]);

  const hasActiveEvent = Boolean(sessionId);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {!hasActiveEvent ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">No hay un evento activo</ThemedText>
            <ThemedText themeColor="textSecondary">
              Selecciona un evento para ver el resumen de ventas.
            </ThemedText>
            <Pressable onPress={() => router.push('/eventos')} style={styles.linkPressable}>
              <ThemedText type="linkPrimary">Ir a Eventos</ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <>
            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={styles.metricsRow}>
                <ThemedView
                  type="backgroundElement"
                  style={[styles.metricCard, styles.metricSalesCard, { borderWidth: 1, borderColor: theme.backgroundSelected }]}>
                  <ThemedText type="small" themeColor="textSecondary">Ventas</ThemedText>
                  <ThemedText type="subtitle">{salesCount}</ThemedText>
                </ThemedView>
                <ThemedView
                  type="backgroundElement"
                  style={[styles.metricCard, { borderWidth: 1, borderColor: theme.backgroundSelected }]}>
                  <ThemedText type="small" themeColor="textSecondary">Total</ThemedText>
                  <ThemedText type="subtitle" style={styles.metricTotalValue}>{formatMoney(totalAmount)}</ThemedText>
                </ThemedView>
                <ThemedView
                  type="backgroundElement"
                  style={[styles.metricCard, { borderWidth: 1, borderColor: theme.backgroundSelected }]}>
                  <ThemedText type="small" themeColor="textSecondary">Media por venta</ThemedText>
                  <ThemedText type="smallBold">{formatMoney(averageAmount)}</ThemedText>
                </ThemedView>
              </View>
              {isOfflineMode ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.metricHint}>
                  Datos desde cache local.
                </ThemedText>
              ) : null}
            </ThemedView>

            <ThemedView type="backgroundElement" style={[styles.card, styles.tableCard]}>
              <View style={[styles.tableHeader, { borderBottomColor: theme.backgroundSelected }]}>
                <ThemedText type="smallBold" style={[styles.colItems, styles.tableHeaderText]}>Items</ThemedText>
                <ThemedText type="smallBold" style={[styles.colDate, styles.tableHeaderText]}>Fecha</ThemedText>
                <ThemedText type="smallBold" style={[styles.colTotal, styles.tableHeaderText]}>Total</ThemedText>
                <View style={styles.colAction} />
              </View>

              {isLoadingSales ? <ThemedText>Cargando ventas...</ThemedText> : null}

              {salesError ? (
                <ThemedText themeColor="textSecondary">Error: {salesError}</ThemedText>
              ) : null}

              {!isLoadingSales && !salesError && allSales.length === 0 ? (
                <ThemedText themeColor="textSecondary">Aun no hay ventas para este evento.</ThemedText>
              ) : null}

              {!isLoadingSales && !salesError && allSales.length > 0 ? (
                <FlatList
                  data={allSales}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.tableRows}
                  renderItem={({ item }) => (
                    <View style={styles.tableRow}>
                      <ThemedText style={[styles.colItems, styles.tableCellText]}>{item.itemCount}</ThemedText>
                      <View style={styles.colDate}>
                        <ThemedText style={styles.tableCellText}>{formatDateDay(item.createdAt)}</ThemedText>
                        <ThemedText style={[styles.tableCellText, styles.tableCellSubtle]}>{formatDateHour(item.createdAt)}</ThemedText>
                      </View>
                      <ThemedText style={[styles.colTotal, styles.tableCellText]}>{formatMoney(item.total)}</ThemedText>
                      <View style={styles.colAction}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Mas informacion"
                          onPress={() => setSelectedSale(item)}
                          style={({ pressed }) => [styles.infoIconButton, pressed && styles.infoIconButtonPressed]}>
                          <MaterialIcons
                            name="info-outline"
                            size={16}
                            color={item.source === 'pending' ? '#7a4b09' : theme.textSecondary}
                          />
                        </Pressable>
                      </View>
                    </View>
                  )}
                />
              ) : null}
            </ThemedView>
          </>
        )}

        <Modal
          visible={selectedSale !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedSale(null)}>
          <View style={styles.modalOverlay}>
            <ThemedView type="backgroundElement" style={styles.modalCard}>
              <ThemedText type="default" style={styles.modalTitle}>Detalle de la venta</ThemedText>
              {selectedSale ? (
                <>
                  <ThemedText themeColor="textSecondary">{formatDate(selectedSale.createdAt)}</ThemedText>
                  {selectedSale.source === 'pending' ? (
                    <ThemedText themeColor="textSecondary">Estado: pendiente de sincronizacion</ThemedText>
                  ) : null}

                  <ScrollView style={styles.itemsList} contentContainerStyle={styles.itemsListContent}>
                    {selectedSale.items.map((item) => (
                      <View key={`${selectedSale.id}_${item.id}`} style={styles.itemRow}>
                        <ThemedText style={[styles.itemName, styles.itemText]}>{item.name ?? '(sin nombre)'}</ThemedText>
                        <ThemedText themeColor="textSecondary" style={styles.itemText}>x{item.qty}</ThemedText>
                        <ThemedText themeColor="textSecondary" style={styles.itemText}>{formatMoney(item.price * item.qty)}</ThemedText>
                      </View>
                    ))}
                  </ScrollView>

                  <ThemedText type="smallBold" style={styles.modalTotal}>Total {formatMoney(selectedSale.total)}</ThemedText>
                </>
              ) : null}

              <ActionButton label="Cerrar" variant="primary" onPress={() => setSelectedSale(null)} />
            </ThemedView>
          </View>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    justifyContent: 'flex-start',
    gap: Spacing.three,
    paddingTop: Spacing.four,
  },
  card: {
    width: '100%',
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  linkPressable: {
    alignSelf: 'flex-start',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  metricCard: {
    flex: 1,
    minWidth: 150,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  metricSalesCard: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 110,
    maxWidth: 110,
  },
  metricTotalValue: {
    textAlign: 'right',
    alignSelf: 'stretch',
  },
  metricHint: {
    fontSize: 12,
    lineHeight: 16,
  },
  tableCard: {
    flex: 1,
    minHeight: 0,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.one,
    borderBottomWidth: 1,
  },
  tableRows: {
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Spacing.two,
    paddingVertical: 4,
  },
  tableHeaderText: {
    fontSize: 12,
    lineHeight: 16,
  },
  tableCellText: {
    fontSize: 12,
    lineHeight: 16,
  },
  tableCellSubtle: {
    opacity: 0.85,
  },
  colItems: {
    width: 70,
  },
  colDate: {
    flex: 1,
  },
  colTotal: {
    width: 110,
    textAlign: 'right',
  },
  colAction: {
    width: 32,
    alignItems: 'flex-end',
  },
  infoIconButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoIconButtonPressed: {
    opacity: 0.55,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: MaxContentWidth,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
  },
  itemsList: {
    maxHeight: 280,
  },
  itemsListContent: {
    gap: Spacing.one,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  itemName: {
    flex: 1,
  },
  itemText: {
    fontSize: 13,
    lineHeight: 18,
  },
  modalTotal: {
    fontSize: 18,
    lineHeight: 24,
    alignSelf: 'flex-end',
  },
});
