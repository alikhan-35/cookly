import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ListPlus, LoaderCircle, Mic, Square, Trash2, X } from 'lucide-react';
import { useFridge } from '../hooks/useFridge';
import { useToast } from '../hooks/useToast';
import { fridgeCategories, type FridgeCategory } from '../types';
import { fridgeUnits, validateFridgeInput, type FridgeInput } from '../utils/fridge';
import { matchingProductKey } from '../utils/pantryProducts';
import { parseFridgeText, validateIntakeResult, type IntakeProduct, type IntakeResult } from '../utils/fridgeIntake';
import { assistantConfigured, FridgeAssistantError, parseFridgeWithAssistant } from '../services/fridgeAssistant';
import { speechRecognitionSupported, startFridgeDictation } from '../services/speechRecognition';
import '../fridge-intake.css';

type DraftProduct = Omit<IntakeProduct, 'amount'> & { amountText: string };
type VoicePhase = 'idle' | 'starting' | 'listening' | 'stopping' | 'stopped';
const MAX_TEXT_LENGTH = 2000;
const MAX_VOICE_SECONDS = 45;
const examples = [
  { label: 'Мясо и овощи', text: 'Куриное филе 500 г; картофель 1 кг; морковь 2 шт.; лук 2 шт.' },
  { label: 'Для завтраков', text: 'Яйца 6 шт.; молоко 1 л; творог 300 г; овсяные хлопья 500 г' },
  { label: 'Овощи и крупы', text: 'Помидоры 4 шт.; огурцы 2 шт.; рис 500 г; гречка 1 кг' },
];

function draftInput(product: DraftProduct): FridgeInput {
  const amountText = product.amountText.trim();
  return {
    name: product.name.trim(), unit: product.unit, category: product.category,
    ...(amountText ? { amount: Number(amountText.replace(',', '.')) } : {}),
  };
}

