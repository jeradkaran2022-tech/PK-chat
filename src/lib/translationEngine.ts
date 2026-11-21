import { SpeakingSpeedOption, TranslationConfidenceLevel } from '../types/pkchat';

export interface ContextTurn {
  speaker: string;
  text: string;
  language?: string;
}

export interface EnhancedTranslationOutput {
  detectedLanguageCode: string;
  detectedLanguageName: string;
  translatedText: string;
  supported: boolean;
  unsupportedReason?: string;
  confidenceScore: number;
  confidenceLevel: TranslationConfidenceLevel;
  clarificationNeeded: boolean;
  clarificationPrompt?: string;
  preservedEntities: string[];
  engine: string;
  latencyMs: number;
  retryCount: number;
}

export function isUncertainTranslation(result: {
  confidenceScore?: number;
  confidenceLevel?: TranslationConfidenceLevel;
  clarificationNeeded?: boolean;
}): boolean {
  if (result.clarificationNeeded) return true;
  if (result.confidenceLevel === 'low' || result.confidenceLevel === 'uncertain') return true;
  if (typeof result.confidenceScore === 'number' && result.confidenceScore < 0.68) return true;
  return false;
}

/**
 * Buffers interim streaming speech fragments into complete sentences,
 * assigns monotonic sequence numbers, and deduplicates overlapping chunks
 * so no sentence is duplicated, skipped, or reordered.
 */
export class SentenceTranslationBuffer {
  private pendingBuffer = '';
  private nextSequence = 1;
  private recentEmittedNormalized = new Set<string>();
  private recentQueue: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onSentenceReady: (sentence: string, sequenceId: number) => void) {}

  public pushText(rawChunk: string, autoFlushMs = 900) {
    const clean = rawChunk.replace(/\s+/g, ' ').trim();
    if (!clean) return;

    // Combine with pending buffer cleanly without duplicating trailing overlap
    if (this.pendingBuffer) {
      if (clean.toLowerCase().startsWith(this.pendingBuffer.toLowerCase())) {
        this.pendingBuffer = clean;
      } else {
        this.pendingBuffer = `${this.pendingBuffer} ${clean}`.replace(/\s+/g, ' ').trim();
      }
    } else {
      this.pendingBuffer = clean;
    }

    // Flush completed sentences ending with sentence punctuation (. ! ? । ؟)
    const sentenceRegex = /[^.!?।؟\n]+[.!?।؟\n]+/g;
    let match: RegExpExecArray | null;
    let consumedLength = 0;

    while ((match = sentenceRegex.exec(this.pendingBuffer)) !== null) {
      const completeSentence = match[0].trim();
      consumedLength = match.index + match[0].length;
      if (completeSentence) {
        this.emitDeduplicated(completeSentence);
      }
    }

    if (consumedLength > 0) {
      this.pendingBuffer = this.pendingBuffer.slice(consumedLength).trim();
    }

    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.pendingBuffer) {
      this.flushTimer = setTimeout(() => {
        this.flushNow();
      }, autoFlushMs);
    }
  }

  public flushNow() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const tail = this.pendingBuffer.trim();
    this.pendingBuffer = '';
    if (tail) {
      this.emitDeduplicated(tail);
    }
  }

  public getPendingPreview(): string {
    return this.pendingBuffer;
  }

  public reset() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingBuffer = '';
    this.recentEmittedNormalized.clear();
    this.recentQueue = [];
  }

  private emitDeduplicated(sentence: string) {
    const norm = sentence.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!norm || this.recentEmittedNormalized.has(norm)) {
      return;
    }
    this.recentEmittedNormalized.add(norm);
    this.recentQueue.push(norm);
    if (this.recentQueue.length > 24) {
      const oldest = this.recentQueue.shift();
      if (oldest) this.recentEmittedNormalized.delete(oldest);
    }

    const seq = this.nextSequence;
    this.nextSequence += 1;
    this.onSentenceReady(sentence, seq);
  }
}

