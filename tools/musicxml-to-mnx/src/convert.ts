import { getMNXScore, getScoreFromMusicXml } from 'mnxconverter';

export function convert(musicXml: string): unknown {
  const score = getScoreFromMusicXml(musicXml);
  return getMNXScore(score);
}
