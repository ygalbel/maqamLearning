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

type Lang = {
  code: string;
  label: string;
  dir: "ltr" | "rtl";
  title: string;
  subtitle: string;
  pill: string;
};

const LANGS: Lang[] = [
  {
    code: "en",
    label: "EN",
    dir: "ltr",
    title: "Maqam Notes Player",
    subtitle: "Pick a maqam → choose notes → play with tempo & repeat",
    pill: "Practice every maqam",
  },
  {
    code: "he",
    label: "HE",
    dir: "rtl",
    title: "נגן צלילי מקאם",
    subtitle: "בחר מקאם → בחר תווים → נגן עם טמפו וחזרה",
    pill: "תרגול כל המקאמים",
  },
  {
    code: "ar",
    label: "AR",
    dir: "rtl",
    title: "مشغّل نغمات المقام",
    subtitle: "اختر مقامًا ← انقر النغمات ← اضبط الإيقاع والتكرار",
    pill: "تدرّب على كل المقامات",
  },
];

const SLIDE_FRAMES = 90;

export const Languages: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleEnter = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 90 },
  });

  const idx = Math.min(
    Math.floor(frame / SLIDE_FRAMES),
    LANGS.length - 1,
  );
  const lang = LANGS[idx];
  const localFrame = frame - idx * SLIDE_FRAMES;
  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 16, stiffness: 110 },
  });

  return (
    <Backdrop>
      <AbsoluteFill
        style={{
          padding: "100px 140px",
          flexDirection: "column",
          alignItems: "center",
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
            fontSize: 88,
            textAlign: "center",
          }}
        >
          One app, <span style={{ color: theme.accent }}>three languages</span>
        </div>
        <div
          style={{
            fontFamily: fonts.body,
            color: theme.muted,
            fontSize: 36,
            marginTop: 12,
          }}
        >
          English · עברית · العربية — full RTL support
        </div>

        <div
          style={{
            marginTop: 70,
            display: "flex",
            gap: 18,
            alignItems: "center",
          }}
        >
          {LANGS.map((l, i) => {
            const active = i === idx;
            return (
              <div
                key={l.code}
                style={{
                  padding: "16px 32px",
                  borderRadius: 999,
                  fontFamily: fonts.ui,
                  fontSize: 32,
                  fontWeight: 700,
                  color: active ? theme.ink : theme.muted,
                  background: active ? theme.accentSoft : "transparent",
                  border: `2px solid ${active ? theme.gold : theme.line}`,
                  transform: active ? "scale(1.06)" : "scale(1)",
                  transition: "all 0.3s ease",
                }}
              >
                {l.label}
              </div>
            );
          })}
        </div>

        <Card lang={lang} enter={enter} />
      </AbsoluteFill>
    </Backdrop>
  );
};

const Card: React.FC<{ lang: Lang; enter: number }> = ({ lang, enter }) => {
  return (
    <div
      key={lang.code}
      dir={lang.dir}
      style={{
        marginTop: 70,
        width: "75%",
        padding: "60px 70px",
        borderRadius: 32,
        background: theme.card,
        border: `2px solid ${theme.line}`,
        boxShadow: "0 28px 48px rgba(98,60,18,0.2)",
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px)`,
        textAlign: lang.dir === "rtl" ? "right" : "left",
      }}
    >
      <div
        style={{
          fontFamily: fonts.body,
          fontSize: 80,
          color: theme.ink,
          lineHeight: 1.1,
        }}
      >
        {lang.title}
      </div>
      <div
        style={{
          marginTop: 20,
          fontFamily: fonts.body,
          fontSize: 36,
          color: theme.muted,
          lineHeight: 1.35,
        }}
      >
        {lang.subtitle}
      </div>
      <div
        style={{
          marginTop: 36,
          display: "inline-block",
          padding: "14px 26px",
          borderRadius: 999,
          background: theme.accentSoft,
          border: `2px solid ${theme.gold}`,
          color: theme.woodDark,
          fontFamily: fonts.ui,
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        {lang.pill}
      </div>
    </div>
  );
};
