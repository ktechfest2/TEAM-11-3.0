"use client";
import { useEffect, useRef, useState } from "react";
import { onChange } from "@/lib/db";

/** Run an async IndexedDB query and re-run it whenever one of `stores` changes (or `deps` change). */
export function useLiveQuery(query, stores, deps = []) {
  const [data, setData] = useState(undefined);
  const queryRef = useRef(query);
  useEffect(() => { queryRef.current = query; });
  const key = JSON.stringify(deps);
  const storesKey = (stores || []).join(",");
  useEffect(() => {
    let live = true;
    const run = () => queryRef.current().then((v) => live && setData(v)).catch((e) => { console.error(e); if (live) setData(null); });
    run();
    const off = onChange(({ store }) => { if (!storesKey || storesKey.split(",").includes(store)) run(); });
    return () => { live = false; off(); };
  }, [key, storesKey]);
  return data;
}
