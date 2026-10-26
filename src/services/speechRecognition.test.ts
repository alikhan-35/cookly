import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { speechRecognitionSupported, startFridgeDictation } from './speechRecognition';

type Result = { isFinal: boolean; 0: { transcript: string } };
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static constructorError: unknown;
  static startError: unknown;
  lang = '';
  continuous = true;
  interimResults = true;
  maxAlternatives = 5;
  onstart: (() => void) | null = null;
  onresult: ((event: { results: Result[]; resultIndex?: number }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onnomatch: (() => void) | null = null;
  stopEffect?: () => void;
  start = vi.fn(() => { if (FakeRecognition.startError) throw FakeRecognition.startError; });
  stop = vi.fn(() => this.stopEffect?.());
  abort = vi.fn(() => this.onerror?.({ error: 'aborted' }));
  constructor() {
    if (FakeRecognition.constructorError) throw FakeRecognition.constructorError;
    FakeRecognition.instances.push(this);
  }
}

function callbacks() { return { onTranscript: vi.fn(), onStatus: vi.fn(), onError: vi.fn() }; }
function final(text: string): Result { return { isFinal: true, 0: { transcript: text } }; }
function interim(text: string): Result { return { isFinal: false, 0: { transcript: text } }; }
function start() {
  const events = callbacks();
  const controller = startFridgeDictation(events);
  return { ...events, controller, recognition: FakeRecognition.instances.at(-1)! };
}
function expectDisposed(recognition: FakeRecognition) {
  expect(recognition.onstart).toBeNull();
  expect(recognition.onresult).toBeNull();
  expect(recognition.onerror).toBeNull();
  expect(recognition.onend).toBeNull();
  expect(recognition.onnomatch).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.instances = [];
  FakeRecognition.constructorError = undefined;
  FakeRecognition.startError = undefined;
  vi.stubGlobal('window', { SpeechRecognition: FakeRecognition });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('explicit browser speech recognition', () => {
  it('detects support without constructing, recording, requesting permissions or starting', () => {
    expect(speechRecognitionSupported()).toBe(true);
    expect(FakeRecognition.instances).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('prefers the standard constructor and configures one Russian dictation session', () => {
    class PrefixedRecognition extends FakeRecognition {}
    vi.stubGlobal('window', { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: PrefixedRecognition });
    const session = start();
    expect(session.recognition).not.toBeInstanceOf(PrefixedRecognition);
    expect(session.recognition).toMatchObject({ lang: 'ru-RU', continuous: false, interimResults: false, maxAlternatives: 1 });
    expect(session.recognition.start).toHaveBeenCalledTimes(1);
    expect(session.onStatus.mock.calls).toEqual([['starting']]);
    session.recognition.onstart?.(); session.recognition.onstart?.();
    expect(session.onStatus.mock.calls).toEqual([['starting'], ['listening']]);
    session.controller.abort();
  });

  it('supports the prefixed constructor', () => {
    vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition });
    expect(speechRecognitionSupported()).toBe(true);
    const session = start();
    expect(session.recognition.start).toHaveBeenCalledTimes(1);
    session.controller.abort();
  });

  it.each([undefined, {}, { SpeechRecognition: 'unavailable' }])('returns an inert controller with a text-entry fallback when unsupported: %s', browser => {
    vi.stubGlobal('window', browser);
    expect(speechRecognitionSupported()).toBe(false);
    const events = callbacks();
    const controller = startFridgeDictation(events);
    expect(events.onError).toHaveBeenCalledWith(expect.stringMatching(/не поддерживается.*текстом/));
    expect(events.onStatus.mock.calls).toEqual([['stopped']]);
    expect(FakeRecognition.instances).toEqual([]);
    expect(() => { controller.stop(); controller.abort(); }).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('emits only new final indices from cumulative events and ignores interim hypotheses', () => {
    const session = start();
    session.recognition.onresult?.({ results: [interim('яблоко')] });
    expect(session.onTranscript).not.toHaveBeenCalled();
    session.recognition.onresult?.({ results: [final('  Яблоки   и груши '), interim('мол')] });
    session.recognition.onresult?.({ results: [final('  Яблоки   и груши '), final('Молоко')], resultIndex: 1 });
    session.recognition.onresult?.({ results: [final('  Яблоки   и груши '), final('Молоко')], resultIndex: 0 });
    session.recognition.onresult?.({ results: [final('Яблоки и груши'), final('Молоко'), final('Яйца'), final('Рис')] });
    expect(session.onTranscript.mock.calls).toEqual([['Яблоки и груши'], ['Молоко'], ['Яйца Рис']]);
    session.controller.abort();
  });

  it('retains intentionally repeated words at new indices while omitting empty final results', () => {
    const session = start();
    session.recognition.onresult?.({ results: [final(''), final('молоко')] });
    session.recognition.onresult?.({ results: [final(''), final('молоко'), final('молоко')] });
    expect(session.onTranscript.mock.calls).toEqual([['молоко'], ['молоко']]);
    session.controller.abort();
  });

  it('stop waits for the final result, then disposes without aborting a completed recognition', () => {
    const session = start();
    session.recognition.onstart?.();
    session.controller.stop(); session.controller.stop();
    expect(session.recognition.stop).toHaveBeenCalledTimes(1);
    expect(session.recognition.onresult).not.toBeNull();
    session.recognition.onresult?.({ results: [final('картофель')] });
    session.recognition.onend?.();
    expect(session.onTranscript).toHaveBeenCalledExactlyOnceWith('картофель');
    expect(session.onError).not.toHaveBeenCalled();
    expect(session.onStatus.mock.calls).toEqual([['starting'], ['listening'], ['stopped']]);
    expect(session.recognition.abort).not.toHaveBeenCalled();
    expectDisposed(session.recognition);
  });

  it('abort silently detaches handlers before invoking the browser and ignores late queued events', () => {
    const session = start();
    session.recognition.onstart?.();
    const lateResult = session.recognition.onresult!;
    const lateEnd = session.recognition.onend!;
    session.controller.stop();
    const previousCalls = session.onStatus.mock.calls.length;
    session.controller.abort(); session.controller.abort(); session.controller.stop();
    lateResult({ results: [final('не должно появиться')] }); lateEnd();
    expect(session.recognition.abort).toHaveBeenCalledTimes(1);
    expect(session.onStatus).toHaveBeenCalledTimes(previousCalls);
    expect(session.onTranscript).not.toHaveBeenCalled();
    expect(session.onError).not.toHaveBeenCalled();
    expectDisposed(session.recognition);
  });

  it.each([
    ['not-allowed', /Доступ к микрофону запрещён/], ['service-not-allowed', /запретил службу/],
    ['no-speech', /Речь не распознана/], ['audio-capture', /Микрофон недоступен/],
    ['network', /Проверьте интернет/], ['language-not-supported', /на русском/], ['unexpected', /Не удалось выполнить/],
  ])('reports a useful Russian error and cleans up on %s', (code, message) => {
    const session = start();
    const lateError = session.recognition.onerror!;
    const lateEnd = session.recognition.onend!;
    lateError({ error: code }); lateError({ error: code }); lateEnd();
    expect(session.onError).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(message));
    expect(session.onStatus.mock.calls).toEqual([['starting'], ['stopped']]);
    expect(session.recognition.abort).toHaveBeenCalledTimes(1);
    expectDisposed(session.recognition);
  });

  it('does not treat a browser cancellation as a new error', () => {
    const session = start();
    session.recognition.onerror?.({ error: 'aborted' });
    expect(session.onError).not.toHaveBeenCalled();
    expect(session.onStatus).toHaveBeenLastCalledWith('stopped');
    expectDisposed(session.recognition);
  });

  it('stops after 45 seconds and forcibly aborts a browser that never ends within two more seconds', () => {
    const session = start();
    vi.advanceTimersByTime(44_999);
    expect(session.recognition.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(session.recognition.stop).toHaveBeenCalledTimes(1);
    expect(session.recognition.abort).not.toHaveBeenCalled();
    session.recognition.onresult?.({ results: [final('гречка')] });
    vi.advanceTimersByTime(1_999);
    expect(session.recognition.abort).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(session.recognition.abort).toHaveBeenCalledTimes(1);
    expect(session.onTranscript).toHaveBeenCalledExactlyOnceWith('гречка');
    expect(session.onStatus).toHaveBeenLastCalledWith('stopped');
    expect(session.recognition.start).toHaveBeenCalledTimes(1);
    expectDisposed(session.recognition);
  });

  it('bounds an explicit early stop too and does not start listening after late permission', () => {
    const session = start();
    session.controller.stop();
    session.recognition.onstart?.();
    expect(session.onStatus.mock.calls).toEqual([['starting']]);
    vi.advanceTimersByTime(2_000);
    expect(session.onStatus).toHaveBeenLastCalledWith('stopped');
    expectDisposed(session.recognition);
  });

  it('clears the lifetime deadline on natural end without restarting', () => {
    const session = start();
    session.recognition.onresult?.({ results: [final('сыр')] });
    session.recognition.onend?.();
    vi.advanceTimersByTime(60_000);
    expect(session.recognition.stop).not.toHaveBeenCalled();
    expect(session.recognition.abort).not.toHaveBeenCalled();
    expect(session.recognition.start).toHaveBeenCalledTimes(1);
    expectDisposed(session.recognition);
  });

  it('reports no speech on natural empty end, but an explicit empty stop is not an error', () => {
    const first = start();
    first.recognition.onend?.();
    expect(first.onError).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/Речь не распознана/));
    const second = start();
    second.recognition.stopEffect = () => second.recognition.onend?.();
    second.controller.stop();
    expect(second.onError).not.toHaveBeenCalled();
    expectDisposed(second.recognition);
  });

  it('does not mistake an empty final result for recognized speech', () => {
    const session = start();
    session.recognition.onresult?.({ results: [final('   ')] });
    session.recognition.onend?.();
    expect(session.onTranscript).not.toHaveBeenCalled();
    expect(session.onError).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/Речь не распознана/));
    expectDisposed(session.recognition);
  });

  it('cleans up a synchronous stop failure without leaving a deadline or microphone session behind', () => {
    const session = start();
    session.recognition.stopEffect = () => { throw new DOMException('Not running', 'InvalidStateError'); };
    expect(() => session.controller.stop()).not.toThrow();
    expect(session.recognition.abort).toHaveBeenCalledTimes(1);
    expect(session.onError).toHaveBeenCalledTimes(1);
    expect(session.onStatus).toHaveBeenLastCalledWith('stopped');
    expectDisposed(session.recognition);
  });

  it.each(['NotAllowedError', 'NotFoundError', 'NetworkError', 'InvalidStateError'])('handles synchronous start failure %s and still returns a controller', name => {
    FakeRecognition.startError = new DOMException('Browser detail', name);
    const session = start();
    expect(session.onError).toHaveBeenCalledTimes(1);
    expect(session.onStatus.mock.calls).toEqual([['starting'], ['stopped']]);
    expect(() => { session.controller.stop(); session.controller.abort(); }).not.toThrow();
    expectDisposed(session.recognition);
  });

  it('handles a constructor exception without timers or another permission API', () => {
    FakeRecognition.constructorError = new DOMException('Denied', 'SecurityError');
    const events = callbacks();
    expect(() => startFridgeDictation(events).abort()).not.toThrow();
    expect(events.onError).toHaveBeenCalledWith(expect.stringMatching(/Доступ к микрофону запрещён/));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a new explicit dictation has independent final indices and cannot receive events from the old session', () => {
    const old = start();
    const staleResult = old.recognition.onresult!;
    old.recognition.onresult?.({ results: [final('рис')] });
    old.controller.abort();
    const next = start();
    staleResult({ results: [final('рис'), final('лишнее')] });
    next.recognition.onresult?.({ results: [final('рис')] });
    next.recognition.onend?.();
    expect(old.onTranscript.mock.calls).toEqual([['рис']]);
    expect(next.onTranscript.mock.calls).toEqual([['рис']]);
    expectDisposed(next.recognition);
  });
});
