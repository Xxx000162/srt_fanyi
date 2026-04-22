
import { GoogleGenAI, Type } from "@google/genai";
import { SrtBlock, ProcessingResult } from "../types";

export class SubtitleAlignmentService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async alignSubtitles(
    srtBlocks: SrtBlock[], 
    referenceText: string,
    onProgress: (chunkText: string) => void
  ): Promise<ProcessingResult> {
    const srtData = srtBlocks.map(b => ({ id: b.id, english: b.content }));
    
    const prompt = `
    You are a professional subtitle translation assistant.
    Your task is to merge Chinese translations from the provided reference text into the SRT segments.
    
    REFERENCE BILINGUAL TEXT:
    """
    ${referenceText}
    """
    
    SRT ENGLISH SEGMENTS:
    ${JSON.stringify(srtData, null, 2)}
    
    RULES:
    1. STRICT CONSISTENCY: Use the Chinese text from the reference text verbatim. No polishing.
    2. FORMAT: For each segment, place the Chinese translation (with all punctuation replaced by spaces) on its own line, followed by a REAL newline character, and then the original English text.
    3. SEGMENT SPLITTING: If a long Chinese sentence in the reference text corresponds to multiple English segments, split the Chinese text at natural "breath points" (pauses or logical breaks) to match the meaning and timing of each English segment.
    4. NO DUPLICATION: Ensure that the Chinese translation is distributed across segments without repeating the same phrases or sentences in consecutive segments. Each part of the Chinese translation should appear only once.
    5. NUMERIC DEDUPLICATION: If a segment contains only a number or a list index (e.g., "1", "2."), and the Chinese translation is essentially the same as the English original, do NOT output two lines. Only output the translated version (e.g., if DOCX is "1." and SRT is "1", just output "1.").
    **CRITICAL: Avoid redundant rows of Arabic numerals within a single segment.**
    6. NO LITERAL \\n: Do NOT use the characters "\\n". Use actual line breaks.
    7. MISMATCHES: If you cannot find a clear translation for a segment in the reference text, do not guess. Leave it as is.
    **CRITICAL: All mismatch explanations MUST be in Chinese.**
    8. RETURN JSON: Return a JSON object with 'updatedSegments' (array of {id, content}) and 'mismatches' (array of strings in Chinese).
    `;

    try {
      const responseStream = await this.ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingBudget: 4000 },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              updatedSegments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    content: { type: Type.STRING, description: "Chinese translation + newline + original English. Deduplicate numeric lines." }
                  },
                  required: ["id", "content"]
                }
              },
              mismatches: {
                type: Type.ARRAY,
                items: { 
                  type: Type.STRING,
                  description: "用中文说明无法匹配的原因。"
                }
              }
            },
            required: ["updatedSegments", "mismatches"]
          }
        }
      });

      let fullText = '';
      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          fullText += text;
          onProgress(fullText);
        }
      }

      const result = JSON.parse(fullText || '{}');
      
      const mappedBlocks = srtBlocks.map(block => {
        const update = result.updatedSegments?.find((s: any) => s.id === block.id);
        let content = block.content;
        
        if (update) {
          // 处理流式输出可能产生的字面量 \n
          content = update.content.replace(/\\n/g, '\n');
          
          // 将中文翻译中的标点符号替换为空格
          const lines = content.split('\n');
          const punctuationRegex = /[.,!?;:"'()\[\]{}<>\\/|`~!@#$%^&*_\-+=，。！？；：""''（）【】《》、—…\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65\u2018\u2019\u201C\u201D\u2014\u2026]/g;
          
          if (lines.length > 1) {
            // 最后一行通常是原始英文，前面的行是中文翻译
            for (let i = 0; i < lines.length - 1; i++) {
              lines[i] = lines[i].replace(punctuationRegex, ' ').replace(/\s+/g, ' ').trim();
            }
            content = lines.join('\n');
          } else if (/[\u4e00-\u9fa5]/.test(content)) {
            // 如果只有一行且包含中文，也进行处理
            content = content.replace(punctuationRegex, ' ').replace(/\s+/g, ' ').trim();
          }
          
          // 后处理逻辑：检测并合并冗余的纯数字行
          const finalLines = content.split('\n').map(l => l.trim()).filter(l => l !== '');
          if (finalLines.length >= 2) {
            const lastLine = finalLines[finalLines.length - 1];
            const firstLine = finalLines[0];
            
            // 如果两行都是数字（允许有点号或空格），则去重
            const clean1 = firstLine.replace(/[.、\s]/g, '');
            const clean2 = lastLine.replace(/[.、\s]/g, '');
            
            if (clean1 === clean2 && /^\d+$/.test(clean1)) {
              content = firstLine; // 仅保留翻译行或第一行
            }
          }
        }
        
        return {
          ...block,
          content: content
        };
      });

      const { serializeSrt } = await import('../utils/srtParser');
      
      return {
        updatedSrt: serializeSrt(mappedBlocks),
        mismatches: result.mismatches || []
      };
    } catch (error) {
      console.error("Alignment Error:", error);
      throw new Error("处理字幕失败，请检查输入内容并重试。");
    }
  }
}
