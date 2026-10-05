"use client";

import { useEffect, useState } from "react";
import {
  defaultSiteConfig,
  subscribeSiteConfig,
  type SiteConfig,
} from "~~/services/firebase/site";

/** Config de landing/Telegram desde Firebase RTDB, con fallback local. */
export function useSiteConfig() {
  const [config, setConfig] = useState<SiteConfig>(() => defaultSiteConfig());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return subscribeSiteConfig(c => {
      setConfig(c);
      setReady(true);
    });
  }, []);

  return { config, ready };
}
