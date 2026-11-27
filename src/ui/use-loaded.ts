import { useEffect, useRef, useState } from "react";
import { messageOf } from "./messages";

/**
 * Loads a list for the Unit on screen and reloads when the Unit changes.
 *
 * `data` stays `null` until the first answer for a Unit arrives, so "still loading" and "loaded,
 * and empty" are two states a screen can tell apart. A `reload` keeps showing what was there until
 * the new answer replaces it: emptying it in between would unmount whatever the screen renders
 * from it, and with that lose what the person had just been shown. An answer for a Unit the
 * user has already left is dropped.
 */
const useLoaded = <T, K extends number | string = number>(unitId: K, load: (unitId: K) => Promise<T>) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const loadedFor = useRef<K | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` is the same call on every render; `version` is the reload trigger
  useEffect(() => {
    let current = true;
    if (loadedFor.current !== unitId) {
      setData(null);
    }
    loadedFor.current = unitId;
    setError("");
    load(unitId)
      .then((value) => current && setData(value))
      .catch((failure) => current && setError(messageOf(failure)));
    return () => {
      current = false;
    };
  }, [unitId, version]);

  return { data, error, reload: () => setVersion((value) => value + 1), setData };
};

export { useLoaded };