export async function translateSentenceWithRetry(params: {
  text: string;
  targetLanguage: string;
  targetLanguageName: string;
  sourceLanguage?: string;
  accentHint?: string;
  speakingSpeed?: SpeakingSpeedOption;
  lowBandwidth?: boolean;
  contextHistory?: ContextTurn[];
  streamTokens?: boolean;
  onStreamPartial?: (partialText: string) => void;
  maxRetries?: number;
}): Promise<EnhancedTranslationOutput> {
  const maxRetries = params.maxRetries ?? 2;
  let lastError: Error | null = null;
  const startedAt = performance.now();

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      if (params.streamTokens && !params.lowBandwidth) {
        const res = await fetch('/api/translate/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: params.text,
            targetLanguage: params.targetLanguage,
            targetLanguageName: params.targetLanguageName,
            sourceLanguage: params.sourceLanguage,
            accentHint: params.accentHint,
            speakingSpeed: params.speakingSpeed,
            contextHistory: params.contextHistory?.slice(-4),
          }),
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `Stream translation error HTTP ${res.status}`);
        }
        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('Readable stream unavailable');
        }
        const decoder = new TextDecoder();
        let buffer = '';
        let finalPayload: Record<string, unknown> | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';
          for (const ev of events) {
            const line = ev.trim();
            if (!line.startsWith('data:')) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(jsonStr) as {
                type?: string;
                partialText?: string;
                result?: Record<string, unknown>;
                error?: string;
              };
              if (parsed.type === 'delta' && parsed.partialText) {
                params.onStreamPartial?.(parsed.partialText);
              } else if (parsed.type === 'final' && parsed.result) {
                finalPayload = parsed.result;
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error || 'Streaming translation failed');
              }
            } catch (e) {
              if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
                throw e;
              }
            }
          }
        }

        if (!finalPayload) {
          throw new Error('Incomplete translation stream response.');
        }

        const latencyMs = Math.round(performance.now() - startedAt);
        return {
          detectedLanguageCode: String(finalPayload.detectedLanguageCode || 'unknown'),
          detectedLanguageName: String(finalPayload.detectedLanguageName || 'Detected'),
          translatedText: String(finalPayload.translatedText || params.text),
          supported: Boolean(finalPayload.supported ?? true),
          unsupportedReason: finalPayload.unsupportedReason
            ? String(finalPayload.unsupportedReason)
            : undefined,
          confidenceScore: Number(finalPayload.confidenceScore ?? 0.9),
          confidenceLevel: (finalPayload.confidenceLevel as TranslationConfidenceLevel) || 'high',
          clarificationNeeded: Boolean(finalPayload.clarificationNeeded ?? false),
          clarificationPrompt: finalPayload.clarificationPrompt
            ? String(finalPayload.clarificationPrompt)
            : undefined,
          preservedEntities: Array.isArray(finalPayload.preservedEntities)
            ? finalPayload.preservedEntities.map(String)
            : [],
          engine: String(finalPayload.engine || 'pkc-cloud-translate-stream'),
          latencyMs,
          retryCount: attempt,
        };
      }

      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: params.text,
          targetLanguage: params.targetLanguage,
          targetLanguageName: params.targetLanguageName,
          sourceLanguage: params.sourceLanguage,
          accentHint: params.accentHint,
          speakingSpeed: params.speakingSpeed,
          lowBandwidth: params.lowBandwidth,
          contextHistory: params.contextHistory?.slice(-4),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Do not retry 4xx lockdown/validation errors except 429
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          const nonRetry = new Error(data.error || `HTTP ${res.status}`);
          (nonRetry as Error & { nonRetryable?: boolean }).nonRetryable = true;
          throw nonRetry;
        }
        throw new Error(data.error || `Translation service HTTP ${res.status}`);
      }

      const latencyMs = Math.round(performance.now() - startedAt);
      return {
        detectedLanguageCode: data.detectedLanguageCode || 'unknown',
        detectedLanguageName: data.detectedLanguageName || 'Detected',
        translatedText: data.translatedText || params.text,
        supported: data.supported ?? true,
        unsupportedReason: data.unsupportedReason,
        confidenceScore: typeof data.confidenceScore === 'number' ? data.confidenceScore : 0.9,
        confidenceLevel: data.confidenceLevel || 'high',
        clarificationNeeded: Boolean(data.clarificationNeeded),
        clarificationPrompt: data.clarificationPrompt,
        preservedEntities: Array.isArray(data.preservedEntities) ? data.preservedEntities : [],
        engine: data.engine || 'pkc-cloud-translate',
        latencyMs,
        retryCount: attempt,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Translation failed');
      if ((lastError as Error & { nonRetryable?: boolean }).nonRetryable) {
        throw lastError;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('Translation failed after retries.');
}

interface AudioQueueTask {
  turnId: string;
  sequenceId: number;
  text: string;
  audioBase64?: string;
  speechLocale?: string;
}

/**
 * Strictly sequential caption-synchronized audio playback queue.
 * Ensures audio never overlaps or plays out of sequence order.
 */
export class TranslationAudioSyncQueue {
  private pending: AudioQueueTask[] = [];
  private isPlaying = false;
  private activeAudio: HTMLAudioElement | null = null;
  private currentTurnId: string | null = null;

  constructor(private readonly onActiveTurnChange: (turnId: string | null) => void) {}

  public enqueue(task: AudioQueueTask) {
    this.pending.push(task);
    this.pending.sort((a, b) => a.sequenceId - b.sequenceId);
    if (!this.isPlaying) {
      void this.drain();
    }
  }

  public async playImmediate(task: AudioQueueTask) {
    this.stopAll();
    this.pending.push(task);
    await this.drain();
  }

  public stopAll() {
    this.pending = [];
    this.isPlaying = false;
    this.currentTurnId = null;
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.onActiveTurnChange(null);
  }

  private async drain() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    while (this.pending.length > 0) {
      const next = this.pending.shift();
      if (!next) continue;
      this.currentTurnId = next.turnId;
      this.onActiveTurnChange(next.turnId);
      await this.playOne(next);
    }
    this.currentTurnId = null;
    this.isPlaying = false;
    this.onActiveTurnChange(null);
  }

  private playOne(task: AudioQueueTask): Promise<void> {
    return new Promise((resolve) => {
      if (task.audioBase64) {
        try {
          const audio = new Audio(`data:audio/wav;base64,${task.audioBase64}`);
          this.activeAudio = audio;
          audio.onended = () => {
            this.activeAudio = null;
            resolve();
          };
          audio.onerror = () => {
            this.activeAudio = null;
            this.playBrowserFallback(task.text, task.speechLocale).then(resolve);
          };
          audio.play().catch(() => {
            this.activeAudio = null;
            this.playBrowserFallback(task.text, task.speechLocale).then(resolve);
          });
          return;
        } catch {
          // Fall through to speech synthesis
        }
      }
      this.playBrowserFallback(task.text, task.speechLocale).then(resolve);
    });
  }

  private playBrowserFallback(text: string, locale?: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) {
        resolve();
        return;
      }
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        if (locale) utterance.lang = locale;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      } catch {
        resolve();
      }
    });
  }

  public getCurrentTurnId(): string | null {
    return this.currentTurnId;
  }
}
