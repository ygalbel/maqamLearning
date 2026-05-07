import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Backdrop } from "./Backdrop";
import { theme, fonts } from "./theme";

const NOTE_LABELS = ["Rāst", "Dūkāh", "Sīkāh", "Jahārkāh", "Nawā"];

export const Hero: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const titleEnter = spring({
    frame: frame - 6,
    fps,
    config: { damping: 16, stiffness: 90 },
  });
  const subtitleEnter = spring({
    frame: frame - 24,
    fps,
    config: { damping: 18, stiffness: 110 },
  });
  const ctaEnter = spring({
    frame: frame - 48,
    fps,
    config: { damping: 18, stiffness: 110 },
  });

  const titleY = interpolate(titleEnter, [0, 1], [40, 0]);

  return (
    <Backdrop>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          padding: "0 80px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            transform: `translateY(${titleY}px)`,
            opacity: titleEnter,
            fontFamily: fonts.display,
            color: theme.ink,
            fontSize: 168,
            lineHeight: 1.0,
            letterSpacing: 1,
            textShadow: "0 8px 28px rgba(83,49,15,0.18)",
          }}
        >
          Maqām
          <span style={{ color: theme.accent }}> Notes</span> Player
        </div>
        <div
          style={{
            opacity: subtitleEnter,
            transform: `translateY(${interpolate(
              subtitleEnter,
              [0, 1],
              [20, 0],
            )}px)`,
            marginTop: 28,
            fontFamily: fonts.body,
            color: theme.muted,
            fontSize: 44,
          }}
        >
          Explore the modal world of Arabic music — note by note.
        </div>

        <NoteRow frame={frame} fps={fps} />

        <div
          style={{
            opacity: ctaEnter,
            transform: `translateY(${interpolate(
              ctaEnter,
              [0, 1],
              [20, 0],
            )}px)`,
            marginTop: 80,
            display: "flex",
            gap: 28,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Pill primary>Try it free</Pill>
          <Pill>EN · עברית · العربية</Pill>
        </div>
      </AbsoluteFill>
      <Vignette width={width} height={height} />
    </Backdrop>
  );
};

const NoteRow: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  return (
    <div
      style={{
        marginTop: 70,
        display: "flex",
        gap: 22,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {NOTE_LABELS.map((label, i) => {
        const enter = spring({
          frame: frame - (32 + i * 6),
          fps,
          config: { damping: 14, stiffness: 120 },
        });
        const pulse = Math.sin((frame - i * 14) / 8) * 0.04 + 1;
        return (
          <div
            key={label}
            style={{
              width: 180,
              height: 180,
              borderRadius: 28,
              background: `linear-gradient(180deg, #fff4e3, #f6e1c6)`,
              border: `2px solid ${theme.line}`,
              boxShadow: "0 18px 30px rgba(98,60,18,0.18)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: fonts.body,
              color: theme.ink,
              fontSize: 36,
              opacity: enter,
              transform: `translateY(${interpolate(
                enter,
                [0, 1],
                [40, 0],
              )}px) scale(${pulse})`,
            }}
          >
            <div style={{ fontSize: 30, color: theme.muted }}>{i + 1}</div>
            <div style={{ marginTop: 4 }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
};

const Pill: React.FC<{ children: React.ReactNode; primary?: boolean }> = ({
  children,
  primary,
}) => (
  <div
    style={{
      padding: "20px 36px",
      borderRadius: 999,
      fontFamily: fonts.ui,
      fontWeight: 700,
      fontSize: 36,
      color: primary ? "#fff" : theme.ink,
      background: primary
        ? `linear-gradient(180deg, ${theme.accent}, ${theme.goldStrong})`
        : `linear-gradient(180deg, #f7e1c8, #e7bf8b)`,
      border: `2px solid ${primary ? theme.goldStrong : theme.wood}`,
      boxShadow: "0 14px 24px rgba(98,60,18,0.18)",
    }}
  >
    {children}
  </div>
);

const Vignette: React.FC<{ width: number; height: number }> = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background:
        "radial-gradient(circle at 50% 55%, rgba(0,0,0,0) 50%, rgba(50,30,12,0.2) 100%)",
    }}
  />
);
