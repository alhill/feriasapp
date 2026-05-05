import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionButton } from '@/components/ui/action-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { syncCatalogFromFirestore } from '@/lib/catalog-sync';
import type { Product } from '@/models/product';
import { useCacheStore } from '@/stores/cache-store';
import { useNetworkStore } from '@/stores/network-store';

export default function ProductosScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const isOfflineMode = useNetworkStore((state) => state.isOfflineMode);
  const cachedProducts = useCacheStore((s) => s.products);
  const cachedTags = useCacheStore((s) => s.availableTags);
  const setAvailableTags = useCacheStore((s) => s.setAvailableTags);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRightContainerStyle: { paddingRight: Spacing.three },
      headerRight: () => (
        <Pressable
          onPress={() => {
            if (isOfflineMode) {
              Alert.alert('Funcionalidad desactivada en el modo offline');
              return;
            }

            router.push('/producto');
          }}
          style={({ pressed }) => [
            styles.newProductButton,
            (pressed || isOfflineMode) && styles.newProductButtonPressed,
          ]}>
          <MaterialIcons name="add" size={22} color={theme.text} />
        </Pressable>
      ),
    });
  }, [isOfflineMode, navigation, router, theme.text]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'price-asc' | 'price-desc'>('name-asc');
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(true);
  const [isRefreshingProducts, setIsRefreshingProducts] = useState<boolean>(false);
  const [productsError, setProductsError] = useState<string | null>(null);

  React.useEffect(() => {
    setProducts(cachedProducts);
    setTags(cachedTags);
    setSelectedTag((currentTag) => {
      if (currentTag === 'all') {
        return currentTag;
      }

      return cachedTags.includes(currentTag) ? currentTag : 'all';
    });
  }, [cachedProducts, cachedTags]);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('es');
    const filtered = products.filter((product) => {
      const matchesCategory = selectedTag === 'all' || product.tags.includes(selectedTag);
      const matchesName =
        normalizedQuery.length === 0 || product.name.toLocaleLowerCase('es').includes(normalizedQuery);

      return matchesCategory && matchesName;
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name-desc':
          return b.name.localeCompare(a.name, 'es', { sensitivity: 'base' });
        case 'price-asc':
          return a.price - b.price;
        case 'price-desc':
          return b.price - a.price;
        case 'name-asc':
        default:
          return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      }
    });
  }, [products, searchQuery, selectedTag, sortBy]);

  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    setProductsError(null);

    if (isOfflineMode) {
      setIsLoadingProducts(false);
      setIsRefreshingProducts(false);
      return;
    }

    try {
      const { products: nextProducts, tags: nextTags } = await syncCatalogFromFirestore();

      setProducts(nextProducts);
      setTags(nextTags);
      setAvailableTags(nextTags);
      setSelectedTag((currentTag) => {
        if (currentTag && nextTags.includes(currentTag)) {
          return currentTag;
        }

        return 'all';
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron cargar los productos.';
      setProductsError(message);
    } finally {
      setIsLoadingProducts(false);
      setIsRefreshingProducts(false);
    }
  }, [isOfflineMode, setAvailableTags]);

  const handleRetryProducts = useCallback(() => {
    setIsRefreshingProducts(true);
    void loadProducts();
  }, [loadProducts]);

  useFocusEffect(
    useCallback(() => {
      void loadProducts();
    }, [loadProducts])
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={styles.card}>

          {isLoadingProducts ? <ThemedText>Cargando categorias...</ThemedText> : null}
          {!isLoadingProducts && !productsError ? (
            <ThemedView type="backgroundElement" style={styles.filtersRow}>
              <ThemedView type="backgroundSelected" style={styles.smallSelectContainer}>
                <Picker selectedValue={selectedTag} onValueChange={(value) => setSelectedTag(String(value))}>
                  <Picker.Item label="Todas" value="all" />
                  {tags.map((tag) => (
                    <Picker.Item key={tag} label={tag} value={tag} />
                  ))}
                </Picker>
              </ThemedView>

              <ThemedView type="backgroundSelected" style={styles.smallSelectContainer}>
                <Picker selectedValue={sortBy} onValueChange={(value) => setSortBy(String(value) as typeof sortBy)}>
                  <Picker.Item label="Nombre A-Z" value="name-asc" />
                  <Picker.Item label="Nombre Z-A" value="name-desc" />
                  <Picker.Item label="Precio menor" value="price-asc" />
                  <Picker.Item label="Precio mayor" value="price-desc" />
                </Picker>
              </ThemedView>
            </ThemedView>
          ) : null}

          {!isLoadingProducts && !productsError ? (
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar por nombre"
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { backgroundColor: theme.backgroundSelected, color: theme.text }]}
            />
          ) : null}

          {isLoadingProducts ? <ThemedText>Cargando productos...</ThemedText> : null}
          {productsError ? (
            <ThemedView type="backgroundElement" style={styles.errorBlock}>
              <ThemedText themeColor="textSecondary">Error: {productsError}</ThemedText>
              <ActionButton label="Reintentar" size="sm" onPress={handleRetryProducts} style={styles.retryButton} />
            </ThemedView>
          ) : null}

          {!isLoadingProducts && !productsError ? (
            <ThemedView type="backgroundElement" style={styles.tableWrapper}>
              <ThemedView type="backgroundElement" style={[styles.tableHeader, { borderBottomColor: theme.backgroundSelected }]}>
                <ThemedText themeColor="textSecondary" style={styles.nameColumn}>Nombre</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.priceColumn}>Precio</ThemedText>
                <ThemedView type="backgroundElement" style={styles.editColumn} />
              </ThemedView>

              <ScrollView
                style={styles.productsList}
                contentContainerStyle={styles.productsContent}
                refreshControl={
                  <RefreshControl refreshing={isRefreshingProducts} onRefresh={handleRetryProducts} />
                }>
                {visibleProducts.length === 0 ? (
                  <ThemedText themeColor="textSecondary">No hay productos en Firestore.</ThemedText>
                ) : (
                  visibleProducts.map((product) => (
                    <ThemedView type="backgroundElement" key={product.id} style={[styles.productRow, { borderBottomColor: theme.backgroundSelected, borderBottomWidth: 1 }]}>
                      <ThemedText style={styles.nameColumn}>{product.name}</ThemedText>
                      <ThemedText style={styles.priceColumn}>{product.price}</ThemedText>
                      <Pressable
                        onPress={() => {
                          if (isOfflineMode) {
                            Alert.alert('Funcionalidad desactivada en el modo offline');
                            return;
                          }

                          router.push({
                            pathname: '/producto',
                            params: { id: product.id },
                          });
                        }}
                        style={[styles.editButton, isOfflineMode && styles.editButtonDisabled]}>
                        <MaterialIcons name="edit" size={18} color="#6B7280" />
                      </Pressable>
                    </ThemedView>
                  ))
                )}
              </ScrollView>
            </ThemedView>
          ) : null}
        </ThemedView>
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
  card: {
    flex: 1,
    width: '100%',
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  newProductButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newProductButtonPressed: {
    opacity: 0.75,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  smallSelectContainer: {
    flex: 1,
    borderRadius: Spacing.two,
    overflow: 'hidden',
    maxHeight: 42,
    justifyContent: 'center',
  },
  searchInput: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    minHeight: 38,
  },
  tableWrapper: {
    flex: 1,
    minHeight: 0,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
  },
  nameColumn: {
    flex: 1,
  },
  priceColumn: {
    width: 80,
    textAlign: 'right',
  },
  editColumn: {
    width: 60,
    textAlign: 'center',
  },
  editButton: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.one,
  },
  editButtonDisabled: {
    opacity: 0.45,
  },
  productsList: {
    flex: 1,
  },
  productsContent: {
    gap: Spacing.one,
    paddingHorizontal: 0,
  },
  productRow: {
    paddingHorizontal: 0,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorBlock: {
    gap: Spacing.two,
  },
  retryButton: {
    alignSelf: 'flex-start',
  },
});
