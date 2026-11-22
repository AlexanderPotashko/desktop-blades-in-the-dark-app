// Prototype (charsheet.html) Russian names and item keys -> content ids.
// Single place to reconcile with content/core when ids change.

export const PLAYBOOK = 'leech';

export const ACTIONS: Record<string, string> = {
  'Изучение': 'study', 'Охота': 'hunt', 'Разведка': 'survey', 'Ремесло': 'tinker',
  'Драка': 'skirmish', 'Проникновение': 'prowl', 'Разрушение': 'wreck', 'Сноровка': 'finesse',
  'Манипулирование': 'sway', 'Общение': 'consort', 'Приказ': 'command', 'Резонанс': 'attune',
};

export const XP: Record<string, 'insight' | 'prowess' | 'resolve' | 'playbook'> = {
  'Чутьё': 'insight', 'Удаль': 'prowess', 'Воля': 'resolve', 'Талант': 'playbook',
};

export const TALENTS: Record<string, string> = {
  // Leech
  'Алхимик': 'alchemist', 'Аналитик': 'analyst', 'Врач': 'physicker', 'Инженер': 'tinker',
  'Призрачный барьер': 'ghost-ward', 'Саботажник': 'saboteur', 'Стойкость': 'fortitude', 'Ядовитость': 'venomous',
  // Slide
  'Рокировка': 'rooks-gambit', 'Гипнотизёр': 'mesmerism', 'Доверься мне': 'trust-in-me', 'Изворотливость': 'subterfuge',
  'Обмани меня': 'like-looking-into-a-mirror', 'Плащ и кинжал': 'cloak-and-dagger', 'Призрачный голос': 'ghost-voice',
  'Халтурка': 'a-little-something-on-the-side',
  // Cutter
  'Прирождённый боец': 'battleborn', 'Истребитель призраков': 'ghost-fighter', 'Как на собаке': 'vigorous',
  'Лидер': 'leader', 'Мул': 'mule', 'Не шути со мной': 'not-to-be-trifled-with', 'Свирепость': 'savage',
  'Телохранитель': 'bodyguard',
  // Hound
  'Меткий стрелок': 'sharpshooter', 'Мстительность': 'vengeful', 'Несгибаемость': 'tenacious',
  'Призрачная гончая': 'ghost-hound', 'Разведчик': 'scout', 'Собранность': 'focused', 'Уцелевший': 'survivor',
  // Spider
  'Предвидение': 'foresight', 'Комбинатор': 'mastermind', 'Контролируемая страсть': 'functioning-vice',
  'Ниточки': 'weaving-the-web', 'Призрачный договор': 'ghost-contract', 'Расчётливость': 'calculating',
  'Связи': 'connected', 'Сиделец': 'jail-bird',
  // Whisper
  'Принуждение': 'compel', 'Буря': 'tempest', 'Железная воля': 'iron-will', 'Магическая защита': 'warded',
  'Призрачный разум': 'ghost-mind', 'Оккультист': 'occultist', 'Ритуал': 'ritual', 'Странные методы': 'strange-methods',
  // Lurk
  'Диверсант': 'infiltrator', 'Быстрая реакция': 'reflexes', 'Дьявольская ловкость': 'devils-footsteps',
  'Засада': 'ambush', 'Призрачность': 'ghost-veil', 'Сорвиголова': 'daredevil', 'Тень': 'shadow', 'Эксперт': 'expertise',
};

/** Prototype SPECIAL: talents shown as special-armor checkboxes. */
export const SPECIAL_ARMOR = ['Стойкость', 'Изворотливость', 'Прирождённый боец', 'Собранность', 'Комбинатор', 'Магическая защита', 'Тень'];

/** Prototype TC: counter presets per talent. `book: false` ones become table presets. */
export const TALENT_PRESETS: Record<string, { book: boolean; n: string; max: number | ''; r: 'day' | 'downtime' | 'score' | 'none'; h: string }> = {
  'Ядовитость': { book: false, n: 'Производство анестезии за день', max: '', r: 'day', h: '1-е за день — 1 стресс, дальше по 2 (особое усилие)' },
  'Аналитик': { book: true, n: 'Доп. деления на проекты', max: 2, r: 'downtime', h: '+2 деления на расследования / рецепты / схемы' },
  'Призрачный барьер': { book: true, n: 'Барьер держится, дней', max: '', r: 'none', h: 'область размером с комнату, несколько дней' },
};

