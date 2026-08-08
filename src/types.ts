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
