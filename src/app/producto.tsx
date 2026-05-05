import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    addDoc,
    collection,
    doc,
    getDoc,
    updateDoc,
} from 'firebase/firestore';
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, ToastAndroid, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionButton } from '@/components/ui/action-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { db } from '@/lib/firebase/firestore';
import { parseConfigFromFirestore } from '@/models/app-config';
import { parseProductFromFirestore } from '@/models/product';
import { useCacheStore } from '@/stores/cache-store';
import { useNetworkStore } from '@/stores/network-store';

type ProductFormState = {
  name: string;
  price: string;
  tags: string[];
  active: boolean;
};

const initialFormState: ProductFormState = {
  name: '',
  price: '',
  tags: [],
  active: true,
};

export default function ProductoFormScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const isOfflineMode = useNetworkStore((state) => state.isOfflineMode);
  const params = useLocalSearchParams<{ id?: string }>();
  const productId = typeof params.id === 'string' && params.id.trim().length > 0 ? params.id : null;
  const isEditing = productId !== null;

  const availableTags = useCacheStore((s) => s.availableTags);
  const setAvailableTags = useCacheStore((s) => s.setAvailableTags);

  const [form, setForm] = useState<ProductFormState>(initialFormState);
  const [originalForm, setOriginalForm] = useState<ProductFormState>(initialFormState);
  const [isLoading, setIsLoading] = useState<boolean>(isEditing);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleReset() {
    Alert.alert(
      isEditing ? 'Descartar cambios' : 'Limpiar formulario',
      isEditing
        ? '¿Descartar los cambios y volver al estado original del producto?'
        : '¿Limpiar todos los campos del formulario?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí',
          style: 'destructive',
          onPress: () => {
            setForm(isEditing ? originalForm : initialFormState);
            setErrorMessage(null);
          },
        },
      ]
    );
  }

  function showSuccessFeedback(message: string) {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }

    Alert.alert('Listo', message);
  }

  useEffect(() => {
    if (!isEditing || !productId) {
      setForm(initialFormState);
      setIsLoading(false);
      return;
    }

    const currentProductId = productId;

    let isMounted = true;

    async function loadProduct() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const snapshot = await getDoc(doc(db, 'products', currentProductId));

        if (!snapshot.exists()) {
          throw new Error('No existe un producto con ese id.');
        }

        const product = parseProductFromFirestore(snapshot.id, snapshot.data());

        if (!isMounted) {
          return;
        }

        const loadedForm: ProductFormState = {
          name: product.name,
          price: String(product.price),
          tags: product.tags,
          active: product.active,
        };

        setForm(loadedForm);
        setOriginalForm(loadedForm);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : 'No se pudo cargar el producto.';
        setErrorMessage(message);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadProduct();

    return () => {
      isMounted = false;
    };
  }, [isEditing, productId]);

  useEffect(() => {
    if (availableTags.length > 0) return;

    let isMounted = true;

    async function loadConfig() {
      try {
        const snapshot = await getDoc(doc(db, 'config', '1'));
        if (!snapshot.exists() || !isMounted) return;
        const config = parseConfigFromFirestore(snapshot.id, snapshot.data());
        const sorted = config.tags.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        setAvailableTags(sorted);
      } catch {
        // silently ignore — the picker will show the empty state message
      }
    }

    void loadConfig();
    return () => { isMounted = false; };
  }, [availableTags.length, setAvailableTags]);

  const title = useMemo(() => (isEditing ? 'Editar producto' : 'Nuevo producto'), [isEditing]);

  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  function updateField<K extends keyof ProductFormState>(field: K, value: ProductFormState[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSave() {
    if (isOfflineMode) {
      Alert.alert('Funcionalidad desactivada en el modo offline');
      setErrorMessage('No se pueden crear ni editar productos en modo sin conexion.');
      return;
    }

    const trimmedName = form.name.trim();
    const parsedPrice = Number(form.price.replace(',', '.'));

    if (trimmedName.length === 0) {
      setErrorMessage('El nombre es obligatorio.');
      return;
    }

    if (!Number.isFinite(parsedPrice) || Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setErrorMessage('El precio debe ser un numero valido mayor o igual que 0.');
      return;
    }

    const normalizedTags = form.tags;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      if (isEditing && productId) {
        const payload: Record<string, string | number | boolean | string[]> = {
          name: trimmedName,
          price: parsedPrice,
          active: form.active,
          tags: normalizedTags,
        };

        await updateDoc(doc(db, 'products', productId), payload);
      } else {
        await addDoc(collection(db, 'products'), {
          name: trimmedName,
          price: parsedPrice,
          active: form.active,
          tags: normalizedTags,
        });
      }

      showSuccessFeedback(isEditing ? 'Producto actualizado.' : 'Producto creado.');
      router.replace('/productos');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el producto.';
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={styles.card}>
          {isLoading ? <ThemedText>Cargando producto...</ThemedText> : null}
          {!isLoading ? (
            <ScrollView contentContainerStyle={styles.formContent}>
              <ThemedView type="backgroundElement" style={styles.fieldContainer}>
                <ThemedText type="small" themeColor="textSecondary">
                  Nombre
                </ThemedText>
                <TextInput
                  value={form.name}
                  onChangeText={(value) => updateField('name', value)}
                  placeholder="Nombre del producto"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { backgroundColor: theme.backgroundSelected, color: theme.text }]}
                />
              </ThemedView>

              <ThemedView type="backgroundElement" style={styles.fieldContainer}>
                <ThemedText type="small" themeColor="textSecondary">
                  Precio
                </ThemedText>
                <TextInput
                  value={form.price}
                  onChangeText={(value) => updateField('price', value)}
                  placeholder="0"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="numeric"
                  style={[styles.input, { backgroundColor: theme.backgroundSelected, color: theme.text }]}
                />
              </ThemedView>

              <ThemedView type="backgroundElement" style={styles.fieldContainer}>
                <ThemedText type="small" themeColor="textSecondary">
                  Categorías
                </ThemedText>
                {availableTags.length > 0 ? (
                  <ThemedView type="backgroundSelected" style={styles.pickerWrapper}>
                    <Picker
                      selectedValue=""
                      onValueChange={(value) => {
                        const tag = String(value);
                        if (tag && !form.tags.includes(tag)) {
                          updateField('tags', [...form.tags, tag]);
                        }
                      }}>
                      <Picker.Item label="Seleccionar categoría..." value="" />
                      {availableTags
                        .filter((t) => !form.tags.includes(t))
                        .map((t) => (
                          <Picker.Item key={t} label={t} value={t} />
                        ))}
                    </Picker>
                  </ThemedView>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    No hay categorías disponibles. Carga los productos primero.
                  </ThemedText>
                )}
                {form.tags.length > 0 ? (
                  <View style={styles.tagsRow}>
                    {form.tags.map((tag) => (
                      <TouchableOpacity
                        key={tag}
                        onPress={() => updateField('tags', form.tags.filter((t) => t !== tag))}
                        activeOpacity={0.7}>
                        <View style={styles.tagBadge}>
                          <Text style={styles.tagBadgeText}>{tag}</Text>
                          <Text style={styles.tagBadgeRemove}>✕</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </ThemedView>

              <ThemedView type="backgroundElement" style={styles.fieldContainer}>
                <ThemedText type="small" themeColor="textSecondary">
                  Activo
                </ThemedText>
                <ThemedView type="backgroundSelected" style={styles.pickerWrapper}>
                  <Picker
                    selectedValue={String(form.active)}
                    onValueChange={(value) => updateField('active', String(value) === 'true')}>
                    <Picker.Item label="Si" value="true" />
                    <Picker.Item label="No" value="false" />
                  </Picker>
                </ThemedView>
              </ThemedView>

              {errorMessage ? <ThemedText themeColor="textSecondary">Error: {errorMessage}</ThemedText> : null}
              {isOfflineMode ? (
                <ThemedText themeColor="textSecondary">
                  El modo sin conexion bloquea la creacion y edicion de productos.
                </ThemedText>
              ) : null}

              <View style={styles.actionsRow}>
                <ActionButton label="Resetear" variant="secondary" onPress={handleReset} style={styles.formActionButton} />

                <ActionButton
                  label={isSaving ? 'Guardando...' : 'Guardar'}
                  variant="primary"
                  onPress={handleSave}
                  disabled={isSaving || isOfflineMode}
                  style={styles.formActionButton}
                />
              </View>
            </ScrollView>
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
  formContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  fieldContainer: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    minHeight: 40,
  },
  pickerWrapper: {
    borderRadius: Spacing.two,
    overflow: 'hidden',
    maxHeight: 44,
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.one,
    backgroundColor: 'transparent',
  },
  formActionButton: {
    minWidth: 110,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    gap: 6,
  },
  tagBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  tagBadgeRemove: {
    color: '#9CA3AF',
    fontSize: 11,
  },
});
