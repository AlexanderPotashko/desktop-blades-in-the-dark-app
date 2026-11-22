import { describe, expect, it } from 'vitest';
import ru from '../../../locales/ru.json';
import en from '../../../locales/en.json';
import { contentText, detectLang, t } from '..';

describe('i18n', () => {
  it('ru and en have the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });
  it('Russian plurals', () => {
    expect(t('count.stress', { n: 1 }, 'ru')).toBe('1 стресс');
    expect(t('count.stress', { n: 2 }, 'ru')).toBe('2 стресса');
    expect(t('count.stress', { n: 5 }, 'ru')).toBe('5 стрессов');
    expect(t('count.stress', { n: 21 }, 'ru')).toBe('21 стресс');
    expect(t('count.stress', { n: 11 }, 'ru')).toBe('11 стрессов');
  });
  it('English plurals and plain keys', () => {
    expect(t('count.coin', { n: 1 }, 'en')).toBe('1 coin');
    expect(t('count.coin', { n: 3 }, 'en')).toBe('3 coins');
    expect(t('tab.gear', {}, 'en')).toBe('Gear');
  });
  it('falls back to ru for a missing key', () => {
    const d = en as Record<string, unknown>;
    const saved = d['tab.gear'];
    delete d['tab.gear'];
    expect(t('tab.gear', {}, 'en')).toBe('Снаряжение');
    d['tab.gear'] = saved;
  });
  it('contentText: per language, fallback to ru, unknown id', () => {
    expect(contentText('en', 'tinker')?.name).toBe('Tinker');
    expect(contentText('en', 'tinker', 'leech')?.name).toBe('Artificer');
    expect(contentText('ru', 'leech')?.name).toBe('Умелец');
    expect(contentText('de', 'leech')?.name).toBe('Умелец');
    expect(contentText('en', 'nope')).toBeUndefined();
  });
  it('detectLang', () => {
    expect(detectLang(['en-US'])).toBe('en');
    expect(detectLang(['de-DE', 'ru-RU'])).toBe('ru');
    expect(detectLang(['de-DE'])).toBe('ru');
  });
});
