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

const PATTERN = [1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 8];
const STEP_FRAMES = 12;

const TRACKS = [
  { label: "Five-note scale", pattern: [1, 2, 3, 2, 1] },
  { label: "Broken thirds", pattern: [1, 3, 2, 4, 3, 5, 4, 6] },
  { label: "Octave leap", pattern: [1, 8, 7, 6, 5, 4, 3, 2, 1] },
];

export const Exercises: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleEnter = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 90 },
  });

  const playbackFrame = Math.max(0, frame - 22);
  const stepIndex = Math.min(
    Math.floor(playbackFrame / STEP_FRAMES),
    PATTERN.length - 1,
  );
  const activeNote = PATTERN[stepIndex];

  const fade = interpolate(
    frame,
    [durationInFrames - 24, durationInFrames - 4],
    [1, 0.3],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" },
  );

  return (
    <Backdrop>
      <AbsoluteFill
        style={{
          padding: "100px 140px",
          flexDirection: "column",
          opacity: fade,
        }}
      >
        <div
          style={{
            opacity: titleEnter,
            transform: `translateY(${interpolate(
              titleEnter,
              [0, 1],
              [-20, 0],
            )}px)`,
            fontFamily: fonts.display,
            color: theme.ink,
            fontSize: 92,
          }}
        >
          Practice with{" "}
          <span style={{ color: theme.accent }}>guided exercises</span>
        </div>
        <div
          style={{
            fontFamily: fonts.body,
            color: theme.muted,
            fontSize: 36,
            marginTop: 12,
          }}
        >
          Five-note runs, broken thirds, octave leaps — at your tempo.
        </div>

        <div
          style={{
            marginTop: 70,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 60,
            alignItems: "center",
          }}
        >
          <NoteGrid activeNote={activeNote} frame={frame} fps={fps} />

          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {TRACKS.map((track, i) => (
              <TrackCard
                key={track.label}
                label={track.label}
                pattern={track.pattern}
                frame={frame}
                fps={fps}
                delay={20 + i * 14}
              />
            ))}
          </div>
        </div>

        <Tempo frame={frame} />
      </AbsoluteFill>
    </Backdrop>
  );
};

const NoteGrid: React.FC<{ activeNote: number; frame: number; fps: number }> = ({
  activeNote,
  frame,
  fps,
}) => {
  return (
    <div
      style={{
        background: "rgba(255,248,238,0.7)",
        border: `2px solid ${theme.line}`,
        borderRadius: 28,
        padding: 28,
        boxShadow: "0 24px 36px rgba(98,60,18,0.18)",
      }}
    >
      <div
        style={{
          fontFamily: fonts.ui,
          color: theme.muted,
          fontSize: 24,
          marginBottom: 16,
        }}
      >
        Maqām Bayāti — Lower Jins
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}
      >
        {Array.from({ length: 8 }).map((_, idx) => {
          const i = idx + 1;
          const isActive = i === activeNote;
          const enter = spring({
            frame: frame - (8 + idx * 3),
            fps,
            config: { damping: 14, stiffness: 110 },
          });
          return (
            <div
              key={i}
              style={{
                height: 110,
                borderRadius: 18,
                background: isActive
                  ? `linear-gradient(180deg, #fff0da, #f0cda0)`
                  : `linear-gradient(180deg, #fff4e3, #f6e1c6)`,
                border: `2px solid ${isActive ? theme.accent : theme.line}`,
                boxShadow: isActive
                  ? `0 0 0 6px rgba(211,165,91,0.35)`
                  : "none",
                transform: `scale(${enter})`,
                opacity: enter,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: fonts.body,
                fontSize: 44,
                color: theme.ink,
              }}
            >
              {i}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TrackCard: React.FC<{
  label: string;
  pattern: number[];
  frame: number;
  fps: number;
  delay: number;
}> = ({ label, pattern, frame, fps, delay }) => {
  const enter = spring({
    frame: frame - delay,
    fps,
    config: { damping: 16, stiffness: 100 },
  });
  const localStep = Math.floor(((frame - delay) / 8) % pattern.length);
  return (
    <div
      style={{
        opacity: enter,
        transform: `translateX(${interpolate(enter, [0, 1], [40, 0])}px)`,
        background: theme.card,
        border: `2px solid ${theme.line}`,
        borderRadius: 22,
        padding: "22px 28px",
        boxShadow: "0 14px 24px rgba(98,60,18,0.12)",
      }}
    >
      <div
        style={{
          fontFamily: fonts.ui,
          color: theme.ink,
          fontSize: 30,
          fontWeight: 700,
          marginBottom: 12,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {pattern.map((n, i) => {
          const active = i === localStep && frame > delay;
          return (
            <div
              key={i}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                fontFamily: fonts.ui,
                fontSize: 22,
                background: active ? theme.accentSoft : "#fff4e3",
                border: `1px solid ${active ? theme.accent : theme.line}`,
                color: active ? theme.ink : theme.muted,
              }}
            >
              {n}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Tempo: React.FC<{ frame: number }> = ({ frame }) => {
  const bpm = 92 + Math.round(Math.sin(frame / 22) * 8);
  return (
    <div
      style={{
        marginTop: 60,
        display: "flex",
        gap: 24,
        alignItems: "center",
        fontFamily: fonts.ui,
        fontSize: 26,
        color: theme.muted,
      }}
    >
      <Tag>♩ = {bpm} BPM</Tag>
      <Tag>Loop on</Tag>
      <Tag>Soundfont: Nylon Guitar</Tag>
    </div>
  );
};

const Tag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      padding: "10px 18px",
      borderRadius: 999,
      background: "#fff4e3",
      border: `1px solid ${theme.wood}`,
      color: theme.ink,
      fontWeight: 600,
    }}
  >
    {children}
  </div>
);
