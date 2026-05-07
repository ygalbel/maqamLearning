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

// Maqam Rast ascending scale, mirrored from maqam-compact.json
const SCALE = [
  { name: "C", suffix: "4", interval: "Tonic" },
  { name: "D", suffix: "4", interval: "Whole" },
  { name: "E", suffix: "♭½", interval: "3/4 tone" },
  { name: "F", suffix: "4", interval: "Half" },
  { name: "G", suffix: "4", interval: "Whole" },
  { name: "A", suffix: "4", interval: "Whole" },
  { name: "B", suffix: "♭½", interval: "3/4 tone" },
  { name: "C", suffix: "5", interval: "Octave" },
];

const STEP_FRAMES = 16;
const HOLD_FRAMES = 24;

export const ScaleDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleEnter = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 90 },
  });

  // Step playback: ascending then descending
  const totalSteps = SCALE.length * 2 - 1; // up + down without repeating top
  const cycleLength = totalSteps * STEP_FRAMES;
  const playbackFrame = Math.max(0, frame - 24);
  const rawIndex = Math.floor(playbackFrame / STEP_FRAMES);
  const stepIndex = Math.min(rawIndex, totalSteps - 1);
  const activeIdx =
    stepIndex < SCALE.length
      ? stepIndex
      : SCALE.length - 1 - (stepIndex - (SCALE.length - 1));

  const outroOpacity = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames - 5],
    [1, 0.2],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" },
  );

  return (
    <Backdrop>
      <AbsoluteFill
        style={{
          padding: "100px 120px",
          flexDirection: "column",
          alignItems: "center",
          opacity: outroOpacity,
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
            fontSize: 96,
          }}
        >
          Maqām <span style={{ color: theme.accent }}>Rāst</span>
        </div>
        <div
          style={{
            fontFamily: fonts.body,
            color: theme.muted,
            fontSize: 38,
            marginTop: 8,
          }}
        >
          Ascending and descending — every microtone heard in context
        </div>

        <div
          style={{
            marginTop: 80,
            display: "grid",
            gridTemplateColumns: `repeat(${SCALE.length}, 1fr)`,
            gap: 22,
            width: "100%",
          }}
        >
          {SCALE.map((note, i) => {
            const isActive = i === activeIdx && playbackFrame >= 0;
            const isPast = i < activeIdx;
            const popEnter = spring({
              frame: frame - (10 + i * 4),
              fps,
              config: { damping: 16, stiffness: 110 },
            });
            const activePulse = isActive
              ? 1 + Math.sin((frame % STEP_FRAMES) / STEP_FRAMES * Math.PI) * 0.06
              : 1;
            return (
              <div
                key={i}
                style={{
                  height: 240,
                  borderRadius: 24,
                  background: isActive
                    ? `linear-gradient(180deg, #fff0da, #f0cda0)`
                    : `linear-gradient(180deg, #fff4e3, #f6e1c6)`,
                  border: `2px solid ${
                    isActive ? theme.accent : isPast ? theme.gold : theme.line
                  }`,
                  boxShadow: isActive
                    ? `0 0 0 8px rgba(211,165,91,0.35), 0 18px 30px rgba(98,60,18,0.22)`
                    : `0 14px 24px rgba(98,60,18,0.14)`,
                  transform: `translateY(${interpolate(
                    popEnter,
                    [0, 1],
                    [40, 0],
                  )}px) scale(${activePulse})`,
                  opacity: popEnter,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 18,
                }}
              >
                <div
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 80,
                    color: theme.ink,
                    lineHeight: 1,
                  }}
                >
                  {note.name}
                  <span style={{ fontSize: 36, color: theme.muted }}>
                    {note.suffix}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    fontFamily: fonts.ui,
                    fontSize: 24,
                    color: isActive ? theme.accent : theme.muted,
                  }}
                >
                  {note.interval}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontFamily: fonts.ui,
                    fontSize: 20,
                    color: theme.muted,
                  }}
                >
                  {i + 1}
                </div>
              </div>
            );
          })}
        </div>

        <Waveform frame={frame} active={activeIdx} fps={fps} cycleLength={cycleLength} />
      </AbsoluteFill>
    </Backdrop>
  );
};

const Waveform: React.FC<{
  frame: number;
  active: number;
  fps: number;
  cycleLength: number;
}> = ({ frame, active }) => {
  const bars = 64;
  return (
    <div
      style={{
        marginTop: 72,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        height: 90,
        width: "80%",
      }}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const amp =
          0.3 +
          0.7 *
            Math.abs(
              Math.sin(
                (frame / 4 + i * 0.4 + active * 0.6) * 0.7,
              ),
            );
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${amp * 100}%`,
              borderRadius: 4,
              background: `linear-gradient(180deg, ${theme.gold}, ${theme.accent})`,
              opacity: 0.85,
            }}
          />
        );
      })}
    </div>
  );
};
