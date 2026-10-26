export type FridgeDictationStatus = 'starting' | 'listening' | 'stopped';

export interface FridgeDictationCallbacks {
  /** Only new final fragments, ready to append. Interim/cumulative repeats are omitted. */
  onTranscript(text: string): void;
  onStatus(status: FridgeDictationStatus): void;
  onError(message: string): void;
}

export interface FridgeDictationController { stop(): void; abort(): void }

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0?: { readonly transcript: string };
}
interface RecognitionEvent {
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult };
}
interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onnomatch: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => BrowserRecognition;

const MAX_DICTATION_MS = 45_000;
const FINAL_RESULT_GRACE_MS = 2_000;
const inactiveController: FridgeDictationController = { stop() {}, abort() {} };

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const browser = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  if (typeof browser.SpeechRecognition === 'function') return browser.SpeechRecognition;
  return typeof browser.webkitSpeechRecognition === 'function' ? browser.webkitSpeechRecognition : null;
}

/** Feature detection only: never instantiates recognition or requests microphone access. */
export function speechRecognitionSupported(): boolean { return recognitionConstructor() !== null; }

function recognitionError(code: string): string {
  switch (code) {
    case 'not-allowed':
      return 'Доступ к микрофону запрещён. Разрешите его в настройках браузера или введите продукты текстом.';
    case 'service-not-allowed':
      return 'Браузер запретил службу распознавания речи. Введите продукты текстом.';
    case 'no-speech':
      return 'Речь не распознана. Попробуйте ещё раз или введите продукты текстом.';
    case 'audio-capture':
      return 'Микрофон недоступен. Подключите его или проверьте настройки браузера.';
    case 'network':
      return 'Не удалось связаться со службой распознавания. Проверьте интернет или введите продукты текстом.';
    case 'language-not-supported':
      return 'Браузер не поддерживает распознавание на русском. Введите продукты текстом.';
    default:
      return 'Не удалось выполнить диктовку. Попробуйте ещё раз или введите продукты текстом.';
  }
}

function startError(cause: unknown): string {
  const name = cause && typeof cause === 'object' && 'name' in cause ? cause.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return recognitionError('not-allowed');
  if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'DevicesNotFoundError') return recognitionError('audio-capture');
  if (name === 'NetworkError') return recognitionError('network');
  return recognitionError('unknown');
}

/**
 * Call only from an explicit microphone action. Cookly neither records audio nor
 * uploads it to its own server. The browser's recognition service may use cloud
 * processing; this API does not promise offline or on-device recognition.
 * stop() allows a bounded final result; abort() silently disposes an unmounted UI.
 */
export function startFridgeDictation(callbacks: FridgeDictationCallbacks): FridgeDictationController {
  const Constructor = recognitionConstructor();
  if (!Constructor) {
    callbacks.onStatus('stopped');
    callbacks.onError('Голосовой ввод не поддерживается в этом браузере. Введите продукты текстом.');
    return inactiveController;
  }

  let recognition: BrowserRecognition;
  try { recognition = new Constructor(); }
  catch (cause) {
    callbacks.onStatus('stopped'); callbacks.onError(startError(cause));
    return inactiveController;
  }

  let closed = false;
  let stopping = false;
  let heardSpeech = false;
  let lastStatus: FridgeDictationStatus | null = null;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;
  let finalTimer: ReturnType<typeof setTimeout> | undefined;
  const deliveredFinals = new Set<number>();

  function status(value: FridgeDictationStatus) {
    if (lastStatus === value) return;
    lastStatus = value;
    callbacks.onStatus(value);
  }

  function finish(abortRecognition: boolean, silent = false, error?: string) {
    if (closed) return;
    closed = true;
    clearTimeout(limitTimer); clearTimeout(finalTimer);
    recognition.onstart = null; recognition.onresult = null; recognition.onerror = null;
    recognition.onend = null; recognition.onnomatch = null;
    if (abortRecognition) { try { recognition.abort(); } catch { /* Already stopped by the browser. */ } }
    if (!silent) {
      status('stopped');
      if (error) callbacks.onError(error);
    }
  }

  function stop() {
    if (closed || stopping) return;
    stopping = true;
    clearTimeout(limitTimer);
    // Install before stop(): some implementations synchronously dispatch onend.
    finalTimer = setTimeout(() => finish(true), FINAL_RESULT_GRACE_MS);
    try { recognition.stop(); }
    catch (cause) { finish(true, false, startError(cause)); }
  }

  recognition.onstart = () => {
    if (closed) return;
    if (stopping) {
      // Permission can resolve after the user has already pressed stop.
      try { recognition.stop(); } catch { finish(true); }
      return;
    }
    status('listening');
  };
  recognition.onresult = event => {
    if (closed) return;
    const fragments: string[] = [];
    // Results are cumulative. Final indices stay immutable for this recognition.
    for (let index = 0; index < event.results.length; index++) {
      const result = event.results[index];
      if (!result?.isFinal || deliveredFinals.has(index)) continue;
      deliveredFinals.add(index);
      const text = result[0]?.transcript.trim().replace(/\s+/gu, ' ');
      if (text) fragments.push(text);
    }
    if (fragments.length) { heardSpeech = true; callbacks.onTranscript(fragments.join(' ')); }
  };
  recognition.onerror = event => {
    if (closed) return;
    finish(true, false, event.error === 'aborted' ? undefined : recognitionError(event.error));
  };
  recognition.onnomatch = () => { if (!closed) finish(true, false, recognitionError('no-speech')); };
  recognition.onend = () => {
    if (!closed) finish(false, false, !stopping && !heardSpeech ? recognitionError('no-speech') : undefined);
  };

  const controller: FridgeDictationController = { stop, abort: () => finish(true, true) };
  try {
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    limitTimer = setTimeout(stop, MAX_DICTATION_MS);
    status('starting');
    recognition.start();
  } catch (cause) {
    finish(true, false, startError(cause));
  }
  return controller;
}
