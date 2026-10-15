import { useId, useState } from 'react';
import { BarChart3, ShieldCheck, Trash2 } from 'lucide-react';
import { useAnalyticsPreferences } from '../hooks/useAnalyticsPreferences';
import {
  clearLocalAnalyticsHistory,
  setAnalyticsConsent,
  setParticipantCode,
  setQaMode,
} from '../services/analytics';
import { Modal } from './Modal';
import '../analytics.css';

type ConsentChoice = 'granted' | 'denied';

export function AnalyticsConsentBanner() {
  const { configured, consent } = useAnalyticsPreferences();
  const titleId = useId();
  const descriptionId = useId();

  if (!configured || consent !== 'unknown') return null;

  return (
    <section
      className="analytics-consent-banner"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="analytics-consent-icon" aria-hidden="true">
        <ShieldCheck size={22} />
      </div>
      <div className="analytics-consent-copy">
        <h2 id={titleId}>Помогите улучшить Cookly</h2>
        <p id={descriptionId}>
          С вашего разрешения мы будем собирать события об использовании сайта и сведения о браузере.
          Мы не отправляем имена, контакты и списки продуктов. Запись экрана выключена.
        </p>
      </div>
      <div className="analytics-consent-actions">
        <button className="button secondary" type="button" onClick={() => setAnalyticsConsent('denied')}>
          Только необходимое
        </button>
        <button className="button primary" type="button" onClick={() => setAnalyticsConsent('granted')}>
          Разрешить
        </button>
      </div>
    </section>
  );
}

export function AnalyticsSettingsButton({ className = '' }: { className?: string }) {
  const preferences = useAnalyticsPreferences();
  const [open, setOpen] = useState(false);
  const [draftConsent, setDraftConsent] = useState<ConsentChoice>('denied');
  const [draftParticipantCode, setDraftParticipantCode] = useState('');
  const [draftQaMode, setDraftQaMode] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [historyCleared, setHistoryCleared] = useState(false);
  const consentLegendId = useId();
  const participantCodeId = useId();
  const qaModeId = useId();

  if (!preferences.configured) return null;

  const openSettings = () => {
    setDraftConsent(preferences.consent === 'granted' ? 'granted' : 'denied');
    setDraftParticipantCode(preferences.participantCode);
    setDraftQaMode(preferences.qaMode);
    setCodeError('');
    setConfirmingClear(false);
    setHistoryCleared(false);
    setOpen(true);
  };

  const closeSettings = () => {
    setOpen(false);
    setConfirmingClear(false);
  };

  const saveSettings = () => {
    const normalizedCode = draftParticipantCode.trim().toUpperCase();
    if (!setParticipantCode(normalizedCode || null)) {
      setCodeError('Используйте короткий код в формате R01. Не вводите имя, телефон или email.');
      return;
    }

    setAnalyticsConsent(draftConsent);
    setQaMode(draftQaMode);
    closeSettings();
  };

  const clearHistory = () => {
    clearLocalAnalyticsHistory();
    setConfirmingClear(false);
    setHistoryCleared(true);
  };

  return (
    <>
      <button
        className={`analytics-settings-button ${className}`.trim()}
        type="button"
        onClick={openSettings}
        aria-haspopup="dialog"
      >
        <BarChart3 size={16} aria-hidden="true" />
        Настройки аналитики
      </button>

      {open && (
        <Modal title="Настройки аналитики" onClose={closeSettings}>
          <div className="analytics-settings">
            <p className="analytics-settings-intro">
              Вы управляете добровольной аналитикой. Основные функции Cookly работают при любом выборе.
            </p>

            <fieldset className="analytics-choice-group" aria-labelledby={consentLegendId}>
              <legend id={consentLegendId}>Сбор событий</legend>
              <label className={draftConsent === 'granted' ? 'selected' : ''}>
                <input
                  data-autofocus
                  type="radio"
                  name="analytics-consent"
                  value="granted"
                  checked={draftConsent === 'granted'}
                  onChange={() => setDraftConsent('granted')}
                />
                <span>
                  <strong>Разрешить аналитику</strong>
                  <small>События и сведения о браузере без контактных данных помогают находить неудобные места в сценариях.</small>
                </span>
              </label>
              <label className={draftConsent === 'denied' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="analytics-consent"
                  value="denied"
                  checked={draftConsent === 'denied'}
                  onChange={() => setDraftConsent('denied')}
                />
                <span>
                  <strong>Только необходимое</strong>
                  <small>Добровольные события не будут собираться.</small>
                </span>
              </label>
            </fieldset>

            <div className="analytics-field">
              <label htmlFor={participantCodeId}>Код участника исследования</label>
              <input
                id={participantCodeId}
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={draftParticipantCode}
                onChange={(event) => {
                  setDraftParticipantCode(event.target.value);
                  if (codeError) setCodeError('');
                }}
                placeholder="R01"
                maxLength={12}
                aria-describedby={`${participantCodeId}-hint${codeError ? ` ${participantCodeId}-error` : ''}`}
                aria-invalid={Boolean(codeError)}
              />
              <small id={`${participantCodeId}-hint`}>
                Необязательно. Введите выданный вам код, например R01. Не используйте личные данные.
              </small>
              {codeError && <p className="analytics-field-error" id={`${participantCodeId}-error`} role="alert">{codeError}</p>}
            </div>

            <label className="analytics-qa-toggle" htmlFor={qaModeId}>
              <input
                id={qaModeId}
                type="checkbox"
                checked={draftQaMode}
                onChange={(event) => setDraftQaMode(event.target.checked)}
              />
              <span>
                <strong>Режим QA</strong>
                <small>QA-события остаются локально и не отправляются в production PostHog.</small>
              </span>
            </label>

            <section className="analytics-history" aria-labelledby={`${participantCodeId}-history-title`}>
              <div>
                <h3 id={`${participantCodeId}-history-title`}>Локальная история</h3>
                <p>
                  Очистит события только в этом браузере. События, уже отправленные на сервер, не удаляются.
                </p>
              </div>
              {!confirmingClear ? (
                <button className="analytics-clear-button" type="button" onClick={() => { setConfirmingClear(true); setHistoryCleared(false); }}>
                  <Trash2 size={16} aria-hidden="true" />
                  Очистить
                </button>
              ) : (
                <div className="analytics-clear-confirm" role="alert">
                  <span>Очистить историю в этом браузере?</span>
                  <div>
                    <button className="button secondary" type="button" onClick={() => setConfirmingClear(false)}>Отмена</button>
                    <button className="button analytics-danger" type="button" onClick={clearHistory}>Очистить</button>
                  </div>
                </div>
              )}
            </section>
            <p className="analytics-status" role="status" aria-live="polite">
              {historyCleared ? 'Локальная история очищена.' : ''}
            </p>

            <div className="analytics-modal-actions">
              <button className="button secondary" type="button" onClick={closeSettings}>Отмена</button>
              <button className="button primary" type="button" onClick={saveSettings}>Сохранить</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
