"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Tema oscuro activo, seguro para hidratación.
 *
 * `resolvedTheme` no existe en el servidor: si un componente renderizado en SSR pinta
 * estilos con él, el HTML del servidor (claro) no coincide con el del cliente (oscuro).
 * Devuelve `false` hasta montar, igual en servidor y primer render, y el valor real después.
 */
export const useIsDarkMode = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted && resolvedTheme === "dark";
};
