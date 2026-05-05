import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import React from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionButton } from '@/components/ui/action-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shouldAutoSyncCatalog, syncCatalogFromFirestore } from '@/lib/catalog-sync';
import { db } from '@/lib/firebase/firestore';
import type { Product } from '@/models/product';
import { useAuthStore } from '@/stores/auth-store';
import { useCacheStore } from '@/stores/cache-store';
import { useNetworkStore } from '@/stores/network-store';
import { useSalesQueueStore } from '@/stores/sales-queue-store';
import { useSessionStore } from '@/stores/session-store';

const CHANGE_DENOMINATIONS: Array<{
  cents: number;
  label: string;
  shape: 'bill' | 'coin';
  color: string;
  textColor: string;
  coinSize?: number;
}> = [
  { cents: 5000, label: '50', shape: 'bill', color: '#F59E0B', textColor: '#111827' },
  { cents: 2000, label: '20', shape: 'bill', color: '#2563EB', textColor: '#FFFFFF' },
  { cents: 1000, label: '10', shape: 'bill', color: '#DC2626', textColor: '#FFFFFF' },
  { cents: 500, label: '5', shape: 'bill', color: '#6B7280', textColor: '#FFFFFF' },
  { cents: 200, label: '2', shape: 'coin', color: '#C0C0C0', textColor: '#1F2937', coinSize: 34 },
  { cents: 100, label: '1', shape: 'coin', color: 'darkgoldenrod', textColor: '#FFFFFF', coinSize: 32 },
  { cents: 50, label: '50', shape: 'coin', color: 'goldenrod', textColor: '#FFFFFF', coinSize: 30 },
  { cents: 20, label: '20', shape: 'coin', color: 'goldenrod', textColor: '#FFFFFF', coinSize: 28 },
  { cents: 10, label: '10', shape: 'coin', color: 'goldenrod', textColor: '#FFFFFF', coinSize: 26 },
  { cents: 5, label: '5', shape: 'coin', color: '#B87333', textColor: '#FFFFFF', coinSize: 24 },
];

