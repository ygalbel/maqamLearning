declare module 'soundfont-player' {
  export interface Player {
    play(
      note: number | string,
      when?: number,
      // `cents` detunes the sample via playbackRate (used for quarter-tones).
      options?: { gain?: number; duration?: number; cents?: number }
    ): unknown;
  }
  export interface InstrumentOptions {
    soundfont?: string;
    format?: string;
    baseUrl?: string;
    destination?: AudioNode;
  }
  const Soundfont: {
    instrument(
      ac: AudioContext,
      name: string,
      options?: InstrumentOptions
    ): Promise<Player>;
  };
  export default Soundfont;
}
