//! Tokenizing and stemming shared by import and search (they MUST agree).
//! Lowercase, ё -> е, a word = a run of alphanumerics; Cyrillic words use the Russian stemmer, others English.
use super::Seg;
use rust_stemmers::{Algorithm, Stemmer};

pub struct Stemmers {
    ru: Stemmer,
    en: Stemmer,
}

/// (byte start, byte end, stem) of every word.
type Word = (usize, usize, String);

impl Stemmers {
    pub fn new() -> Self {
        Stemmers { ru: Stemmer::create(Algorithm::Russian), en: Stemmer::create(Algorithm::English) }
    }

    fn stem_word(&self, raw: &str) -> String {
        let w = raw.to_lowercase().replace('ё', "е");
        let s = if w.chars().any(|c| ('\u{400}'..='\u{4ff}').contains(&c)) { &self.ru } else { &self.en };
        s.stem(&w).into_owned()
    }

    /// Lazily: callers that stop early (snippets) do not stem the rest of the page.
    fn words<'a>(&'a self, text: &'a str) -> impl Iterator<Item = Word> + 'a {
        let mut start = None;
        text.char_indices().chain(std::iter::once((text.len(), ' '))).filter_map(move |(i, c)| match (c.is_alphanumeric(), start) {
            (true, None) => {
                start = Some(i);
                None
            }
            (false, Some(s)) => {
                start = None;
                Some((s, i, self.stem_word(&text[s..i])))
            }
            _ => None,
        })
    }

    pub fn stem_words(&self, text: &str) -> Vec<String> {
        self.words(text).map(|w| w.2).collect()
    }

    /// The text stored in `rb_fts`.
    pub fn stem_text(&self, text: &str) -> String {
        self.stem_words(text).join(" ")
    }

    /// ~60 chars before the first matching word and ~140 after, matched words flagged.
    /// A word matches when its stem equals a query stem (or starts with it in `prefix` mode).
    pub fn snippet(&self, text: &str, stems: &[String], prefix: bool) -> Vec<Seg> {
        let hit = |s: &str| stems.iter().any(|q| if prefix { s.starts_with(q.as_str()) } else { s == q });
        let mut words = self.words(text);
        let Some(first) = words.by_ref().find(|w| hit(&w.2)) else {
            let end = text.char_indices().nth(200).map_or(text.len(), |(i, _)| i);
            return vec![Seg { text: text[..end].into(), hit: false }];
        };
        let from = text[..first.0].char_indices().rev().nth(59).map_or(0, |(i, _)| i);
        let to = text[first.1..].char_indices().nth(140).map_or(text.len(), |(i, _)| first.1 + i);
        // words before `first` are never highlighted (it is the first match); later ones only up to `to`
        let mut segs = vec![];
        let mut at = from;
        for (s, e, st) in std::iter::once(first).chain(words.take_while(|w| w.1 <= to)) {
            if s >= from && hit(&st) {
                if s > at {
                    segs.push(Seg { text: text[at..s].into(), hit: false });
                }
                segs.push(Seg { text: text[s..e].into(), hit: true });
                at = e;
            }
        }
        if at < to {
            segs.push(Seg { text: text[at..to].into(), hit: false });
        }
        if from > 0 {
            segs[0].text.insert(0, '…');
        }
        if to < text.len() {
            segs.last_mut().unwrap().text.push('…');
        }
        segs
    }
}
