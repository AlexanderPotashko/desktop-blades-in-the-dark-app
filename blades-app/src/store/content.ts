// Book content as typed lookups: content/core (ids, numbers) validated by the schemas; names and texts come from
// i18n `contentText` (content/<lang>), so a language switch needs no reload.
import { CommonContent, Playbook, type Action, type ContentItem } from '../model';
import { indexTalents, type TalentDefs } from '../engine/talents';
import { contentText, getLang } from '../i18n';
import common from '../../content/core/common.json';

const files = import.meta.glob('../../content/core/playbooks/*.json', { eager: true, import: 'default' });

export const commonContent = CommonContent.parse(common);
export const playbookList: Playbook[] = Object.values(files).map((f) => Playbook.parse(f));
export const playbooks: Record<string, Playbook> = Object.fromEntries(playbookList.map((p) => [p.id, p]));
export const talentDefs: TalentDefs = indexTalents(playbookList);
export const actionDefs: Action[] = commonContent.actions;

/** Standard and playbook items by id. */
export const itemDefs: Record<string, ContentItem> = Object.fromEntries(
  [...commonContent.items, ...playbookList.flatMap((p) => p.items)].map((i) => [i.id, i]),
);
/** Armor boxes by book item id (what `armorAvailable` wants). */
export const bookArmor: Record<string, number | undefined> = Object.fromEntries(
  Object.values(itemDefs).map((i) => [i.id, i.armor]),
);

/** Localized book name; the id itself if the text is missing. */
export const bookName = (id: string): string => contentText(getLang(), id)?.name ?? id;
export const bookText = (id: string): string => contentText(getLang(), id)?.text ?? '';
