import { useEffect, useState } from "react";
import { messageOf } from "./messages";

/**
 * Loads a list for the Đơn vị on screen and reloads when the Đơn vị changes.
 *
 * `data` stays `null` until an answer arrives, so "still loading" and "loaded, and empty" are two
 * states a screen can tell apart. An answer for a Đơn vị the user has already left is dropped.
 */
const useLoaded = <T>(unitId: number, load: (unitId: number) => Promise<T>) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` is the same call on every render; `version` is the reload trigger
  useEffect(() => {
    let current = true;
    setData(null);
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
