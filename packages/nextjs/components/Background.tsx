"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export const BackGround = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Evita mismatch SSR/cliente (theme aún no resuelto en el server)
  if (!mounted || resolvedTheme !== "dark") {
    return null;
  }

  return (
    <>
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[70vh] w-[70vh] rounded-full -z-50"
        style={{
          backgroundColor: "rgba(244, 116, 52, 0.22)",
          filter: "blur(254.85px)",
        }}
      />
      <div
        className="absolute top-0 -right-2 -translate-y-1/2 w-[630px] h-[630px] rounded-full -z-50"
        style={{
          backgroundColor: "#182548",
          filter: "blur(164.85px)",
        }}
      />
      <div
        className="absolute top-0 left-0 translate-x-2 -translate-y-1/2 w-[630px] h-[630px] rounded-full -z-50"
        style={{
          backgroundColor: "#0d1635",
          filter: "blur(274.85px)",
        }}
      />
    </>
  );
};
