
import React, { useState, useCallback } from 'react';
import { SubtitleAlignmentService } from './services/geminiService';
import { parseSrt } from './utils/srtParser';
import { ProcessingResult } from './types';

// Declare global mammoth for docx parsing
declare const mammoth: any;

const App: React.FC = () => {
  const [srtInput, setSrtInput] = useState('');
  const [docInput, setDocInput] = useState('');
  const [originalFilename, setOriginalFilename] = useState<string>('subtitles');
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingLog, setStreamingLog] = useState('');
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [isDraggingSrt, setIsDraggingSrt] = useState(false);
  const [isDraggingDoc, setIsDraggingDoc] = useState(false);

  const processFile = useCallback(async (file: File, type: 'srt' | 'docx') => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result;
      if (type === 'srt' && typeof content === 'string') {
        setSrtInput(content);
        // Extract filename without extension
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        setOriginalFilename(nameWithoutExt);
      } else if (type === 'docx' && content instanceof ArrayBuffer) {
        try {
          const { value } = await mammoth.extractRawText({ arrayBuffer: content });
          setDocInput(value);
        } catch (err) {
          setError('读取 DOCX 文件失败，请确保它是有效的 Word 文档。');
        }
      }
    };

    if (type === 'srt') {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'srt' | 'docx') => {
    const file = e.target.files?.[0];
    if (file) processFile(file, type);
  };

  const handleDragOver = (e: React.DragEvent, type: 'srt' | 'docx') => {
    e.preventDefault();
    if (type === 'srt') setIsDraggingSrt(true);
    else setIsDraggingDoc(true);
  };

  const handleDragLeave = (e: React.DragEvent, type: 'srt' | 'docx') => {
    e.preventDefault();
    if (type === 'srt') setIsDraggingSrt(false);
    else setIsDraggingDoc(false);
  };

  const handleDrop = (e: React.DragEvent, type: 'srt' | 'docx') => {
    e.preventDefault();
    if (type === 'srt') setIsDraggingSrt(false);
    else setIsDraggingDoc(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (type === 'srt' && !file.name.toLowerCase().endsWith('.srt')) {
        setError('请拖入有效的 .srt 文件');
        return;
      }
      if (type === 'docx' && !file.name.toLowerCase().endsWith('.docx')) {
        setError('请拖入有效的 .docx 文件');
        return;
      }
      processFile(file, type);
    }
  };

  const processSubtitles = async () => {
    if (!srtInput.trim() || !docInput.trim()) {
      setError('请提供 SRT 内容和参考文本。');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setStreamingLog('');

    try {
      const srtBlocks = parseSrt(srtInput);
      const service = new SubtitleAlignmentService();
      
      // 预处理参考文本：将标点符号和英文替换为空格
      const cleanRegex = /[a-zA-Z.,!?;:"'()\[\]{}<>\\/|`~!@#$%^&*_\-+=，。！？；：""''（）【】《》、—…\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65\u2018\u2019\u201C\u201D\u2014\u2026]/g;
      const processedDocInput = docInput.replace(cleanRegex, ' ').replace(/\s+/g, ' ');

      const alignmentResult = await service.alignSubtitles(
        srtBlocks, 
        processedDocInput,
        (progressText) => setStreamingLog(progressText)
      );
      
      setResult(alignmentResult);
    } catch (err: any) {
      setError(err.message || '发生了意外错误。');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResultChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (result) {
      setResult({
        ...result,
        updatedSrt: e.target.value
      });
    }
  };

  const downloadSrt = () => {
    if (!result?.updatedSrt) return;
    const blob = new Blob([result.updatedSrt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Construct export filename: original_name + _zh.srt
    a.download = `${originalFilename}_zh.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 space-y-8 max-w-6xl mx-auto">
      <header className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-blue-800">专业字幕翻译处理助手</h1>
        <p className="text-gray-600">根据 DOCX 对照内容为 SRT 文件精准添加中文翻译</p>
      </header>

      {!result ? (
        <div className="w-full space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* SRT Input Section */}
            <div 
              onDragOver={(e) => handleDragOver(e, 'srt')}
              onDragLeave={(e) => handleDragLeave(e, 'srt')}
              onDrop={(e) => handleDrop(e, 'srt')}
              className={`space-y-4 bg-white p-6 rounded-xl shadow-sm border transition-all duration-200 ${
                isDraggingSrt ? 'border-blue-500 bg-blue-50 scale-[1.01] shadow-md' : 'border-gray-200'
              }`}
            >
              <div className="flex justify-between items-center">
                <h2 className="font-semibold text-lg flex items-center gap-2 text-gray-700">
                  <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs">1</span>
                  SRT 字幕内容
                </h2>
                <label className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer font-medium">
                  上传/拖拽 .srt 文件
                  <input type="file" accept=".srt" onChange={(e) => handleFileUpload(e, 'srt')} className="hidden" />
                </label>
              </div>
              <textarea
                className={`w-full h-80 p-3 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all ${
                  isDraggingSrt ? 'bg-blue-50/50' : ''
                }`}
                placeholder="在此粘贴 SRT 内容，或直接拖入文件..."
                value={srtInput}
                onChange={(e) => setSrtInput(e.target.value)}
              />
            </div>

            {/* DOCX / Reference Input Section */}
            <div 
              onDragOver={(e) => handleDragOver(e, 'docx')}
              onDragLeave={(e) => handleDragLeave(e, 'docx')}
              onDrop={(e) => handleDrop(e, 'docx')}
              className={`space-y-4 bg-white p-6 rounded-xl shadow-sm border transition-all duration-200 ${
                isDraggingDoc ? 'border-green-500 bg-green-50 scale-[1.01] shadow-md' : 'border-gray-200'
              }`}
            >
              <div className="flex justify-between items-center">
                <h2 className="font-semibold text-lg flex items-center gap-2 text-gray-700">
                  <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs">2</span>
                  DOCX 对照翻译
                </h2>
                <label className="text-xs text-green-600 hover:text-green-800 cursor-pointer font-medium">
                  上传/拖拽 .docx 文件
                  <input type="file" accept=".docx" onChange={(e) => handleFileUpload(e, 'docx')} className="hidden" />
                </label>
              </div>
              <textarea
                className={`w-full h-80 p-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all ${
                  isDraggingDoc ? 'bg-green-50/50' : ''
                }`}
                placeholder="在此粘贴 DOCX 对照内容，或直接拖入文件..."
                value={docInput}
                onChange={(e) => setDocInput(e.target.value)}
              />
            </div>
          </div>

          {/* Streaming Log (Reasoning View) */}
          {isProcessing && streamingLog && (
            <div className="w-full space-y-2 bg-gray-900 text-green-400 p-6 rounded-xl shadow-inner font-mono text-xs overflow-hidden">
              <div className="flex justify-between items-center border-b border-gray-800 pb-2 mb-4">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  正在进行 AI 流式推理与对齐...
                </span>
                <span className="text-gray-500">{streamingLog.length} bytes received</span>
              </div>
              <div className="h-40 overflow-y-auto whitespace-pre-wrap break-all opacity-80 scrollbar-hide">
                {streamingLog}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm flex justify-between items-center">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
            </div>
          )}

          {/* Process Button */}
          <div className="flex justify-center">
            <button
              onClick={processSubtitles}
              disabled={isProcessing}
              className={`px-12 py-4 rounded-full font-bold text-white shadow-lg transition-all ${
                isProcessing ? 'bg-gray-400 cursor-not-allowed scale-95' : 'bg-blue-600 hover:bg-blue-700 active:scale-95 hover:shadow-xl'
              }`}
            >
              {isProcessing ? (
                <span className="flex items-center gap-3">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  处理对齐中...
                </span>
              ) : '开始处理'}
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">处理完成</h2>
              <p className="text-gray-500 text-sm">所有字幕段落已根据 reference 对齐，您可以根据需要进行最后的微调。</p>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <button
                onClick={() => setResult(null)}
                className="flex-1 md:flex-none px-6 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium transition-colors"
              >
                返回修改
              </button>
              <button
                onClick={downloadSrt}
                className="flex-1 md:flex-none px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-md transition-all hover:shadow-lg active:scale-95"
              >
                下载结果 (.srt)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Output Preview */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    SRT 预览与编辑
                  </h3>
                  <span className="text-xs bg-blue-50 text-blue-500 px-2 py-1 rounded">可直接在此处修改</span>
                </div>
                <textarea
                  className="w-full h-[600px] p-4 text-sm font-mono bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all scrollbar-thin"
                  value={result.updatedSrt}
                  onChange={handleResultChange}
                />
              </div>
            </div>

            {/* Status & Feedback */}
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  处理状态报告
                </h3>
                {result.mismatches.length > 0 ? (
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-amber-800">发现 {result.mismatches.length} 个不匹配项：</div>
                    <ul className="space-y-2">
                      {result.mismatches.map((m, idx) => (
                        <li key={idx} className="text-xs text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-100 leading-relaxed">
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-sm text-green-700 bg-green-50 p-6 rounded-xl border border-green-100 space-y-3">
                    <div className="font-bold flex items-center gap-2">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      匹配成功
                    </div>
                    <p className="opacity-90">所有字幕段落均已从对照文件中找到对应翻译并完成合并。</p>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                <h4 className="text-blue-800 font-semibold mb-2 text-sm">温馨提示</h4>
                <p className="text-blue-700 text-xs leading-relaxed">
                  本工具已尽力对齐。如果仍有微小偏差，您可以直接在左侧预览窗口中编辑并实时保存。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="w-full pt-12 pb-6 text-center text-gray-400 text-xs border-t border-gray-100">
        <div className="flex justify-center gap-6 mb-4">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-full"></span> 严格一致性</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-full"></span> 无润色匹配</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-purple-400 rounded-full"></span> SRT 格式校验</span>
        </div>
        <p>© 2025 专业字幕助手 - 高级流式推理引擎</p>
      </footer>
    </div>
  );
};

export default App;
