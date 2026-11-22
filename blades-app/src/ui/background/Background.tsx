// Biography tab: heritage / background / vice (book or custom), look, friends and rivals, notes.
import { contentText, getLang, t } from '../../i18n';
import type { Contact } from '../../model';
import { addContact, flipContact, removeContact, setBio, setContact, setOrigin, setOriginName, setOriginNote, type OriginKey } from '../../store/backgroundActions';
import { bookName, commonContent, playbooks } from '../../store/content';
import { useStore } from '../../store/store';
import '../notes/notes.css';

const CUSTOM = '__custom', NONE = '';
const LISTS: Record<OriginKey, string[]> = {
  heritage: commonContent.heritages.map((x) => x.id),
  background: commonContent.backgrounds.map((x) => x.id),
  vice: commonContent.vices.map((x) => x.id),
};

function OriginField({ k }: { k: OriginKey }) {
  const o = useStore((s) => s.doc![k]);
  const value = o.bookId ?? (o.name !== undefined ? CUSTOM : NONE);
  const short = o.bookId ? contentText(getLang(), o.bookId)?.short : undefined;
  return (
    <div>
      <label>{t(`bio.${k}`)}</label>
      <select aria-label={t(`bio.${k}`)} data-testid={`origin-${k}`} value={value}
        onChange={(e) => { const v = e.target.value; setOrigin(k, v === CUSTOM ? { name: '' } : v === NONE ? {} : { bookId: v }); }}>
        <option value={NONE}>{t('bio.none')}</option>
        {LISTS[k].map((id) => <option key={id} value={id}>{bookName(id)}</option>)}
        <option value={CUSTOM}>{t('bio.custom')}</option>
      </select>
      {o.name !== undefined && (
        <input aria-label={t('bio.customPh')} data-testid={`origin-${k}-name`} value={o.name} placeholder={t('bio.customPh')} onChange={(e) => setOriginName(k, e.target.value)} />
      )}
      {short && <div className="small">{short}</div>}
      <input aria-label={t(`bio.${k}Note`)} value={o.note} placeholder={t(`bio.${k}Note`)} onChange={(e) => setOriginNote(k, e.target.value)} />
    </div>
  );
}

/** Book contacts show the localized "Name, who they are"; a custom one carries its own name. */
export const contactName = (c: Contact) => {
  if (c.name !== undefined && (c.name || !c.bookId)) return c.name;
  const x = c.bookId ? contentText(getLang(), c.bookId) : undefined;
  return x ? [x.name, x.short].filter(Boolean).join(', ') : (c.bookId ?? '');
};

function ContactRow({ c }: { c: Contact }) {
  const book = !!c.bookId;
  return (
    <div className={`contact ${c.rel}`} data-contact={c.id}>
      <button className="tri" title={t(c.rel === 'up' ? 'bio.friend' : 'bio.rival')} aria-label={t(c.rel === 'up' ? 'bio.friend' : 'bio.rival')} onClick={() => flipContact(c.id)}>{c.rel === 'up' ? '▲' : '▼'}</button>
      {book ? <span className="bn">{contactName(c)}</span>
        : <input aria-label={t('bio.contactName')} value={c.name ?? ''} placeholder={t('bio.contactName')} onChange={(e) => setContact(c.id, { name: e.target.value })} />}
      <input aria-label={t('bio.contactNote')} value={c.note} placeholder={t('bio.contactNote')} onChange={(e) => setContact(c.id, { note: e.target.value })} />
      <button onClick={() => removeContact(c.id)} title={t('remove')} aria-label={t('remove')}>✕</button>
    </div>
  );
}

export function Background() {
  const doc = useStore((s) => s.doc)!;
  const idle = (playbooks[doc.playbookId]?.friends ?? []).filter((id) => !doc.contacts.some((c) => c.bookId === id));
  return (
    <main id="bio">
      <section>
        <h2>{t('tab.background')}</h2>
        <div className="bio3">
          <OriginField k="heritage" />
          <OriginField k="background" />
          <OriginField k="vice" />
        </div>
        <label>{t('bio.look')}</label>
        <textarea className="grow" value={doc.look} placeholder={t('bio.lookPh')} onChange={(e) => setBio('look', e.target.value)} />
        <label title={t('bio.contactsTip')}>{t('bio.contacts')} ⓘ</label>
        <div data-testid="contacts">
          {doc.contacts.map((c) => <ContactRow key={c.id} c={c} />)}
        </div>
        <select aria-label={t('bio.addContact')} data-testid="add-contact" value="" style={{ width: 'auto', marginTop: 4 }}
          onChange={(e) => { const v = e.target.value; if (v) addContact(v === CUSTOM ? undefined : v); }}>
          <option value="">{t('bio.addContact')}</option>
          {idle.length > 0 && (
            <optgroup label={t('bio.fromBook')}>
              {idle.map((id) => <option key={id} value={id}>{contactName({ id, bookId: id, rel: 'up', note: '' })}</option>)}
            </optgroup>
          )}
          <option value={CUSTOM}>{t('bio.customContact')}</option>
        </select>
        <label>{t('bio.notes')}</label>
        <textarea className="grow" value={doc.notes} placeholder={t('bio.notesPh')} onChange={(e) => setBio('notes', e.target.value)} />
      </section>
    </main>
  );
}
