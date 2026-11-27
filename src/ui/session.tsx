import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { ApiFailure, api, type Me, type UnitMembership } from "./api";

const UNIT_KEY = "linkstead.unit";

type Session = {
  /** `undefined` while the first answer is on its way, `null` when nobody is signed in. */
  me: Me | null | undefined;
  /** The Unit the screens are showing: the remembered one if the account still belongs to it. */
  unit: UnitMembership | null;
  selectUnit: (unitId: number) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

/** localStorage can be absent or refuse (private windows); a remembered unit is only a convenience. */
const readStoredUnit = (): number | null => {
  try {
    const value = Number(localStorage.getItem(UNIT_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [unitId, setUnitId] = useState<number | null>(readStoredUnit);

  const refresh = async () => {
    try {
      setMe(await api.me());
    } catch (error) {
      // Only "not signed in" means signed out. A network failure must not throw someone out.
      if (error instanceof ApiFailure && error.status === 401) {
        setMe(null);
      }
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: asked once, when the page opens
  useEffect(() => {
    refresh();
  }, []);

  const units = me?.units ?? [];
  const unit = units.find((candidate) => candidate.unitId === unitId) ?? units[0] ?? null;

  const selectUnit = (next: number) => {
    setUnitId(next);
    try {
      localStorage.setItem(UNIT_KEY, String(next));
    } catch {
      // Nothing to do: the choice still holds for this visit.
    }
  };

  const signOut = async () => {
    await api.logout().catch(() => undefined);
    setMe(null);
  };

  return <SessionContext value={{ me, refresh, selectUnit, signOut, unit }}>{children}</SessionContext>;
};

const useSession = (): Session => {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useSession needs a SessionProvider above it");
  }
  return session;
};

export { SessionProvider, useSession };
