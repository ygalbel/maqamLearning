declare module 'soundfont-player' {
  export interface Player {
    play(
      note: number | string,
      when?: number,
      options?: { gain?: number; duration?: number; detune?: number }
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
