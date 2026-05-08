# formant — a browser-based vocal synthesizer

![](https://files.catbox.moe/p39ki0.png)

**formant** is a web-based vocal synth that lets you type words, edit phonemes, assign pitches on a piano roll, all to make the computer sing! all synthesis happens in real-time using formant synthesis. :3


**[try it live!](https://jantorialis.github.io/formant)**

---

## features

### core
- **formant synthesis** — generates voice-like sounds using 3 parallel formant filters, the same technology behind early vocaloids and text-to-speech systems
- **arpabet phonemes** — supports standard american english phonemes plus extended diphthongs

### editing
- **automatic syllable splitting** — typed words are automatically divided into syllables using vowel detection
- **piano roll editor** — click any cell to assign pitches from c3 to b5 ( 36 notes )
- **phoneme picker** — categorized into vowels, consonants, and diphthongs
- **per-syllable duration** — each syllable can be stretched from 0.05 to 5.0 seconds
- **syllable list** — add or remove syllables to any word

### sharing & export
- **wav export** — download your song as a 44.1khz 16-bit wav file
- **share links** — encode your entire project ( words, pitches, durations, phonemes ) into a shareable url
- **local storage** — save/load projects in your browser

---

## how it works

### synthesis

typed text → syllable splitting → phoneme mapping → arpabet string → klattsch engine → web audio → speakers

1. **syllable splitting**: uses regex to split words by vowel sounds
2. **phoneme conversion**: each letter maps to an arpabet phoneme ( a → aa, e → eh, i → ih, etc. )
3. **expansion**: diphthongs like `ba` expand to `b aa` before synthesis
4. **scheduling**: the klattsch engine compiles the phoneme string into a time stamped schedule
5. **rendering**: an audioworklet processes the schedule in real-time using parallel-formant synthesis

### what is formant synthesis?

when you speak, your vocal cords produce a buzzy sound. your mouth and throat act as filters, amplifying certain frequencies ( called **formants** ) while dampening others. different vowel sounds are created by changing the shape of your vocal tract, which change these formant frequencies.

formant synthesis mimics this process:
- a glottal pulse generator creates the "buzz" ( voiced source )
- noise generators create fricatives and aspiration ( unvoiced source )
- bandpass filters shape the sound according to formant frequencies

---

## phoneme guide

### vowels ( 15 )

| code | sounds like | example |
|------|-------------|---------|
| iy   | ee          | beat |
| ih   | ih          | bit |
| ey   | ay          | bait |
| eh   | eh          | bet |
| ae   | ae          | cat |
| aa   | ah (open)   | father |
| ah   | uh          | cup |
| ao   | aw          | bought |
| aw   | ow          | about |
| ay   | ai          | bite |
| ow   | oh          | boat |
| oy   | oy          | boy |
| uh   | uh (short)  | book |
| uw   | oo          | boot |
| er   | er          | bird |

### consonants ( 25 )

| type | phonemes |
|------|----------|
| plosives | p, b, t, d, k, g |
| fricatives | f, v, th, dh, s, z, sh, zh, hh |
| nasals | m, n, ng |
| approximants | w, y, r, l |
| affricates | ch, jh |

### cv ( consonant + vowel ) diphthongs

examples:  `ba, da, fa, ga, ha, ja, ka, la, ma, na, pa, ra, sa, sha, ta, tha, dha, va, wa, ya, za, cha`

these automatically expand to consonant + vowel ( e.g., `ba` → `b aa` ).

### vc ( vowel + consonant ) diphthongs

examples:  `ab, ad, am, an, at, eed, een, eet, ood, oot, oun, out`

these automatically expand to vowel + consonant ( e.g., `eed` → `iy d` ).

---

## interface guide

### 01 — write something
- type any words in the input field
- press enter or click "parse →" to convert to syllables

### 02 — tune your words
- click a word to select it
- the piano roll appears showing each syllable as a column
- click any cell to assign a pitch to that syllable
- use octave buttons to show/hide different octave ranges
- below the piano roll, you can:
  - add / remove syllables
  - edit syllable text
  - edit phonemes ( click + to add, click  `×` to remove )
  - adjust duration ( 0.05 to 5.0 seconds )
- click a syllable chip to edit it

### 03 — perform
- **play** — sing the current song
- **stop** — stop playback
- **share** — generate a shareable url containing the entire song
- **download wav** — export audio as a 44.1khz 16-bit wav file
- **save** — save current project to browser local storage
- **load** — load a saved project from local storage
- **clear save** — clears a saved project from local storage

### ? — help
- click to expand / collapse documentation
- contains phoneme tables and usage tips

---

## technical details

### file structure

```
formant/
├── index.html              # main page structure
├── css/
│   └── style.css           # all styles
└── js/
    ├── ui.js               # main application logic
    └── klattsch-engine.js  # klattsch audio engine wrapper
```

## modifying the code

### useful functions in ui.js

| function | purpose |
|----------|---------|
| parseWords() | splits typed text into syllables, creates phoneme arrays |
| makeSyl(text) | creates a new syllable object with default values |
| splitSyllables(word) | divides a word into syllables using vowel detection |
| splitWordToPhonemes(word) | converts letters to arpabet phonemes |
| expandPhoneme(ph) | maps cv / vc diphthongs to arpabet sequences |
| renderPianoRoll(wi) | draws the piano roll for a word |
| selectNote(note, wi, si) | assigns a pitch to a syllable |
| playSong() | builds the phoneme string and triggers synthesis |
| downloadWav() | exports audio as wav file |
| saveToLocalStorage() | saves project to browser |
| loadFromLocalStorage() | loads project from browser |
| generateShareLink() | encodes song data in url |

### adding new phonemes

1. add the phoneme code to `ALL_PHONEMES` array
2. if it's a diphthong, add an entry to `expandPhoneme():
   'NEW': 'P H O N E M E S'`
3. the phoneme will automatically appear in the picker

### adjusting piano roll range

modify `ALL_OCTAVES`

`const ALL_OCTAVES = [5, 4, 3];` ← add more numbers

### changing default duration

in `makeSyl():`

`dur: 0.2` ← change this!

---

## credits

### creator
lace / torialis / jantorialis — development, ui, phoneme expansion, web integration

### core library
[klattsch](https://github.com/tgies/klattsch) — speech synthesizer by [tony gies](https://github.com/tgies/)
- formant synthesis engine
- arpabet compiler
- audioworklet processor

### fonts
- [m plus rounded 1c](https://fonts.google.com/specimen/M+PLUS+Rounded+1c) — by coji morishita
- [space mono](https://fonts.google.com/specimen/Space+Mono) — by  colophon foundry

### special thanks
- [tony gies](https://github.com/tgies/) for building klattsch and making it open source

---

### third-party licenses
- klattsch — mit license (c) 2025 tony gies
- m plus rounded 1c — sil open font license 1.1
- space mono — sil open font license 1.1

---

### note for derivatives

if you use this project as a base for your own work:
- attribution is appreciated but not required
- consider linking back to the original repository
- you can rename and modify freely
