import { useState, type FormEvent } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { useProfile } from '../hooks/useProfile';
import { useResetData } from '../hooks/useResetData';
import { useToast } from '../hooks/useToast';
import type { UserProfile } from '../types';
import { Modal } from './Modal';

export function ProfileSettings({ onClose }: { onClose: () => void }) {
  const { profile, updateProfile } = useProfile();
  const { toast } = useToast();
  const reset = useResetData();
  const [confirmReset, setConfirmReset] = useState(false);
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [dislikes, setDislikes] = useState(profile.dislikes.join(', '));
  const [allergies, setAllergies] = useState(profile.allergies.join(', '));
  function submit(event: FormEvent) {
    event.preventDefault();
    updateProfile({ ...draft, dislikes: split(dislikes), allergies: split(allergies) });
    toast('Профиль сохранён — подбор обновлён');
    onClose();
  }
  return <Modal title={confirmReset ? 'Сбросить данные Cookly?' : 'Мой профиль'} onClose={onClose}>
    {confirmReset ? <div className="confirm-panel"><p>Очистятся холодильник, профиль, оценки, выбор порций и замен, код участника и локальная история событий Cookly.</p><p>Ранее отправленные обезличенные события в PostHog останутся в защищённой статистике. Это действие нельзя отменить.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setConfirmReset(false)} autoFocus>Отмена</button><button className="button danger" onClick={reset}>Сбросить локальные данные</button></div></div> : <form className="profile-form" onSubmit={submit}>
      <p className="muted">Порции и рекомендации с учётом вашей семьи.</p>
      <fieldset><legend>Сколько человек в семье?</legend><div className="segmented">{[1,2,3,4,5,6].map(value => <label key={value} className={draft.familySize === value ? 'selected' : ''}><input type="radio" name="family" value={value} checked={draft.familySize === value} onChange={() => setDraft({ ...draft, familySize: value })}/>{value}</label>)}</div></fieldset>
      <fieldset><legend>Есть дети?</legend><div className="segmented two">{[true,false].map(value => <label key={String(value)} className={draft.hasChildren === value ? 'selected' : ''}><input type="radio" name="children" checked={draft.hasChildren === value} onChange={() => setDraft({ ...draft, hasChildren: value })}/>{value ? 'Да' : 'Нет'}</label>)}</div></fieldset>
      <div className="profile-fields"><label>Не люблю<input value={dislikes} maxLength={400} onChange={event => setDislikes(event.target.value)} placeholder="грибы, оливки"/><small>Перечислите продукты через запятую</small></label><label>Аллергии<input value={allergies} maxLength={400} onChange={event => setAllergies(event.target.value)} placeholder="орехи, молоко"/><small>Рецепты с этими продуктами исключим</small></label></div>
      <div className="profile-fields"><label>Питание<select value={draft.dietary} onChange={event => setDraft({ ...draft, dietary: event.target.value as UserProfile['dietary'] })}>{['Без ограничений','Вегетарианское','Без свинины','Без лактозы','Другое'].map(item => <option key={item}>{item}</option>)}</select></label><label>Сложность<select value={draft.difficulty} onChange={event => setDraft({ ...draft, difficulty: event.target.value as UserProfile['difficulty'] })}>{['Любые','Простые блюда','Средние'].map(item => <option key={item}>{item}</option>)}</select></label></div>
      {draft.dietary === 'Другое' && <p className="muted">Укажите конкретные продукты в полях выше. Отдельный режим питания пока не задан.</p>}
      <button className="button primary profile-save" type="submit"><Check size={17}/> Сохранить профиль</button>
      <div className="reset-section"><strong>Начать с чистого листа</strong><p>Удалить локальные данные Cookly на этом устройстве. Серверная аналитика при этом не удаляется.</p><button type="button" className="text-button danger-text" onClick={() => setConfirmReset(true)}><RotateCcw size={16}/> Сбросить тестовые данные</button></div>
    </form>}
  </Modal>;
}
function split(value: string) { return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 20))]; }
