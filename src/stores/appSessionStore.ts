import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type AppSessionState = {
  isDeviceConnected: boolean;
  connectDevice: () => void;
  disconnectDevice: () => void;
};

export const useAppSessionStore = create<AppSessionState>()(
  persist(
    (set) => ({
      isDeviceConnected: false,
      connectDevice: () => set({ isDeviceConnected: true }),
      disconnectDevice: () => set({ isDeviceConnected: false }),
    }),
    {
      name: "pengine-device-session",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ isDeviceConnected: state.isDeviceConnected }),
    },
  ),
);
