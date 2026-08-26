export interface ResolvedProseProfile {
  voiceGuide?: string;
  sampleDirectories: string[];
  sampleFiles: string[];
  warnings: string[];
}

export interface InputManifestEntry {
  originalPath: string;
  bundledPath: string;
}

export interface InputBundle {
  root: string;
  manifestPath: string;
  entries: InputManifestEntry[];
  voiceGuide?: string;
  sampleDirectories: string[];
}

export interface AgyRunResult {
  response: Record<string, unknown>;
  usage: Record<string, unknown>;
  version: string;
  model: string;
  binary: string;
}

export interface ProseResult {
  prose: string;
  consultedSamples: string[];
  warnings: string[];
  assumptions: string[];
}

export interface ReaderResult {
  reader: string;
  reason: string;
}
