import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "./theme";

export const Backdrop: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => {
  const frame = useCurrentFrame();
  const drift = (frame / 8) % 360;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 30% 20%, ${theme.card} 0%, ${theme.parchment} 45%, ${theme.sand} 100%)`,
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          opacity: 0.18,
          backgroundImage: `repeating-linear-gradient(${drift}deg, ${theme.gold} 0 2px, transparent 2px 28px)`,
          mixBlendMode: "multiply",
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 80% 90%, rgba(179,88,42,0.18) 0%, transparent 55%)`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};