export function FridgeIntake() {
  const { items, addItems } = useFridge();
  const { toast } = useToast();
  const prefix = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const textValue = useRef('');
  const [result, setResult] = useState<Pick<IntakeResult, 'warnings' | 'engine'> | null>(null);
  const [products, setProducts] = useState<DraftProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle');
  const voicePhaseRef = useRef<VoicePhase>('idle');
  const [voiceError, setVoiceError] = useState('');
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [voiceSupported] = useState(speechRecognitionSupported);
  const [hasAssistant] = useState(assistantConfigured);
  const request = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const dictation = useRef<ReturnType<typeof startFridgeDictation> | null>(null);
  const dictationVersion = useRef(0);
  const voiceStartedAt = useRef(0);
  const mounted = useRef(true);
  const voiceActive = voicePhase === 'starting' || voicePhase === 'listening' || voicePhase === 'stopping';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestVersion.current++;
      request.current?.abort();
      dictationVersion.current++;
      dictation.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!voiceActive) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - voiceStartedAt.current) / 1000);
      setVoiceSeconds(Math.min(elapsed, MAX_VOICE_SECONDS));
      if (elapsed >= MAX_VOICE_SECONDS && voicePhaseRef.current !== 'stopping') {
        voicePhaseRef.current = 'stopping';
        setVoicePhase('stopping');
        dictation.current?.stop();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [voiceActive]);

  const review = useMemo(() => {
    const existing = new Set(items.map(item => matchingProductKey(item.name)));
    const selectedKeys = new Set<string>();
    return products.map(product => {
      const key = matchingProductKey(product.name);
      const duplicate = existing.has(key) ? 'Уже есть в холодильнике. Количество не изменится.'
        : key && selectedKeys.has(key) ? 'Такой продукт уже выбран в этом списке.' : '';
      const validation = validateFridgeInput(draftInput(product), []);
      const selected = product.selected && !duplicate;
      if (selected && key) selectedKeys.add(key);
      return { product, duplicate, validation, selected };
    });
  }, [products, items]);
  const selectedCount = review.filter(row => row.selected).length;
  const invalidSelected = review.some(row => row.selected && row.validation);

  function replaceText(value: string) {
    requestVersion.current++;
    request.current?.abort();
    request.current = null;
    textValue.current = value.slice(0, MAX_TEXT_LENGTH);
    setText(textValue.current);
    setResult(null); setProducts([]); setBusy(false); setError(''); setStatus('');
  }
  function cancelRequest() {
    requestVersion.current++;
    request.current?.abort(); request.current = null;
    setBusy(false); setError(''); setStatus('Разбор отменён. Исходный список сохранён.');
  }
  function stopVoice() {
    if (!dictation.current || voicePhaseRef.current === 'stopping') return;
    voicePhaseRef.current = 'stopping'; setVoicePhase('stopping');
    dictation.current.stop();
  }
  function startVoice() {
    if (busy || !voiceSupported) return;
    if (voiceActive) { stopVoice(); return; }
    const version = ++dictationVersion.current;
    setResult(null); setProducts([]); setError(''); setStatus(''); setVoiceError(''); setVoiceSeconds(0);
    voiceStartedAt.current = Date.now();
    voicePhaseRef.current = 'starting'; setVoicePhase('starting');
    try {
      const control = startFridgeDictation({
        onTranscript(fragment) {
          if (!mounted.current || version !== dictationVersion.current || !fragment.trim()) return;
          const current = textValue.current.trim();
          const next = current ? `${current}; ${fragment.trim()}` : fragment.trim();
          textValue.current = next.slice(0, MAX_TEXT_LENGTH);
          setText(textValue.current);
          if (next.length > MAX_TEXT_LENGTH) {
            setVoiceError('Достигнут лимит 2000 символов. Проверьте конец списка перед разбором.');
            stopVoice();
          }
        },
        onStatus(next) {
          if (!mounted.current || version !== dictationVersion.current) return;
          if (next === 'listening' && voicePhaseRef.current === 'stopping') return;
          voicePhaseRef.current = next;
          setVoicePhase(next);
          if (next === 'stopped') { dictation.current = null; setStatus('Запись остановлена. Можно исправить текст и разобрать список.'); }
        },
        onError(message) {
          if (!mounted.current || version !== dictationVersion.current) return;
          setVoiceError(message);
        },
      });
      // A browser may synchronously report failure from start(), changing this ref.
      if (version === dictationVersion.current && (voicePhaseRef.current as VoicePhase) !== 'stopped') dictation.current = control;
      else control.abort();
    } catch {
      voicePhaseRef.current = 'stopped'; setVoicePhase('stopped');
      setVoiceError('Не удалось запустить голосовой ввод. Можно написать список вручную.');
    }
  }

  async function analyze(useLocal = false) {
    if (busy || voiceActive) return;
    const source = textValue.current.trim();
    if (!source) { setError('Перечислите продукты, которые есть дома.'); textarea.current?.focus(); return; }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const version = ++requestVersion.current;
    setBusy(true); setError(''); setStatus(''); setResult(null); setProducts([]);
    try {
      const parsed = hasAssistant && !useLocal ? await parseFridgeWithAssistant(source, { signal: controller.signal }) : parseFridgeText(source);
      const checked = validateIntakeResult(parsed);
      if (!mounted.current || controller.signal.aborted || version !== requestVersion.current) return;
      setResult({ warnings: checked.warnings, engine: checked.engine });
      setProducts(checked.products.map(product => ({ ...product, amountText: product.amount === undefined ? '' : String(product.amount) })));
      setStatus(checked.products.length ? 'Список разобран. Проверьте продукты перед добавлением.' : 'Не удалось выделить продукты. Измените список и попробуйте ещё раз.');
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted || version !== requestVersion.current) return;
      setError(cause instanceof FridgeAssistantError || cause instanceof Error && cause.name === 'IntakeValidationError' ? cause.message
        : hasAssistant && !useLocal ? 'Разбор с Gemini сейчас недоступен. Попробуйте ещё раз или нажмите «Разобрать на устройстве».'
          : 'Разобрать список не получилось. Попробуйте ещё раз или добавьте продукты вручную.');
    } finally {
      if (mounted.current && version === requestVersion.current) { setBusy(false); request.current = null; }
    }
  }

  function editProduct(id: string, patch: Partial<DraftProduct>) {
    setProducts(previous => previous.map(product => product.id === id ? { ...product, ...patch } : product));
    setError('');
  }
  function cancelReview() {
    setResult(null); setProducts([]); setError(''); setStatus('Исходный список сохранён. Можно исправить его и разобрать снова.');
    textarea.current?.focus();
  }
  function confirm() {
    const selected = review.filter(row => row.selected);
    if (!selected.length) { setError('Выберите хотя бы один новый продукт.'); return; }
    const invalid = selected.find(row => row.validation);
    if (invalid) { setError(`Проверьте «${invalid.product.name || 'продукт'}»: ${invalid.validation}`); return; }
    const error = addItems(selected.map(row => draftInput(row.product)));
    if (error) { setError(error); return; }
    toast(`Добавлено в холодильник: ${selected.length} ${productWord(selected.length)}`);
    textValue.current = ''; setText(''); setResult(null); setProducts([]); setError(''); setVoiceError(''); setStatus('Продукты добавлены в холодильник.');
  }

  return <section className="fridge-intake" aria-labelledby={`${prefix}-title`}>
    <div className="fridge-intake-heading"><span className="fridge-intake-icon"><ListPlus size={25}/></span><div><h2 id={`${prefix}-title`}>Добавим продукты списком</h2><p>Напишите или продиктуйте, что есть дома. Перед добавлением можно всё проверить и исправить.</p></div></div>
    <label className="fridge-intake-text-label" htmlFor={`${prefix}-text`}>Перечислите продукты</label>
    <textarea ref={textarea} id={`${prefix}-text`} value={text} maxLength={MAX_TEXT_LENGTH} rows={4} disabled={voiceActive} onChange={event => replaceText(event.target.value)} aria-describedby={`${prefix}-text-hint`} placeholder="Куриное филе 500 г, картофель 1 кг, 6 яиц и молоко"/>
    <div className="fridge-intake-text-meta"><p id={`${prefix}-text-hint`}>Количество необязательно. Неизвестные значения оставим пустыми.</p><span>{text.length}/{MAX_TEXT_LENGTH}</span></div>
    <div className="fridge-intake-examples" aria-label="Примеры списков">{examples.map(example => <button type="button" key={example.label} disabled={busy || voiceActive} onClick={() => replaceText(example.text)}>{example.label}</button>)}</div>
    <p className="fridge-intake-voice-note">Речь распознаёт браузер; он может отправлять аудио своему сервису.</p>
    {hasAssistant && <p className="fridge-intake-ai-note" id={`${prefix}-assistant-note`}>«Разобрать с Gemini» отправит список продуктов Google Gemini. На бесплатном тарифе Google может использовать список и ответ для улучшения моделей. <a href="https://ai.google.dev/gemini-api/terms#unpaid-services" target="_blank" rel="noreferrer">Условия Google</a>.</p>}
    <div className="fridge-intake-actions"><button type="button" className={`button secondary fridge-intake-mic${voiceActive ? ' listening' : ''}`} disabled={busy || !voiceSupported || voicePhase === 'stopping'} onClick={startVoice}>{voiceActive ? <Square size={16}/> : <Mic size={17}/>} {voicePhase === 'starting' ? 'Запускаем микрофон…' : voicePhase === 'stopping' ? 'Останавливаем…' : voiceActive ? 'Остановить запись' : 'Продиктовать список'}</button>
      <button type="button" className="button primary" disabled={busy || voiceActive || !text.trim()} aria-describedby={hasAssistant ? `${prefix}-assistant-note` : undefined} onClick={() => void analyze()}>{busy ? <LoaderCircle className="spin" size={17}/> : <ListPlus size={18}/>} {busy ? 'Разбираем список…' : hasAssistant ? 'Разобрать с Gemini' : 'Разобрать список'}</button>
      {hasAssistant && <button type="button" className="button secondary" disabled={busy || voiceActive || !text.trim()} onClick={() => void analyze(true)}>Разобрать на устройстве</button>}
      {busy && <button type="button" className="fridge-intake-cancel" onClick={cancelRequest}><X size={16}/> Отменить разбор</button>}
      <span className="fridge-intake-engine">{(result?.engine ?? (hasAssistant ? 'ai' : 'local')) === 'ai' ? 'Разбор с помощью ИИ' : 'Разбор на устройстве'}</span>
    </div>
    {voiceActive && <p className="fridge-intake-voice-status" role="status"><span className="fridge-intake-recording-dot"/>{voicePhase === 'starting' ? 'Ждём доступ к микрофону' : voicePhase === 'stopping' ? 'Завершаем распознавание' : 'Слушаем список продуктов'}<span aria-hidden="true">{voiceSeconds} / {MAX_VOICE_SECONDS} сек.</span></p>}
    {!voiceSupported && <p className="fridge-intake-note">Голосовой ввод недоступен в этом браузере. Можно написать список текстом.</p>}
    {!hasAssistant && <p className="fridge-intake-note">Перечисляйте продукты через запятую или с новой строки. Результат можно исправить перед добавлением.</p>}
    {voiceError && <p className="fridge-intake-warning" role="alert">{voiceError}</p>}
    {status && <p className="fridge-intake-status" role="status">{status}</p>}

    {result && <div className="fridge-intake-review" aria-labelledby={`${prefix}-review-title`}><div className="fridge-intake-review-heading"><div><span className="fridge-intake-step">ПЕРЕД ДОБАВЛЕНИЕМ</span><h3 id={`${prefix}-review-title`}>Проверьте список продуктов</h3><p>Добавятся только отмеченные строки. Уже имеющиеся продукты не изменятся.</p></div><span className="fridge-intake-review-count">Выбрано: {selectedCount}</span></div>
      {result.warnings.length > 0 && <ul className="fridge-intake-warnings" aria-label="Что проверить">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      {review.length > 0 && <ol className="fridge-intake-products">{review.map(({ product, duplicate, validation, selected }, index) => {
        const rowId = `${prefix}-product-${index}`;
        return <li key={product.id} className={duplicate ? 'fridge-intake-product duplicate' : 'fridge-intake-product'}><div className="fridge-intake-product-top"><label className="fridge-intake-select"><input type="checkbox" checked={selected} disabled={Boolean(duplicate)} onChange={event => editProduct(product.id, { selected: event.target.checked })} aria-label={`Добавить ${product.name || `продукт ${index + 1}`}`}/><span>Добавить</span></label><button type="button" className="fridge-intake-remove" aria-label={`Убрать ${product.name || `продукт ${index + 1}`} из списка`} onClick={() => { setProducts(previous => previous.filter(item => item.id !== product.id)); setError(''); }}><Trash2 size={16}/><span>Убрать</span></button></div>
          <div className="fridge-intake-fields"><label className="fridge-intake-product-name" htmlFor={`${rowId}-name`}><span>Продукт</span><input id={`${rowId}-name`} value={product.name} maxLength={60} onChange={event => editProduct(product.id, { name: event.target.value })}/></label><label htmlFor={`${rowId}-amount`}><span>Количество</span><input id={`${rowId}-amount`} inputMode="decimal" value={product.amountText} maxLength={15} onChange={event => editProduct(product.id, { amountText: event.target.value })} placeholder="Не указано"/></label><label htmlFor={`${rowId}-unit`}><span>Единица</span><select id={`${rowId}-unit`} value={product.unit} onChange={event => editProduct(product.id, { unit: event.target.value })}>{fridgeUnits.map(unit => <option value={unit} key={unit}>{unit || 'Не указана'}</option>)}</select></label><label className="fridge-intake-product-category" htmlFor={`${rowId}-category`}><span>Категория</span><select id={`${rowId}-category`} value={product.category} onChange={event => editProduct(product.id, { category: event.target.value as FridgeCategory })}>{fridgeCategories.map(category => <option value={category} key={category}>{category}</option>)}</select></label></div>
          {(duplicate || product.note || (selected && validation)) && <div className="fridge-intake-product-notes">{duplicate && <p>{duplicate}</p>}{product.note && <p>{product.note}</p>}{selected && validation && <p className="fridge-intake-row-error">{validation}</p>}</div>}
        </li>;
      })}</ol>}
      <div className="fridge-intake-review-actions"><button type="button" className="button primary" disabled={!selectedCount || invalidSelected || busy || voiceActive} onClick={confirm}><Check size={18}/> Добавить {selectedCount} {productWord(selectedCount)}</button><button type="button" className="button secondary" onClick={cancelReview}>Вернуться к исходному списку</button></div>
      <p className="fridge-intake-note">Сроки годности не угадываем. Их можно добавить в карточках продуктов после сохранения.</p>
    </div>}
    {error && <div className="fridge-intake-error" role="alert"><p>{error}</p></div>}
  </section>;
}

function productWord(count: number): string { return count % 100 >= 11 && count % 100 <= 14 ? 'продуктов' : count % 10 === 1 ? 'продукт' : count % 10 >= 2 && count % 10 <= 4 ? 'продукта' : 'продуктов'; }
