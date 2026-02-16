export interface TranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
}

export interface Transcript {
  language: string;
  text: string;
  segments: TranscriptSegment[];
}

export interface Chapter {
  title: string;
  startSec: number;
  endSec: number;
}

export interface MetadataResult {
  title: string;
  summary: string;
  tags: string[];
  speakers: string[];
  topics: string[];
}

export interface EmbeddingVector {
  id: string;
  values: number[];
  text: string;
}

export interface TranslationResult {
  language: string;
  text: string;
  segments?: TranscriptSegment[];
  subtitleOrigin?: 'ai-raw' | 'ai-processed' | 'ai-human' | 'human';
}