export default function HomeScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const theme = useTheme();
  const cachedProducts = useCacheStore((state) => state.products);
  const cachedTags = useCacheStore((state) => state.availableTags);
  const cachedEvents = useCacheStore((state) => state.events);
  const lastCatalogSyncAt = useCacheStore((state) => state.lastCatalogSyncAt);
  const sessionId = useSessionStore((state) => state.sessionId);
  const user = useAuthStore((state) => state.user);
  const isOfflineMode = useNetworkStore((state) => state.isOfflineMode);
  const enqueueSale = useSalesQueueStore((state) => state.enqueueSale);
  const syncPendingSale = useSalesQueueStore((state) => state.syncPendingSale);
  const [activeEventName, setActiveEventName] = React.useState<string | null>(null);
  const [activeEventStatus, setActiveEventStatus] = React.useState<'active' | 'loading' | 'missing'>(
    sessionId ? 'loading' : 'missing'
  );
  const [products, setProducts] = React.useState<Product[]>([]);
  const [tags, setTags] = React.useState<string[]>([]);
  const [selectedTag, setSelectedTag] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [cartQuantities, setCartQuantities] = React.useState<Record<string, number>>({});
  const [isLoadingProducts, setIsLoadingProducts] = React.useState<boolean>(true);
  const [productsError, setProductsError] = React.useState<string | null>(null);
  const [isCheckoutModalVisible, setIsCheckoutModalVisible] = React.useState<boolean>(false);
  const [checkoutTotalInput, setCheckoutTotalInput] = React.useState<string>('');
  const [isChangeCalculatorVisible, setIsChangeCalculatorVisible] = React.useState<boolean>(false);
  const [amountPaidInput, setAmountPaidInput] = React.useState<string>('');
  const [selectedProductId, setSelectedProductId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setProducts(cachedProducts);
    setTags(cachedTags);
    setSelectedTag((currentTag) => {
      if (currentTag === 'all') {
        return currentTag;
      }

      return cachedTags.includes(currentTag) ? currentTag : 'all';
    });
    setIsLoadingProducts(false);
  }, [cachedProducts, cachedTags]);

  React.useEffect(() => {
    if (!sessionId) {
      setActiveEventName(null);
      setActiveEventStatus('missing');
      return;
    }

    const cachedActiveEvent = cachedEvents.find((eventItem) => eventItem.id === sessionId);
    if (cachedActiveEvent) {
      setActiveEventName(cachedActiveEvent.name);
      setActiveEventStatus('active');
    } else {
      setActiveEventStatus('loading');
    }


    const activeEventRef = doc(db, 'events', sessionId);

    const unsubscribe = onSnapshot(activeEventRef, (snapshot) => {
      if (!snapshot.exists()) {
        setActiveEventName(null);
        setActiveEventStatus('missing');
        return;
      }

      const data = snapshot.data();
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      setActiveEventName(name.length > 0 ? name : 'Evento sin nombre');
      setActiveEventStatus('active');
    }, () => {
      if (cachedActiveEvent) {
        setActiveEventName(cachedActiveEvent.name);
        setActiveEventStatus('active');
        return;
      }

      setActiveEventName(null);
      setActiveEventStatus('missing');
    });

    return unsubscribe;
  }, [cachedEvents, sessionId]);

  const hasActiveEvent = activeEventStatus === 'active';
  const headerTitle = hasActiveEvent ? (activeEventName ?? 'Evento activo') : 'Sin evento activo';

  const visibleProducts = React.useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('es');

    return products.filter((product) => {
      const matchesQuery =
        normalizedQuery.length === 0 || product.name.toLocaleLowerCase('es').includes(normalizedQuery);
      const matchesCategory =
        selectedTag === 'all' ||
        product.tags.includes(selectedTag) ||
        product.category?.toLocaleLowerCase('es') === selectedTag.toLocaleLowerCase('es');

      return product.active && matchesQuery && matchesCategory;
    });
  }, [products, searchQuery, selectedTag]);

  const cartItems = React.useMemo(() => {
    return products
      .map((product) => {
        const quantity = cartQuantities[product.id] ?? 0;

        if (quantity <= 0) {
          return null;
        }

        return {
          product,
          quantity,
          subtotal: product.price * quantity,
        };
      })
      .filter((item): item is { product: Product; quantity: number; subtotal: number } => item !== null);
  }, [cartQuantities, products]);

  const cartUnits = React.useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );
  const cartTotal = React.useMemo(
    () => cartItems.reduce((sum, item) => sum + item.subtotal, 0),
    [cartItems]
  );
  const parseTotalInput = React.useCallback((rawValue: string): number | null => {
    const normalized = rawValue.trim().replace(',', '.');

    if (normalized.length === 0) {
      return null;
    }

    const parsedValue = Number(normalized);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      return null;
    }

    return Number(parsedValue.toFixed(2));
  }, []);
  const checkoutTotal = React.useMemo(
    () => parseTotalInput(checkoutTotalInput),
    [checkoutTotalInput, parseTotalInput]
  );
  const amountPaid = React.useMemo(
    () => parseTotalInput(amountPaidInput),
    [amountPaidInput, parseTotalInput]
  );
  const changeDue = React.useMemo(() => {
    if (checkoutTotal === null || amountPaid === null) {
      return null;
    }

    return Number((amountPaid - checkoutTotal).toFixed(2));
  }, [amountPaid, checkoutTotal]);
  const changeBreakdown = React.useMemo(() => {
    if (changeDue === null || changeDue <= 0) {
      return {
        parts: [] as Array<{
          count: number;
          denomination: (typeof CHANGE_DENOMINATIONS)[number];
        }>,
        remainderCents: 0,
      };
    }

    let remainingCents = Math.round(changeDue * 100);
    const parts: Array<{
      count: number;
      denomination: (typeof CHANGE_DENOMINATIONS)[number];
    }> = [];

    for (const denomination of CHANGE_DENOMINATIONS) {
      if (remainingCents < denomination.cents) {
        continue;
      }

      const count = Math.floor(remainingCents / denomination.cents);
      if (count > 0) {
        parts.push({ count, denomination });
        remainingCents -= denomination.cents * count;
      }
    }

    return {
      parts,
      remainderCents: remainingCents,
    };
  }, [changeDue]);
  const selectedProduct = React.useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId]
  );

  const formatCurrency = React.useCallback(
    (value: number) =>
      new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2,
      }).format(value),
    []
  );

  const loadProducts = React.useCallback(async () => {
    setProductsError(null);

    if (isOfflineMode) {
      setIsLoadingProducts(false);
      return;
    }

    if (!shouldAutoSyncCatalog(lastCatalogSyncAt)) {
      setIsLoadingProducts(false);
      return;
    }

    setIsLoadingProducts(true);

    try {
      const { products: nextProducts, tags: nextTags } = await syncCatalogFromFirestore();

      setProducts(nextProducts);
      setTags(nextTags);
      setSelectedTag((currentTag) => {
        if (currentTag === 'all') {
          return currentTag;
        }

        return nextTags.includes(currentTag) ? currentTag : 'all';
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron cargar los productos.';
      setProductsError(message);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [isOfflineMode, lastCatalogSyncAt]);

  useFocusEffect(
    React.useCallback(() => {
      if (!hasActiveEvent) {
        setIsLoadingProducts(false);
        setProductsError(null);
        return;
      }

      void loadProducts();
    }, [hasActiveEvent, loadProducts])
  );

  React.useEffect(() => {
    if (hasActiveEvent) {
      return;
    }

    setIsCheckoutModalVisible(false);
    setCheckoutTotalInput('');
    setIsChangeCalculatorVisible(false);
    setAmountPaidInput('');
    setSelectedProductId(null);
  }, [hasActiveEvent]);

  const handleCloseCheckoutModal = React.useCallback(() => {
    setIsCheckoutModalVisible(false);
    setIsChangeCalculatorVisible(false);
    setAmountPaidInput('');
  }, []);

  const handleQuantityChange = React.useCallback((productId: string, delta: number) => {
    setCartQuantities((current) => {
      const nextQuantity = Math.max(0, (current[productId] ?? 0) + delta);

      if (nextQuantity === 0) {
        const next = { ...current };
        delete next[productId];
        return next;
      }

      return {
        ...current,
        [productId]: nextQuantity,
      };
    });
  }, []);

  const handleClearCart = React.useCallback(() => {
    if (cartUnits === 0) {
      Alert.alert('Carro vacio', 'No hay productos para vaciar.');
      return;
    }

    Alert.alert('Vaciar carro', 'Se eliminaran todos los productos del carro. Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Vaciar',
        style: 'destructive',
        onPress: () => setCartQuantities({}),
      },
    ]);
  }, [cartUnits]);

  const handleOpenCheckout = React.useCallback(() => {
    if (!hasActiveEvent) {
      return;
    }

    setCheckoutTotalInput(cartTotal.toFixed(2));
    setIsChangeCalculatorVisible(false);
    setAmountPaidInput('');
    setIsCheckoutModalVisible(true);
  }, [cartTotal, hasActiveEvent]);

  const handleCompletePurchase = React.useCallback(() => {
    if (!sessionId) {
      Alert.alert('Sin evento activo', 'No se puede registrar la compra sin un evento activo.');
      return;
    }

    if (checkoutTotal === null) {
      Alert.alert('Total invalido', 'Introduce un total valido para completar la compra.');
      return;
    }

    const pendingSale = enqueueSale({
      saleEventId: sessionId,
      saleEventName: activeEventName ?? undefined,
      deviceId: 'feriasapp-mobile',
      cashierId: user?.uid ?? null,
      items: cartItems.map((item) => ({
        id: item.product.id,
        name: item.product.name,
        price: item.product.price,
        qty: item.quantity,
      })),
      total: checkoutTotal,
    });

    setCartQuantities({});
    setIsCheckoutModalVisible(false);
    setCheckoutTotalInput('');
    setIsChangeCalculatorVisible(false);
    setAmountPaidInput('');

    if (isOfflineMode) {
      Alert.alert(
        'Compra encolada',
        `Se registraron ${cartUnits} unidades por ${formatCurrency(checkoutTotal)}. La venta quedo pendiente de sincronizacion.`
      );
      return;
    }

    void (async () => {
      const result = await syncPendingSale(pendingSale.id);
      if (result.ok) {
        Alert.alert(
          'Compra completada',
          `Se registraron ${cartUnits} unidades por ${formatCurrency(checkoutTotal)}.`
        );
        return;
      }

      Alert.alert(
        'Compra encolada',
        `Se registraron ${cartUnits} unidades por ${formatCurrency(checkoutTotal)}. Quedo pendiente de sincronizacion: ${result.message ?? 'error desconocido.'}`
      );
    })();
  }, [
    checkoutTotal,
    cartItems,
    cartUnits,
    enqueueSale,
    formatCurrency,
    isOfflineMode,
    sessionId,
    syncPendingSale,
    user?.uid,
  ]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: headerTitle,
      headerRightContainerStyle: { paddingRight: Spacing.three },
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cambiar evento"
          onPress={() => router.push('/eventos')}
          style={({ pressed }) => [styles.changeEventButton, pressed && styles.changeEventButtonPressed]}>
          <MaterialIcons name="swap-horiz" size={20} color={theme.text} />
        </Pressable>
      ),
    });
  }, [headerTitle, navigation, router, theme.text]);

  return (
    <ThemedView style={styles.container}>
      <Modal
        visible={hasActiveEvent && isCheckoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseCheckoutModal}>
        <Pressable style={styles.checkoutModalOverlay} onPress={handleCloseCheckoutModal}>
          <Pressable style={styles.checkoutModalContainer} onPress={(event) => event.stopPropagation()}>
            <ThemedView type="backgroundElement" style={styles.checkoutModalCard}>
            <ThemedText type="smallBold" style={styles.checkoutTitle}>Resumen de compra</ThemedText>

            <ScrollView style={styles.checkoutList} contentContainerStyle={styles.checkoutListContent}>
              {cartItems.length === 0 ? (
                <View
                  style={[
                    styles.checkoutEmptyState,
                    { borderColor: theme.backgroundSelected, backgroundColor: theme.background },
                  ]}
                >
                  <MaterialIcons name="shopping-cart" size={22} color={theme.textSecondary} />
                  <ThemedText type="smallBold" style={styles.checkoutEmptyTitle}>Sin productos en la compra</ThemedText>
                </View>
              ) : (
                cartItems.map((item) => (
                  <View key={item.product.id} style={[styles.checkoutRow, { borderBottomColor: theme.backgroundSelected }]}>
                    <View style={styles.checkoutNameColumn}>
                      <ThemedText numberOfLines={2} style={styles.checkoutProductName}>{item.product.name}</ThemedText>
                      <ThemedText themeColor="textSecondary">
                        {item.quantity} x {formatCurrency(item.product.price)}
                      </ThemedText>
                    </View>
                    <ThemedText>{formatCurrency(item.subtotal)}</ThemedText>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={[styles.totalRow, { borderTopColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold">Total</ThemedText>
              <View style={styles.totalInputWrap}>
                <TextInput
                  value={checkoutTotalInput}
                  onChangeText={setCheckoutTotalInput}
                  keyboardType="numeric"
                  inputMode="numeric"
                  style={[
                    styles.totalInput,
                    {
                      borderColor: theme.backgroundSelected,
                      color: theme.text,
                      backgroundColor: theme.background,
                    },
                  ]}
                  placeholder={cartTotal.toFixed(2)}
                  placeholderTextColor={theme.textSecondary}
                  selectTextOnFocus
                />
                <ThemedText type="smallBold">€</ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Calculadora de cambio"
                  onPress={() => {
                    setIsChangeCalculatorVisible((current) => {
                      const next = !current;
                      if (!next) {
                        setAmountPaidInput('');
                      }
                      return next;
                    });
                  }}
                  style={({ pressed }) => [styles.changeCalculatorButton, pressed && styles.changeCalculatorButtonPressed]}>
                  <MaterialIcons name="calculate" size={17} color={theme.text} />
                </Pressable>
              </View>
            </View>

            {isChangeCalculatorVisible ? (
              <View
                style={[
                  styles.changeCalculatorPanel,
                  { borderColor: theme.backgroundSelected, backgroundColor: theme.background },
                ]}>
                <View style={styles.changeCalculatorInputRow}>
                  <ThemedText type="smallBold">Me pagan</ThemedText>
                  <View style={styles.totalInputWrap}>
                    <TextInput
                      value={amountPaidInput}
                      onChangeText={setAmountPaidInput}
                      keyboardType="numeric"
                      inputMode="numeric"
                      style={[
                        styles.totalInput,
                        styles.changeInput,
                        {
                          borderColor: theme.backgroundSelected,
                          color: theme.text,
                          backgroundColor: theme.background,
                        },
                      ]}
                      placeholder={checkoutTotalInput.trim() || cartTotal.toFixed(2)}
                      placeholderTextColor={theme.textSecondary}
                      selectTextOnFocus
                    />
                    <ThemedText type="smallBold">€</ThemedText>
                  </View>
                </View>

                {changeDue !== null ? (
                  <ThemedText
                    type="smallBold"
                    style={[
                      styles.changeResult,
                      { color: changeDue >= 0 ? '#166534' : '#991b1b' },
                    ]}>
                    {changeDue >= 0
                      ? `Devolver: ${formatCurrency(changeDue)}`
                      : `Falta: ${formatCurrency(Math.abs(changeDue))}`}
                  </ThemedText>
                ) : (
                  <ThemedText themeColor="textSecondary" style={styles.changeResultHint}>
                    Introduce un total valido y el importe recibido.
                  </ThemedText>
                )}

                {changeDue !== null && changeDue > 0 ? (
                  <View style={styles.changeSuggestionWrap}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.changeSuggestionTitle}>
                      Sugerencia de cambio
                    </ThemedText>
                    {changeBreakdown.parts.length > 0 ? (
                      <View style={styles.changePiecesRow}>
                        {changeBreakdown.parts.map((part) => (
                          <View
                            key={String(part.denomination.cents)}
                            style={styles.changePieceGroup}>
                            {part.count > 1 ? (
                              <ThemedText themeColor="textSecondary" style={styles.changePieceCount}>
                                x{part.count}
                              </ThemedText>
                            ) : null}
                            <View
                              style={[
                                styles.changePiece,
                                part.denomination.shape === 'bill' ? styles.changeBillPiece : styles.changeCoinPiece,
                                part.denomination.shape === 'coin'
                                  ? {
                                      width: part.denomination.coinSize,
                                      height: part.denomination.coinSize,
                                      borderRadius: (part.denomination.coinSize ?? 24) / 2,
                                    }
                                  : null,
                                { backgroundColor: part.denomination.color },
                              ]}>
                              <ThemedText style={[styles.changePieceLabel, { color: part.denomination.textColor }]}> 
                                {part.denomination.label}
                              </ThemedText>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {changeBreakdown.remainderCents > 0 ? (
                      <ThemedText themeColor="textSecondary" style={styles.changeSuggestionRemainder}>
                        Resto no cubierto con estas denominaciones: {formatCurrency(changeBreakdown.remainderCents / 100)}
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.checkoutActionsRow}>
              <ActionButton
                label="Cerrar"
                variant="secondary"
                onPress={handleCloseCheckoutModal}
                style={styles.checkoutActionButton}
              />

              <ActionButton
                label="Completar compra"
                variant="success"
                onPress={handleCompletePurchase}
                style={styles.checkoutActionButton}
              />
            </View>
            </ThemedView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={hasActiveEvent && selectedProduct !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedProductId(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedProductId(null)}>
          <Pressable onPress={() => {}}>
            <ThemedView type="backgroundElement" style={styles.modalCard}>
            {selectedProduct ? (
              <>
                <ThemedText numberOfLines={2} type="smallBold">{selectedProduct.name}</ThemedText>
                <ThemedText themeColor="textSecondary">{formatCurrency(selectedProduct.price)}</ThemedText>

                <View style={styles.quantityModalRow}>
                  <Pressable
                    onPress={() => handleQuantityChange(selectedProduct.id, -1)}
                    style={({ pressed }) => [
                      styles.quantityModalButton,
                      (pressed || (cartQuantities[selectedProduct.id] ?? 0) === 0) && styles.actionButtonPressed,
                    ]}
                    disabled={(cartQuantities[selectedProduct.id] ?? 0) === 0}>
                    <MaterialIcons name="remove" size={22} color={theme.text} />
                  </Pressable>

                  <ThemedText type="title" style={styles.quantityModalValue}>
                    {cartQuantities[selectedProduct.id] ?? 0}
                  </ThemedText>

                  <Pressable
                    onPress={() => handleQuantityChange(selectedProduct.id, 1)}
                    style={({ pressed }) => [styles.quantityModalButton, pressed && styles.actionButtonPressed]}>
                    <MaterialIcons name="add" size={22} color={theme.text} />
                  </Pressable>
                </View>

                <View style={styles.quantityModalActionsRow}>
                  <ActionButton
                    label="Quitar todos"
                    variant="danger"
                    onPress={() => {
                      setCartQuantities((current) => {
                        const next = { ...current };
                        delete next[selectedProduct.id];
                        return next;
                      });
                    }}
                    disabled={(cartQuantities[selectedProduct.id] ?? 0) === 0}
                    style={styles.quantityModalActionButton}
                  />

                  <ActionButton
                    label="Cerrar"
                    variant="secondary"
                    onPress={() => setSelectedProductId(null)}
                    style={styles.quantityModalActionButton}
                  />
                </View>
              </>
            ) : null}
            </ThemedView>
          </Pressable>
        </Pressable>
      </Modal>

      <SafeAreaView style={styles.safeArea}>
        {!hasActiveEvent ? (
          <ThemedView
            type="backgroundElement"
            style={[styles.emptyStateCard, { borderColor: theme.backgroundSelected }]}
          >
            <View style={[styles.emptyStateIconWrap, { backgroundColor: theme.backgroundSelected }]}>
              <MaterialIcons name="event-busy" size={28} color={theme.textSecondary} />
            </View>
            <ThemedText type="subtitle" style={styles.emptyStateTitle}>No hay un evento activo</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.emptyStateDescription}>
              Selecciona o crea un evento para empezar a registrar ventas.
            </ThemedText>
            <ActionButton label="Ir a eventos" variant="accent" onPress={() => router.push('/eventos')} />
          </ThemedView>
        ) : (
          <>
            <View style={styles.actionsRow}>
              <ActionButton
                label="Vaciar carro"
                variant="danger"
                onPress={handleClearCart}
                disabled={cartUnits === 0}
                leftIcon={<MaterialIcons name="delete-outline" size={18} color="#7f1d1d" />}
                style={styles.actionButton}
              />

              <ActionButton
                label="Revisar compra"
                variant="success"
                onPress={handleOpenCheckout}
                leftIcon={<MaterialIcons name="point-of-sale" size={18} color="#184b25" />}
                style={styles.actionButton}
              />
            </View>

            <View style={styles.filtersRow}>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Buscar producto"
                placeholderTextColor={theme.textSecondary}
                style={[styles.searchInput, { backgroundColor: theme.backgroundSelected, color: theme.text }]}
              />

              <View style={[styles.categoryPickerContainer, { backgroundColor: theme.backgroundSelected }]}>
                <Picker selectedValue={selectedTag} onValueChange={(value) => setSelectedTag(String(value))}>
                  <Picker.Item label="Todas" value="all" />
                  {tags.map((tag) => (
                    <Picker.Item key={tag} label={tag} value={tag} />
                  ))}
                </Picker>
              </View>
            </View>

            {isLoadingProducts ? <ThemedText>Cargando productos...</ThemedText> : null}
            {productsError ? <ThemedText themeColor="textSecondary">Error: {productsError}</ThemedText> : null}

            {!isLoadingProducts && !productsError ? (
              visibleProducts.length === 0 ? (
                <ThemedText themeColor="textSecondary">No se encontraron productos.</ThemedText>
              ) : (
                <FlatList
                  data={visibleProducts}
                  keyExtractor={(item) => item.id}
                  numColumns={3}
                  contentContainerStyle={styles.productsGrid}
                  style={styles.productsList}
                  renderItem={({ item }) => {
                    const quantity = cartQuantities[item.id] ?? 0;

                    return (
                      <View style={styles.productColumn}>
                        <Pressable
                          onPress={() => handleQuantityChange(item.id, 1)}
                          onLongPress={() => setSelectedProductId(item.id)}
                          delayLongPress={260}
                          style={({ pressed }) => [styles.productCardPressable, pressed && styles.actionButtonPressed]}>
                          <ThemedView
                            type="backgroundElement"
                            style={[styles.productCard, { borderColor: theme.backgroundSelected }]}
                          >
                            {quantity > 0 ? (
                              <View style={styles.quantityBadge}>
                                <ThemedText style={styles.quantityBadgeText}>{quantity}</ThemedText>
                              </View>
                            ) : null}

                            <ThemedText
                              numberOfLines={2}
                              ellipsizeMode="tail"
                              type="smallBold"
                              style={styles.productNameCompact}>
                              {item.name}
                            </ThemedText>
                            <ThemedText themeColor="textSecondary" style={styles.productPriceCompact}>
                              {formatCurrency(item.price)}
                            </ThemedText>
                          </ThemedView>
                        </Pressable>
                      </View>
                    );
                  }}
                />
              )
            ) : null}
          </>
        )}
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
    paddingHorizontal: Spacing.four,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
  emptyStateCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    gap: Spacing.three,
  },
  emptyStateIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateTitle: {
    textAlign: 'center',
  },
  emptyStateDescription: {
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 20,
  },
  changeEventButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  changeEventButtonPressed: {
    opacity: 0.75,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
  },
  actionButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  filtersRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  searchInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  categoryPickerContainer: {
    flex: 1,
    borderRadius: Spacing.two,
    overflow: 'hidden',
    maxHeight: 42,
    justifyContent: 'center',
  },
  productsList: {
    flex: 1,
    minHeight: 0,
  },
  productsGrid: {
    gap: Spacing.one,
    paddingBottom: Spacing.four,
  },
  productColumn: {
    width: '33.333%',
    paddingHorizontal: Spacing.half,
    marginBottom: Spacing.one,
  },
  productCardPressable: {
    width: '100%',
  },
  productCard: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    borderWidth: 1,
    gap: Spacing.half,
    minHeight: 88,
    justifyContent: 'space-between',
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
  },
  quantityBadge: {
    position: 'absolute',
    top: -4,
    right: -3,
    minWidth: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#C62828',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  quantityBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 700,
  },
  productNameCompact: {
    paddingRight: Spacing.one,
    width: '100%',
  },
  productPriceCompact: {
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  checkoutModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.two,
  },
  checkoutModalContainer: {
    width: '100%',
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
    maxHeight: '80%',
  },
  checkoutModalCard: {
    width: '98%',
    maxWidth: 860,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
    height: '86%',
    maxHeight: '86%',
  },
  checkoutTitle: {
    fontSize: 13,
    fontWeight: 600,
  },
  checkoutList: {
    flex: 1,
    minHeight: 0,
  },
  checkoutListContent: {
    gap: Spacing.one,
  },
  checkoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.one,
    borderBottomWidth: 1,
    gap: Spacing.two,
  },
  checkoutNameColumn: {
    flex: 1,
    gap: Spacing.half,
  },
  checkoutProductName: {
    flexShrink: 1,
  },
  checkoutEmptyState: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  checkoutEmptyTitle: {
    textAlign: 'center',
  },
  checkoutEmptyDescription: {
    textAlign: 'center',
  },
  totalRow: {
    marginTop: Spacing.one,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalInput: {
    minHeight: 40,
    minWidth: 120,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: 600,
  },
  totalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  changeCalculatorButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeCalculatorButtonPressed: {
    opacity: 0.6,
  },
  changeCalculatorPanel: {
    marginTop: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  changeCalculatorInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  changeInput: {
    minWidth: 100,
  },
  changeResult: {
    textAlign: 'right',
  },
  changeResultHint: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'right',
  },
  changeSuggestionWrap: {
    marginTop: Spacing.one,
    gap: Spacing.half,
    alignItems: 'flex-end',
  },
  changeSuggestionTitle: {
    textAlign: 'right',
  },
  changePiecesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.one,
  },
  changePieceGroup: {
    alignItems: 'flex-end',
    gap: 2,
  },
  changePieceCount: {
    fontSize: 10,
    lineHeight: 12,
  },
  changePiece: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  changeBillPiece: {
    minWidth: 46,
    height: 22,
    borderRadius: 0,
  },
  changeCoinPiece: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  changePieceLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: 700,
  },
  changeSuggestionRemainder: {
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 16,
  },
  checkoutActionsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
    gap: Spacing.two,
  },
  checkoutActionButton: {
    flex: 1,
    minHeight: 52,
  },
  quantityModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    marginVertical: Spacing.two,
  },
  quantityModalButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D9DDE3',
  },
  quantityModalValue: {
    minWidth: 48,
    textAlign: 'center',
  },
  quantityModalActionsRow: {
    marginTop: Spacing.three,
    flexDirection: 'row',
    justifyContent: "space-evenly",
    gap: Spacing.two,
  },
  quantityModalActionButton: {
    flex: 1,
  },
});
