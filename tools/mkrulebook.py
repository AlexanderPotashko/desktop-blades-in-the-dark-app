"""rulebook.txt (=====PAGE N===== markers) -> rulebook.js: window.RULEBOOK={pages:[{p,b,t}], toc:[{h,p,lvl}]}
p = PDF page, b = book page (p-5), t = cleaned text (paragraphs separated by \n)."""
import re, json, sys

src, dst = sys.argv[1], sys.argv[2]
raw = open(src, encoding='utf-8').read()
parts = re.split(r'\n?=====PAGE (\d+)=====\n', raw)
HEAD = re.compile(r'^[А-ЯЁ][А-ЯЁ ,\-—:«»()0-9]{4,60}$')
# running chapter titles printed at the top of every page
RUNNING = {'Основы', 'Персонажи', 'Команда', 'Дело', 'Передышка', 'Как играть', 'Как вести игру',
           'Мистические силы', 'Изменения в игре', 'Город мрака', 'Игровой мир'}
pages, toc, last_h, prev_heads = [], [], None, set()
for i in range(1, len(parts), 2):
    pno, body = int(parts[i]), parts[i + 1]
    lines = [l.rstrip() for l in body.split('\n')]
    out, heads = [], set()
    for li, l in enumerate(lines):
        st = l.strip()
        if not st:
            continue
        if re.fullmatch(r'\d{1,3}', st):          # running page numbers / chapter digits
            continue
        if li < 4 and st in RUNNING:              # running chapter title
            continue
        if HEAD.match(st) and not out and st in prev_heads:   # running section head repeated from previous page
            heads.add(st)
            continue
        if HEAD.match(st):
            heads.add(st)
            recent = [t['h'].upper() for t in toc[-4:]]
            if st != last_h and st.upper() not in recent and st not in ('СОДЕРЖАНИЕ',):
                lvl = 1 if st.startswith('ГЛАВА') else 2
                h = st.capitalize()
                if lvl == 1:
                    nxt = next((x.strip() for x in lines[li+1:] if x.strip() and not re.fullmatch(r'\d{1,3}', x.strip())), '')
                    h = st.capitalize() + (' — ' + nxt.capitalize() if nxt and not HEAD.match(nxt) else '')
                if pno >= 10:                     # skip front matter and the printed contents pages
                    toc.append({'h': h, 'p': pno, 'lvl': lvl})
                last_h = st
            out.append('\n## ' + st + '\n')
            continue
        if out and not out[-1].endswith('\n'):
            prev = out[-1]
            if re.search(r'[\-‑­]$', prev) and re.match(r'[а-яё]', st):   # hyphenated word across lines
                out[-1] = prev[:-1] + st
                continue
            if st.startswith('◆') or re.search(r'[.!?:»)]$', prev) and re.match(r'[А-ЯЁ«◆0-9]', st):
                out.append('\n' + st)
                continue
            out[-1] = prev + ' ' + st
            continue
        out.append(st)
    text = re.sub(r'\n{2,}', '\n', ''.join(out)).strip()
    text = re.sub(r'[  ]{2,}', ' ', text)
    # printed contents pages: one entry per line («Название.....12»)
    text = re.sub(r'(\.{2,}[\s.]*\d{1,3})\s+(?=[А-ЯЁA-Z])', r'\1\n', text)
    prev_heads = heads
    pages.append({'p': pno, 'b': pno - 5, 't': text})
js = 'window.RULEBOOK=' + json.dumps({'pages': pages, 'toc': toc}, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(dst, 'w', encoding='utf-8').write('// Локальная копия текста рулбука для поиска в бланке. Только для личного использования, не публиковать.\n' + js)
print(len(pages), 'pages,', len(toc), 'toc entries,', len(js) // 1024, 'KB')
