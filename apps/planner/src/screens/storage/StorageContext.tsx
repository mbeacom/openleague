/**
 * The storage service for the screens. Screens outside a provider (hosted, and
 * tests that don't need storage) get null and render no storage controls.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { StorageService } from "../../storage/service";

const StorageContext = createContext<StorageService | null>(null);

export function StorageProvider({ service, children }: { service: StorageService; children: ReactNode }) {
    return <StorageContext.Provider value={service}>{children}</StorageContext.Provider>;
}

export function useStorage(): StorageService | null {
    return useContext(StorageContext);
}
