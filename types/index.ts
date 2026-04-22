
export interface SrtBlock {
  id: string;
  timestamp: string;
  content: string;
}

export interface ProcessingResult {
  updatedSrt: string;
  mismatches: string[];
}