export const HERITAGES: Record<string, string> = {
  'Акорос': 'akoros', 'Ирувия': 'iruvia', 'Кинжальные острова': 'the-dagger-isles', 'Сиверос': 'severos', 'Сковлан': 'skovlan', 'Тихерос': 'tycheros',
};
export const BACKGROUNDS: Record<string, string> = {
  'Аристократ': 'noble', 'Военный': 'military', 'Законник': 'law', 'Рабочий': 'labor', 'Торговец': 'trade', 'Учёный': 'academic', 'Шпана': 'underworld',
};
export const VICES: Record<string, string> = {
  'Азартные игры': 'gambling', 'Беспамятство': 'stupor', 'Долг': 'obligation', 'Наслаждения': 'pleasure',
  'Потустороннее': 'weird', 'Религия': 'faith', 'Роскошь': 'luxury',
};
export const TRAUMAS: Record<string, string> = {
  'Визионер': 'haunted', 'Маньяк': 'obsessed', 'Параноик': 'paranoid', 'Псих': 'unstable',
  'Раздолбай': 'reckless', 'Садист': 'vicious', 'Социопат': 'cold', 'Тряпка': 'soft',
};
export const FRIENDS: Record<string, string> = {
  'Стация, аптекарь': 'stazia', 'Вельдрен, психонавт': 'veldren', 'Экерд, похититель трупов': 'eckerd',
  'Джул, торговец кровью': 'jul', 'Малиста, жрица': 'malista',
};
export const FLAWS: Record<string, string> = {
  'ненадёжное': 'unreliable', 'опасное': 'dangerous', 'подозрительное': 'suspicious',
  'расходное': 'consumable', 'редкое': 'rare', 'сложное': 'complex',
};
export const ITEM_TYPES: Record<string, 'alchemical' | 'arcane' | 'spark-craft'> = {
  'алхимия': 'alchemical', 'магия': 'arcane', 'искровой': 'spark-craft',
};

/**
 * Prototype book item keys (D.special `s*`, D.common `c*`): content id, prototype name and load.
 * `rename`: the prototype split or duplicated a book item, so its own name is kept on import.
 * `id: null`: no such book item in content -> imported as a custom item.
 */
export const ITEMS: Record<string, { id: string | null; name: string; load: number; armor?: number; rename?: boolean }> = {
  s0: { id: 'fine-tinkering-tools', name: 'Добротные инструменты механика', load: 1 },
  s1: { id: 'fine-wrecking-tools', name: 'Добротные инструменты для сноса', load: 2 },
  s2: { id: 'blowgun-and-darts', name: 'Духовая трубка', load: 0, rename: true },
  s3: { id: 'alchemists-bandolier', name: 'Перевязь алхимика', load: 1 },
  s4: { id: null, name: 'Вторая перевязь алхимика', load: 1 }, // not in the Russian rulebook
  s5: { id: 'gadgets', name: 'Устройство', load: 1, rename: true },
  s6: { id: 'gadgets', name: 'Устройство', load: 1, rename: true },
  s7: { id: 'gadgets', name: 'Устройство', load: 1, rename: true },
  s8: { id: 'blowgun-and-darts', name: 'Дротики (под алхимию)', load: 0, rename: true },
  s9: { id: 'blowgun-and-darts', name: 'Пустые шприцы', load: 0, rename: true },
  c0: { id: 'blade-or-two', name: 'Клинок или два', load: 1 },
  c1: { id: 'throwing-knives', name: 'Метательные ножи', load: 1 },
  c2: { id: 'pistol', name: 'Пистолет', load: 1 },
  c3: { id: 'pistol', name: 'Второй пистолет', load: 1, rename: true },
  c4: { id: 'large-weapon', name: 'Большое оружие', load: 2 },
  c5: { id: 'unusual-weapon', name: 'Необычное оружие', load: 1 },
  c6: { id: 'armor', name: 'Доспех', load: 2, armor: 1 },
  c7: { id: 'heavy-armor', name: '+Тяжёлый доспех', load: 3, armor: 1 },
  c8: { id: 'documents', name: 'Документы', load: 1 },
  c9: { id: 'demolition-tools', name: 'Инструменты для сноса', load: 2 },
  c10: { id: 'tinkering-tools', name: 'Инструменты механика', load: 1 },
  c11: { id: 'arcane-implements', name: 'Магические приспособления', load: 1 },
  c12: { id: 'lantern', name: 'Светильник', load: 1 },
  c13: { id: 'climbing-gear', name: 'Снаряжение верхолаза', load: 2 },
  c14: { id: 'lockpicks', name: 'Снаряжение взломщика', load: 1 },
  c15: { id: 'disguise-kit', name: 'Средства перевоплощения', load: 1 },
  c16: { id: 'spirit-bane-charm', name: 'Оберег против духов', load: 0 },
};
