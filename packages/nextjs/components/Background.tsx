import React from "react";
import { useTheme } from "next-themes";

export const BackGround = () => {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";

  if (!isDarkMode) {
    return <></>;
  }

  return (
    <>
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[70vh] w-[70vh] rounded-full -z-50"
        style={{
          backgroundColor: "rgba(230, 15, 119, 0.33)",
          filter: "blur(254.85px)",
        }}
      />
      <div
        className="absolute top-0 -right-2 -translate-y-1/2 w-[630px] h-[630px] rounded-full -z-50"
        style={{
          backgroundColor: "#224457",
          filter: "blur(164.85px)",
        }}
      />
      <div
        className="absolute top-0 left-0 translate-x-2 -translate-y-1/2 w-[630px] h-[630px] rounded-full -z-50"
        style={{
          backgroundColor: "#252525",
          filter: "blur(274.85px)",
        }}
      />
    </>
  );
};
