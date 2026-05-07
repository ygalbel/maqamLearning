import React from "react";
import { Composition } from "remotion";
import { Hero } from "./Hero";
import { ScaleDemo } from "./ScaleDemo";
import { Exercises } from "./Exercises";
import { Languages } from "./Languages";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="Hero"
        component={Hero}
        durationInFrames={FPS * 6}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="ScaleDemo"
        component={ScaleDemo}
        durationInFrames={FPS * 9}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="Exercises"
        component={Exercises}
        durationInFrames={FPS * 8}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="Languages"
        component={Languages}
        durationInFrames={FPS * 9}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
