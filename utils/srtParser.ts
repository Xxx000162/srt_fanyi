
import { SrtBlock } from '../types';

export const parseSrt = (text: string): SrtBlock[] => {
  const blocks = text.trim().split(/\n\r?\n/);
  return blocks.map((block) => {
    const lines = block.split(/\n\r?/);
    const id = lines[0];
    const timestamp = lines[1];
    const content = lines.slice(2).join('\n');
    return { id, timestamp, content };
  }).filter(b => b.id && b.timestamp);
};

export const serializeSrt = (blocks: SrtBlock[]): string => {
  return blocks.map(b => `${b.id}\n${b.timestamp}\n${b.content}`).join('\n\n');
};
