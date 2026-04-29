import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type SessionState = {
  sessionId: string | null;
  recentEventIds: string[];
  setSessionId: (id: string | null) => void;
  pushRecentEventId: (eventId: string) => void;
  clearSession: () => void;
};

const MAX_RECENT_EVENTS = 40;

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      sessionId: null,
      recentEventIds: [],
      setSessionId: (id) => set({ sessionId: id }),
      pushRecentEventId: (eventId) =>
        set((state) => {
          const unique = state.recentEventIds.filter((id) => id !== eventId);
          return {
            recentEventIds: [eventId, ...unique].slice(0, MAX_RECENT_EVENTS),
          };
        }),
      clearSession: () => set({ sessionId: null, recentEventIds: [] }),
    }),
    {
      name: 'crux-session-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
