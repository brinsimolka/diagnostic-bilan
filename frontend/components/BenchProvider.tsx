"use client";
// Charge le référentiel Damodaran une fois et le partage entre les pages
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getBenchmarks, type Benchmarks } from "@/lib/api";

type Ctx = {
  bench: Benchmarks | null;
  loading: boolean;
  error: string;
  reload: (refresh?: boolean) => Promise<void>;
  setBench: (b: Benchmarks) => void;
};

const BenchContext = createContext<Ctx | null>(null);

export function BenchProvider({ children }: { children: React.ReactNode }) {
  const [bench, setBench] = useState<Benchmarks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      setBench(await getBenchmarks(refresh));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return <BenchContext.Provider value={{ bench, loading, error, reload, setBench }}>{children}</BenchContext.Provider>;
}

export function useBench() {
  const c = useContext(BenchContext);
  if (!c) throw new Error("useBench doit être utilisé dans BenchProvider");
  return c;
}
