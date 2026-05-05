import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addDoc, collection, doc, getDoc, Timestamp } from 'firebase/firestore';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionButton } from '@/components/ui/action-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { syncCatalogFromFirestore } from '@/lib/catalog-sync';
import { db } from '@/lib/firebase/firestore';
import { syncSalesForEventFromFirestore } from '@/lib/sales-sync';
import { useCacheStore } from '@/stores/cache-store';
import { useNetworkStore } from '@/stores/network-store';
import { useSessionStore } from '@/stores/session-store';
import { useNavigation } from '@react-navigation/native';

type EventPreview = {
  id: string;
  name: string;
  dateLabel: string;
};

type FirestoreTimestampLike = {
  toDate: () => Date;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
}

export default function EventosScreen() {
  const navigation = useNavigation();
  const theme = useTheme();
  const isOfflineMode = useNetworkStore((state) => state.isOfflineMode);
  const cachedEvents = useCacheStore((state) => state.events);
  const sessionId = useSessionStore((state) => state.sessionId);
  const setSessionId = useSessionStore((state) => state.setSessionId);
  const [events, setEvents] = useState<EventPreview[]>(cachedEvents);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [activeEventName, setActiveEventName] = useState<string>('sin seleccionar');

  const [showNewEventModal, setShowNewEventModal] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventDate, setNewEventDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [newEventError, setNewEventError] = useState<string | null>(null);

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

            setNewEventName('');
            setNewEventDate(new Date());
            setNewEventError(null);
            setShowNewEventModal(true);
          }}
          style={({ pressed }) => [
            styles.newEventButton,
            (pressed || isOfflineMode) && styles.newEventButtonPressed,
          ]}>
          <MaterialIcons name="add" size={22} color={theme.text} />
        </Pressable>
      ),
    });
  }, [isOfflineMode, navigation, theme.text]);

  useEffect(() => {
    setEvents(cachedEvents);
    setIsLoading(false);
  }, [cachedEvents]);

  useEffect(() => {
    let isMounted = true;

    async function loadActiveEventName() {
      if (!sessionId) {
        if (isMounted) {
          setActiveEventName('sin seleccionar');
        }
        return;
      }

      const loadedEvent = events.find((eventItem) => eventItem.id === sessionId);

      if (loadedEvent) {
        if (isMounted) {
          setActiveEventName(loadedEvent.name);
        }
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, 'events', sessionId));

        if (!isMounted) {
          return;
        }

        if (!snapshot.exists()) {
          setActiveEventName('sin seleccionar');
          return;
        }

        const data = snapshot.data();
        const objectData = isObject(data) ? data : {};
        setActiveEventName(toText(objectData.name, '(sin nombre)'));
      } catch {
        if (isMounted) {
          setActiveEventName(`id ${sessionId.slice(0, 8)}...`);
        }
      }
    }

    void loadActiveEventName();

    return () => {
      isMounted = false;
    };
  }, [events, sessionId]);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      if (isOfflineMode) {
        if (isMounted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
        return;
      }

      try {
        setEventsError(null);
        const { events: nextEvents } = await syncCatalogFromFirestore();

        if (!isMounted) {
          return;
        }

        setEvents(nextEvents);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : 'No se pudo listar la coleccion /events.';
        setEventsError(message);
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    void loadEvents();

    return () => {
      isMounted = false;
    };
  }, [isOfflineMode, isRefreshing]);

  function handleRetryInitialLoad() {
    setIsLoading(true);
    setIsRefreshing((value) => !value);
  }

  async function handleCreateEvent() {
    if (isOfflineMode) {
      Alert.alert('Funcionalidad desactivada en el modo offline');
      setNewEventError('No se pueden crear eventos en modo sin conexion.');
      return;
    }

    const trimmedName = newEventName.trim();
    if (trimmedName.length === 0) {
      setNewEventError('El nombre es obligatorio.');
      return;
    }

    const parsedDate = newEventDate;

    setIsSavingEvent(true);
    setNewEventError(null);

    try {
      const docRef = await addDoc(collection(db, 'events'), {
        name: trimmedName,
        date: Timestamp.fromDate(parsedDate),
      });

      const newPreview: EventPreview = {
        id: docRef.id,
        name: trimmedName,
        dateLabel: parsedDate.toLocaleDateString('es-ES'),
      };

      setEvents((current) => [newPreview, ...current]);
      void syncCatalogFromFirestore();
      setShowNewEventModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear el evento.';
      setNewEventError(message);
    } finally {
      setIsSavingEvent(false);
    }
  }

  function handleSelectEvent(eventItem: EventPreview) {
    Alert.alert('Marcar evento activo', `Quieres marcar "${eventItem.name}" como activo?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Marcar',
        onPress: () => {
          setSessionId(eventItem.id);

          if (!isOfflineMode) {
            void syncSalesForEventFromFirestore(eventItem.id);
          }
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <Modal
        visible={showNewEventModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewEventModal(false)}>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="subtitle">Nuevo evento</ThemedText>

            <ThemedView type="backgroundElement" style={styles.modalField}>
              <ThemedText type="small" themeColor="textSecondary">Nombre</ThemedText>
              <TextInput
                value={newEventName}
                onChangeText={setNewEventName}
                placeholder="Feria de mayo"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { backgroundColor: theme.backgroundSelected, color: theme.text }]}
              />
            </ThemedView>

            <ThemedView type="backgroundElement" style={styles.modalField}>
              <ThemedText type="small" themeColor="textSecondary">Fecha</ThemedText>
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}>
                <View style={[styles.input, styles.dateButton, { backgroundColor: theme.backgroundSelected }]}>
                  <Text style={{ color: theme.text }}>{newEventDate.toLocaleDateString('es-ES')}</Text>
                  <MaterialIcons name="calendar-today" size={16} color={theme.textSecondary} />
                </View>
              </TouchableOpacity>
              {showDatePicker ? (
                <DateTimePicker
                  value={newEventDate}
                  mode="date"
                  display="default"
                  onChange={(_event, selected) => {
                    setShowDatePicker(false);
                    if (selected) setNewEventDate(selected);
                  }}
                />
              ) : null}
            </ThemedView>

            {newEventError ? <ThemedText themeColor="textSecondary">Error: {newEventError}</ThemedText> : null}

            <View style={styles.modalActions}>
              <ActionButton label="Cancelar" variant="secondary" onPress={() => setShowNewEventModal(false)} style={styles.modalActionButton} />
              <ActionButton
                label={isSavingEvent ? 'Guardando...' : 'Crear'}
                variant="primary"
                onPress={handleCreateEvent}
                disabled={isSavingEvent || isOfflineMode}
                style={styles.modalActionButton}
              />
            </View>
          </ThemedView>
        </View>
      </Modal>

      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.activeEventRow}>
            <ThemedText themeColor="textSecondary">Evento activo: {activeEventName}</ThemedText>
            {sessionId ? (
              <ActionButton label="Quitar" variant="warning" size="sm" onPress={() => setSessionId(null)} />
            ) : null}
          </View>
        </ThemedView>

        <ThemedView type="backgroundElement" style={[styles.card, styles.listCard]}>
          {isLoading ? <ThemedText>Cargando eventos...</ThemedText> : null}
          {eventsError ? (
            <View style={styles.errorBlock}>
              <ThemedText themeColor="textSecondary">Error: {eventsError}</ThemedText>
              <ActionButton label="Reintentar" size="sm" onPress={handleRetryInitialLoad} style={styles.retryButton} />
            </View>
          ) : null}

          {!isLoading && !eventsError ? (
            events.length === 0 ? (
              <ThemedText themeColor="textSecondary">No hay documentos en /events.</ThemedText>
            ) : (
              <FlatList
                data={events}
                keyExtractor={(item) => item.id}
                numColumns={2}
                columnWrapperStyle={styles.columnWrapper}
                contentContainerStyle={styles.listContent}
                refreshControl={
                  <RefreshControl refreshing={isLoading || isRefreshing} onRefresh={handleRetryInitialLoad} />
                }
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleSelectEvent(item)}
                    style={styles.eventCardPressable}>
                    <ThemedView
                      style={[
                        styles.eventCard,
                        item.id === sessionId ? styles.eventCardSelected : null,
                      ]}>
                      {item.id === sessionId ? (
                        <View style={styles.activeBadge}>
                          <Text style={styles.activeBadgeText}>Activo</Text>
                        </View>
                      ) : null}
                      <ThemedText>{item.name}</ThemedText>
                      <ThemedText themeColor="textSecondary">{item.dateLabel}</ThemedText>
                    </ThemedView>
                  </Pressable>
                )}
              />
            )
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
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    justifyContent: 'flex-start',
    gap: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
  card: {
    width: '100%',
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,

  },
  activeEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  listCard: {
    flex: 1,
    minHeight: 0,
  },
  columnWrapper: {
    gap: Spacing.two,
  },
  listContent: {
    paddingVertical: Spacing.one,
    gap: Spacing.two,
  },
  eventCard: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    minHeight: 90,
    gap: Spacing.one,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  eventCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#E8F0FF',
  },
  eventCardPressable: {
    flex: 1,
  },
  activeBadge: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    backgroundColor: '#2563EB',
  },
  activeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  errorBlock: {
    gap: Spacing.two,
  },
  retryButton: {
    alignSelf: 'flex-start',
  },
  newEventButton: {
    padding: Spacing.one,
    borderRadius: Spacing.two,
  },
  newEventButtonPressed: {
    opacity: 0.6,
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
    gap: Spacing.three,
  },
  modalField: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    minHeight: 40,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  modalActionButton: {
    minWidth: 110,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
