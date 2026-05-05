import klattschEngine from './klattsch-engine.js';

let words = [];
let activeWIdx = null;
let activeSIdx = null;
let globalOpts = { spacing: 0 };

let audioInitialized = false;
let stopRequested = false;

window.setStatus = setStatus;

async function initAudio() {
    if (audioInitialized) return true;
    
    try {
        await klattschEngine.init();
        audioInitialized = true;
        setStatus('ready');
        return true;
    } catch (e) {
        console.error('failed to start audio:', e);
        setStatus('click anywhere to enable audio');
        return false;
    }
}

const $ = id => document.getElementById(id);

const NOTE_NAMES_DESC = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];
const ALL_OCTAVES = [5, 4, 3];
let visibleOctaves = new Set([4]);

function buildRollNotes() {
    const notes = [];
    for (const oct of ALL_OCTAVES) {
        if (!visibleOctaves.has(oct)) continue;
        for (const n of NOTE_NAMES_DESC) {
            notes.push(n + oct);
        }
    }
    return notes;
}

const COL_W = 64;

function isBlackNote(noteName) {
    return noteName.includes('#');
}

function isCNote(noteName) {
    return noteName.startsWith('C') && !noteName.includes('#');
}

function normalizeNote(note) {
    const flat2sharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
    const m = note.match(/^([A-G]b?)(\d)$/);
    if (!m) return note;
    const name = flat2sharp[m[1]] || m[1];
    return name + m[2];
}

let rollCollapsed = false;

function togglePianoRoll() {
    rollCollapsed = !rollCollapsed;
    const body = document.getElementById('pianoRollBody');
    const arrow = document.getElementById('rollArrow');
    if (body) body.classList.toggle('collapsed', rollCollapsed);
    if (arrow) arrow.classList.toggle('open', !rollCollapsed);
}

function buildOctaveBtns() {
    const wrap = document.getElementById('octaveBtns');
    if (!wrap) return;
    wrap.innerHTML = '';
    ALL_OCTAVES.slice().reverse().forEach(oct => {
        const btn = document.createElement('button');
        btn.className = 'piano-roll-toggle' + (visibleOctaves.has(oct) ? ' active' : '');
        btn.textContent = 'oct ' + oct;
        btn.addEventListener('click', () => {
            if (visibleOctaves.has(oct)) {
                if (visibleOctaves.size <= 1) return;
                visibleOctaves.delete(oct);
            } else {
                visibleOctaves.add(oct);
            }
            buildOctaveBtns();
            if (activeWIdx !== null) renderPianoRoll(activeWIdx);
        });
        wrap.appendChild(btn);
    });
}

function renderPianoRoll(wi) {
    const keysEl = document.getElementById('pianoKeys');
    const gridEl = document.getElementById('pianoGrid');
    if (!keysEl || !gridEl) return;

    const ROLL_NOTES = buildRollNotes();
    const w = words[wi];
    const syls = w ? w.syllables : [];
    const numCols = Math.max(syls.length, 16);

    keysEl.innerHTML = '';
    const keySpacer = document.createElement('div');
    keySpacer.style.cssText = 'height:24px;border-bottom:2px solid var(--border);background:var(--cream);flex-shrink:0;';
    keysEl.appendChild(keySpacer);

    ROLL_NOTES.forEach(note => {
        const key = document.createElement('div');
        const black = isBlackNote(note);
        const cNote = isCNote(note);
        key.className = 'piano-key ' + (black ? 'black' : 'white') + (cNote ? ' c-note' : '');
        key.textContent = !black ? note : '';
        keysEl.appendChild(key);
    });

    gridEl.innerHTML = '';
    gridEl.style.width = (numCols * COL_W) + 'px';

    const header = document.createElement('div');
    header.className = 'piano-grid-header';
    header.style.width = (numCols * COL_W) + 'px';
    
    for (let col = 0; col < numCols; col++) {
        const hc = document.createElement('div');
        hc.className = 'piano-grid-header-cell' + (col === activeSIdx ? ' col-active-hdr' : '');
        hc.textContent = syls[col] ? syls[col].text : '♩';
        hc.style.cursor = 'pointer';
        hc.onclick = () => {
            if (col >= syls.length) {
                while (words[wi].syllables.length <= col) {
                    addSyllable(wi);
                }
                renderPianoRoll(wi);
            } else {
                selectSyl(wi, col);
            }
        };
        header.appendChild(hc);
    }
    gridEl.appendChild(header);

    ROLL_NOTES.forEach((rowNote, ri) => {
        const row = document.createElement('div');
        row.className = 'piano-row' +
            (isBlackNote(rowNote) ? ' black-row' : '') +
            (isCNote(rowNote) ? ' c-row' : '');

        for (let col = 0; col < numCols; col++) {
            const s = syls[col];
            const sylNote = s ? normalizeNote(s.note || 'A4') : null;
            const onThisRow = sylNote ? (normalizeNote(rowNote) === sylNote) : false;

            const cell = document.createElement('div');
            cell.className = 'piano-cell' +
                (onThisRow ? ' has-note' : '') +
                (col === activeSIdx ? ' col-active' : '');

            if (onThisRow && s) {
                const label = document.createElement('span');
                label.className = 'piano-cell-label';
                label.textContent = s.text;
                cell.appendChild(label);
            }

            cell.onclick = (function(colIdx, noteName) {
                return function() {
                    if (colIdx >= syls.length) {
                        while (words[wi].syllables.length <= colIdx) {
                            addSyllable(wi);
                        }
                    }
                    selectNote(noteName, wi, colIdx);
                };
            })(col, rowNote);

            row.appendChild(cell);
        }

        gridEl.appendChild(row);
    });
}

function addEmptySyllable(wi, position) {
    const newSyl = makeSyl('');
    newSyl.text = '';
    newSyl.phonemes = ['AA'];
    newSyl.phoneme = 'AA';
    words[wi].syllables.splice(position, 0, newSyl);
    markModified(wi);
}

document.addEventListener('DOMContentLoaded', () => {
    buildNotePicker();
    buildOctaveBtns();
    loadFromUrl();
    $('downloadBtn').addEventListener('click', downloadWav);
    $('parseBtn').addEventListener('click', parseWords);
    $('lyricInput').addEventListener('keydown', e => { if (e.key === 'Enter') parseWords(); });
    $('playBtn').addEventListener('click', playSong);
    $('stopBtn').addEventListener('click', stopSong);
    $('saveBtn').addEventListener('click', saveToLocalStorage);
    $('loadBtn').addEventListener('click', loadFromLocalStorage);
    $('clearSaveBtn').addEventListener('click', clearLocalStorage);
    $('closeSylEditor').addEventListener('click', closeSylEditor);
    $('sliderSpacing').addEventListener('input', e => updateGlobal('spacing', e.target.value));

    document.body.addEventListener('click', async function initAudioOnClick() {
        await initAudio();
        document.body.removeEventListener('click', initAudioOnClick);
    }, { once: true });
});

const ALL_PHONEMES = [
    'IY', 'IH', 'EY', 'EH', 'AE', 'AA', 'AH', 'AO', 'AW', 'AY', 'OW', 'OY', 'UH', 'UW', 'ER',
    'F', 'V', 'TH', 'DH', 'S', 'Z', 'SH', 'ZH', 'HH',
    'P', 'B', 'T', 'D', 'K', 'G',
    'M', 'N', 'NG',
    'W', 'Y', 'R', 'L',
    'CH', 'JH',
    'BA', 'BE', 'BI', 'BO', 'BU', 'BY',
    'DA', 'DE', 'DI', 'DO', 'DU', 'DY',
    'FA', 'FE', 'FI', 'FO', 'FU',
    'GA', 'GE', 'GO',
    'HA', 'HE', 'HI', 'HO', 'HU', 'HAY',
    'JA', 'JE', 'JO',
    'KA', 'KE', 'KO',
    'LA', 'LE', 'LI', 'LO', 'LY',
    'MA', 'ME', 'MI', 'MO', 'MU', 'MY',
    'NA', 'NE', 'NI', 'NO', 'NY',
    'NGA', 'NGE', 'NGO',
    'PA', 'PE', 'PI', 'PO', 'PY',
    'RA', 'RE', 'RI', 'RO', 'RY',
    'SA', 'SE', 'SI', 'SO', 'SU', 'SY',
    'SHA', 'SHE', 'SHI', 'SHO', 'SHU',
    'TA', 'TE', 'TI', 'TO', 'TY',
    'THA', 'THE', 'THI', 'THO',
    'DHA', 'DHE', 'DHI', 'DHU',
    'VA', 'VE', 'VI', 'VO',
    'WA', 'WE', 'WI', 'WO',
    'YA', 'YE', 'YO', 'YU',
    'ZA', 'ZE', 'ZO',
    'CHA', 'CHE', 'CHI', 'CHO', 'CHU',
    'AB', 'AD', 'AM', 'AN', 'AT',
    'EED', 'EEN', 'EET',
    'OOD', 'OOT',
    'OUN', 'OUT'
];

function expandPhoneme(ph) {
    const cvMap = {
        'BA': 'B AA', 'BE': 'B IY', 'BI': 'B IH', 'BO': 'B OW', 'BU': 'B UW', 'BY': 'B AY',
        'DA': 'D AA', 'DE': 'D IY', 'DI': 'D IH', 'DO': 'D OW', 'DU': 'D UW', 'DY': 'D AY',
        'FA': 'F AA', 'FE': 'F IY', 'FI': 'F IH', 'FO': 'F OW', 'FU': 'F UW',
        'GA': 'G AA', 'GE': 'G IY', 'GO': 'G OW',
        'HA': 'H AA', 'HE': 'H IY', 'HI': 'H IH', 'HO': 'H OW', 'HU': 'H UW', 'HAY': 'H EY',
        'JA': 'JH AA', 'JE': 'JH IY', 'JO': 'JH OW',
        'KA': 'K AA', 'KE': 'K IY', 'KO': 'K OW',
        'LA': 'L AA', 'LE': 'L IY', 'LI': 'L IH', 'LO': 'L OW', 'LY': 'L AY',
        'MA': 'M AA', 'ME': 'M IY', 'MI': 'M IH', 'MO': 'M OW', 'MU': 'M UW', 'MY': 'M AY',
        'NA': 'N AA', 'NE': 'N IY', 'NI': 'N IH', 'NO': 'N OW', 'NY': 'N AY',
        'NGA': 'NG AA', 'NGE': 'NG IY', 'NGO': 'NG OW',
        'PA': 'P AA', 'PE': 'P IY', 'PI': 'P IH', 'PO': 'P OW', 'PY': 'P AY',
        'RA': 'R AA', 'RE': 'R IY', 'RI': 'R IH', 'RO': 'R OW', 'RY': 'R AY',
        'SA': 'S AA', 'SE': 'S IY', 'SI': 'S IH', 'SO': 'S OW', 'SU': 'S UW', 'SY': 'S AY',
        'SHA': 'SH AA', 'SHE': 'SH IY', 'SHI': 'SH IH', 'SHO': 'SH OW', 'SHU': 'SH UW',
        'TA': 'T AA', 'TE': 'T IY', 'TI': 'T IH', 'TO': 'T OW', 'TY': 'T AY',
        'THA': 'TH AA', 'THE': 'TH IY', 'THI': 'TH IH', 'THO': 'TH OW',
        'DHA': 'DH AA', 'DHE': 'DH IY', 'DHI': 'DH IH', 'DHU': 'DH UW',
        'VA': 'V AA', 'VE': 'V IY', 'VI': 'V IH', 'VO': 'V OW',
        'WA': 'W AA', 'WE': 'W IY', 'WI': 'W IH', 'WO': 'W OW',
        'YA': 'Y AA', 'YE': 'Y IY', 'YO': 'Y OW', 'YU': 'Y UW',
        'ZA': 'Z AA', 'ZE': 'Z IY', 'ZO': 'Z OW',
        'CHA': 'CH AA', 'CHE': 'CH IY', 'CHI': 'CH IH', 'CHO': 'CH OW', 'CHU': 'CH UW'
    };
    
    const vcMap = {
        'AB': 'AA B', 'AD': 'AA D', 'AM': 'AA M', 'AN': 'AA N', 'AT': 'AA T',
        'EED': 'IY D', 'EEN': 'IY N', 'EET': 'IY T',
        'OOD': 'UW D', 'OOT': 'UW T',
        'OUN': 'AW N', 'OUT': 'AW T'
    };
    
    if (cvMap[ph]) return cvMap[ph];
    if (vcMap[ph]) return vcMap[ph];
    return ph;
}

function splitWordToPhonemes(word) {
    const lower = word.toLowerCase();
    const result = [];
    
    for (let i = 0; i < lower.length; i++) {
        const c = lower[i];
        if (c === 'a') result.push('AA');
        else if (c === 'e') result.push('EH');
        else if (c === 'i') result.push('IH');
        else if (c === 'o') result.push('OW');
        else if (c === 'u') result.push('AH');
        else if (c === 'y') result.push('Y');
        else if (c === 'w') result.push('W');
        else if (c === 'r') result.push('R');
        else if (c === 'l') result.push('L');
        else if (c === 'm') result.push('M');
        else if (c === 'n') result.push('N');
        else if (c === 'p') result.push('P');
        else if (c === 'b') result.push('B');
        else if (c === 't') result.push('T');
        else if (c === 'd') result.push('D');
        else if (c === 'k') result.push('K');
        else if (c === 'g') result.push('G');
        else if (c === 'f') result.push('F');
        else if (c === 'v') result.push('V');
        else if (c === 's') result.push('S');
        else if (c === 'z') result.push('Z');
        else if (c === 'h') result.push('HH');
        else if (c === 'c') result.push('K');
        else if (c === 'x') { result.push('K'); result.push('S'); }
        else result.push('AA');
    }
    return result.length ? result : ['AA'];
}

function makeSyl(text) {
    const phonemes = splitWordToPhonemes(text);
    return {
        text: text || 'ah',
        phonemes: phonemes,
        phoneme: phonemes[0],
        baseNote: 'C4',
        note: 'C4',
        dur: 0.2,
    };
}

function renderChips() {
    const area = $('wordChips');
    if (!area) return;
    area.innerHTML = '';
    words.forEach((w, wi) => {
        const isActive = wi === activeWIdx;
        const isModified = w.modified;
        const topNote = w.syllables[0]?.note || 'C4';
        const sylCount = w.syllables.length;

        const chip = document.createElement('div');
        chip.className = 'chip' + (isActive ? ' active' : '') + (isModified ? ' modified' : '');
        chip.id = 'chip-' + wi;
        chip.innerHTML = `
            <div class="chip-body">${escHtml(w.text)}</div>
            <div class="chip-meta">${topNote}${sylCount > 1 ? ' · ' + sylCount + 'syl' : ''}</div>
            <div class="chip-dot"></div>
        `;
        chip.addEventListener('click', () => selectWord(wi));
        area.appendChild(chip);
    });
}

function splitSyllables(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return [word];
    const parts = w.match(/[^aeiou]*[aeiou]+(?:[^aeiou]*$|(?=[^aeiou]*[aeiou]))/g);
    if (!parts || parts.length === 0) return [word];
    return parts;
}

function parseWords() {
    const raw = $('lyricInput').value.trim();
    if (!raw) return;

    const wordTokens = raw.split(/\s+/);

    words = wordTokens.map(tok => {
        const sylTexts = splitSyllables(tok);
        const syllables = sylTexts.map(sylText => makeSyl(sylText));
        return {
            text: tok,
            syllables,
            modified: false,
        };
    });

    activeWIdx = null;
    activeSIdx = null;
    $('wordEditor').style.display = 'none';
    $('sylEditor').style.display = 'none';
    $('panel-roll').style.display = 'block';
    $('panel-play').style.display = 'block';
    renderChips();
    setStatus('');
}

function selectWord(wi) {
    if (activeWIdx === wi) {
        activeWIdx = null;
        activeSIdx = null;
        $('wordEditor').style.display = 'none';
        $('sylEditor').style.display = 'none';
        renderChips();
        setStatus('');
        return;
    }
    
    activeWIdx = wi;
    activeSIdx = null;
    const w = words[wi];
    $('editorWord').textContent = w.text;
    $('wordEditor').style.display = 'block';
    renderSylStrip(wi);
    renderPianoRoll(wi);
    $('sylEditor').style.display = 'none';
    renderChips();
}

function renderSylStrip(wi) {
    const w = words[wi];
    const strip = $('sylStrip');
    strip.innerHTML = '';

    w.syllables.forEach((s, si) => {
        const sc = document.createElement('div');
        sc.className = 'syl-chip' + (activeSIdx === si ? ' active' : '');
        const phonemesText = (s.phonemes && s.phonemes.length > 1) ? s.phonemes.join(' ') : (s.phoneme || 'AA');
        sc.innerHTML = `
          <div class="syl-chip-inner">${escHtml(s.text)}<br><span style="font-size:0.55rem;opacity:0.7">${phonemesText}</span></div>
          <div style="font-family:var(--mono);font-size:0.5rem;color:var(--text-soft)">${s.baseNote || s.note} · ${s.dur.toFixed(2)}s</div>
        `;
        sc.addEventListener('click', () => selectSyl(wi, si));
        strip.appendChild(sc);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'syl-add-btn';
    addBtn.textContent = '+ add syllable';
    addBtn.addEventListener('click', () => addSyllable(wi));
    strip.appendChild(addBtn);

    if (w.syllables.length > 1 && activeSIdx !== null) {
        const delBtn = document.createElement('button');
        delBtn.className = 'syl-add-btn';
        delBtn.textContent = '− remove';
        delBtn.style.color = 'var(--pink3)';
        delBtn.addEventListener('click', () => removeSyllable(wi, activeSIdx));
        strip.appendChild(delBtn);
    }
}

function selectSyl(wi, si) {
    activeWIdx = wi;
    activeSIdx = si;
    const s = words[wi].syllables[si];

    $('sylEditor').style.display = 'block';
    $('sylTextInput').value = s.text;

    $('sylTextInput').oninput = e => {
        words[wi].syllables[si].text = e.target.value;
        renderSylStrip(wi);
        renderPianoRoll(wi);
    };

    const existingEditor = document.getElementById('phonemeEditor');
    if (existingEditor) existingEditor.remove();
    
    const phonemeEditor = document.createElement('div');
    phonemeEditor.id = 'phonemeEditor';
    phonemeEditor.style.cssText = 'margin-top: 10px; margin-bottom: 10px; padding: 8px; background: var(--cream); border-radius: 8px;';
    
    phonemeEditor.innerHTML = `
        <div style="font-size:0.7rem; font-weight:700; margin-bottom:8px;">phonemes in this syllable</div>
        <div id="phonemeListDisplay" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;"></div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button id="addPhonemeBtn" style="background:var(--mint); border:none; border-radius:20px; padding:4px 12px; font-family:var(--mono); font-size:0.7rem; cursor:pointer;">+ add</button>
            <button id="clearPhonemesBtn" style="background:var(--pink); border:none; border-radius:20px; padding:4px 12px; font-family:var(--mono); font-size:0.7rem; cursor:pointer;">clear all</button>
        </div>
        <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border);">
            <div style="font-size:0.7rem; font-weight:700; margin-bottom:6px;">or type phonemes (space separated)</div>
            <input type="text" id="manualPhonemeInput" placeholder="e.g., B AA or HH AH L OW" style="font-family:var(--mono);font-size:0.75rem;padding:6px 10px;border-radius:20px;border:2px solid var(--border);background:var(--cream);width:100%;" />
            <button id="applyPhonemeBtn" class="btn-sm" style="margin-top:6px;">apply</button>
        </div>
    `;
    
    const sylEditorDiv = $('sylEditor');
    const textInputRow = sylEditorDiv.querySelector('.ctrl-row');
    if (textInputRow) {
        textInputRow.insertAdjacentElement('afterend', phonemeEditor);
    } else {
        sylEditorDiv.insertBefore(phonemeEditor, sylEditorDiv.children[2]);
    }
    
    function updatePhonemeListDisplay() {
        const container = document.getElementById('phonemeListDisplay');
        if (!container) return;
        const currentPhonemes = words[wi].syllables[si].phonemes || [words[wi].syllables[si].phoneme || 'AA'];
        container.innerHTML = '';
        currentPhonemes.forEach((ph, idx) => {
            const phBox = document.createElement('div');
            phBox.style.cssText = 'background:var(--white); border:2px solid var(--border); border-radius:12px; padding:6px 12px; display:flex; align-items:center; gap:8px;';
            phBox.innerHTML = `
                <span style="font-family:var(--mono); font-weight:700; font-size:0.85rem;">${ph}</span>
                <button class="removePhonemeBtn" data-index="${idx}" style="background:var(--pink3); color:white; border:none; border-radius:50%; width:20px; height:20px; font-size:0.7rem; cursor:pointer;">×</button>
            `;
            container.appendChild(phBox);
        });
        
        document.querySelectorAll('.removePhonemeBtn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                const current = words[wi].syllables[si].phonemes || [words[wi].syllables[si].phoneme || 'AA'];
                current.splice(idx, 1);
                if (current.length === 0) current.push('AA');
                words[wi].syllables[si].phonemes = current;
                words[wi].syllables[si].phoneme = current[0];
                markModified(wi);
                updatePhonemeListDisplay();
                renderSylStrip(wi);
            });
        });
    }
    
    function showPhonemePickerForAdd() {
        const pickerContainer = document.createElement('div');
        pickerContainer.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:white; border:3px solid var(--border); border-radius:16px; padding:20px; max-width:500px; max-height:80vh; z-index:1000; box-shadow:0 4px 20px rgba(0,0,0,0.2); display:flex; flex-direction:column;';
        pickerContainer.innerHTML = `
            <div style="font-weight:700; margin-bottom:10px;">select phoneme to add</div>
            <div id="addPhonemePicker" style="display:flex; flex-wrap:wrap; gap:6px; max-height:400px; overflow-y:auto; margin-bottom:10px;"></div>
            <button id="closePickerBtn" style="background:var(--border); border:none; border-radius:20px; padding:5px 15px; cursor:pointer;">cancel</button>
        `;
        
        document.body.appendChild(pickerContainer);
        
        const pickerDiv = document.getElementById('addPhonemePicker');
        
        ALL_PHONEMES.forEach(ph => {
            const btn = document.createElement('button');
            btn.textContent = ph;
            btn.style.cssText = 'background:var(--cream); border:2px solid var(--border); border-radius:20px; padding:5px 10px; font-family:var(--mono); font-size:0.7rem; cursor:pointer;';
            btn.onmouseover = () => btn.style.background = 'var(--pink)';
            btn.onmouseout = () => btn.style.background = 'var(--cream)';
            btn.onclick = () => {
                const current = words[wi].syllables[si].phonemes || [words[wi].syllables[si].phoneme || 'AA'];
                current.push(ph);
                words[wi].syllables[si].phonemes = current;
                words[wi].syllables[si].phoneme = current[0];
                markModified(wi);
                updatePhonemeListDisplay();
                renderSylStrip(wi);
                pickerContainer.remove();
            };
            pickerDiv.appendChild(btn);
        });
        
        document.getElementById('closePickerBtn').onclick = () => pickerContainer.remove();
    }
    
    updatePhonemeListDisplay();
    
    document.getElementById('addPhonemeBtn').onclick = showPhonemePickerForAdd;
    document.getElementById('clearPhonemesBtn').onclick = () => {
        words[wi].syllables[si].phonemes = ['AA'];
        words[wi].syllables[si].phoneme = 'AA';
        markModified(wi);
        updatePhonemeListDisplay();
        renderSylStrip(wi);
    };
    
    const manualInput = document.getElementById('manualPhonemeInput');
    const applyBtn = document.getElementById('applyPhonemeBtn');
    
    if (manualInput && applyBtn) {
        manualInput.value = (words[wi].syllables[si].phonemes || [words[wi].syllables[si].phoneme || 'AA']).join(' ');
        
        const applyTypedPhonemes = () => {
            const raw = manualInput.value.trim().toUpperCase();
            if (raw) {
                const phonemeArray = raw.split(/\s+/);
                words[wi].syllables[si].phonemes = phonemeArray;
                words[wi].syllables[si].phoneme = phonemeArray[0];
                markModified(wi);
                updatePhonemeListDisplay();
                renderSylStrip(wi);
                setStatus(`phonemes set to: ${raw}`);
            }
        };
        
        applyBtn.onclick = applyTypedPhonemes;
        manualInput.onkeypress = (e) => { if (e.key === 'Enter') applyTypedPhonemes(); };
    }

    const phonemePickerContainer = document.getElementById('phonemePicker');
    if (phonemePickerContainer) {
        renderPhonemePicker(s.phoneme, ph => {
            const currentPhonemes = words[wi].syllables[si].phonemes || [s.phoneme || 'AA'];
            currentPhonemes[0] = ph;
            words[wi].syllables[si].phonemes = currentPhonemes;
            words[wi].syllables[si].phoneme = ph;
            markModified(wi);
            updatePhonemeListDisplay();
            renderSylStrip(wi);
        });
    }

    setSylSlider('sylBend', s.bend, 'sylBendVal', v => Math.round(v) + ' ct');
    setSylSlider('sylDur', s.dur, 'sylDurVal', v => parseFloat(v).toFixed(2) + 's');

    const bendSlider = document.getElementById('sylBend');
    const durSlider = document.getElementById('sylDur');
    
    if (bendSlider) {
        bendSlider.oninput = (e) => {
            const val = parseFloat(e.target.value);
            words[wi].syllables[si].bend = val;
            document.getElementById('sylBendVal').textContent = Math.round(val) + ' ct';
            markModified(wi);
        };
    }
    if (durSlider) {
        durSlider.oninput = (e) => {
            const val = parseFloat(e.target.value);
            words[wi].syllables[si].dur = val;
            document.getElementById('sylDurVal').textContent = val.toFixed(2) + 's';
            markModified(wi);
            renderSylStrip(wi);
        };
    }

    renderSylStrip(wi);
    renderPianoRoll(wi);
    renderChips();
}

function setSylSlider(id, val, valId, fmt) {
    const el = $(id);
    if (el) el.value = val;
    const vl = $(valId);
    if (vl) vl.textContent = fmt(val);
}

function renderPhonemePicker(current, onChange) {
    const picker = $('phonemePicker');
    if (!picker) return;
    picker.innerHTML = '';
    
    const vowels = [];
    const consonants = [];
    const diphthongs = [];
    
    ALL_PHONEMES.forEach(ph => {
        if (ph.length === 1) {
            consonants.push(ph);
        } else if (ph.length === 2 && ph.match(/^[AEIOUY]/)) {
            vowels.push(ph);
        } else {
            diphthongs.push(ph);
        }
    });
    
    vowels.sort();
    consonants.sort();
    diphthongs.sort();
    
    function addSection(title, phonemeList, color) {
        if (phonemeList.length === 0) return;
        
        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom: 1rem;';
        
        const titleEl = document.createElement('div');
        titleEl.style.cssText = `font-family:var(--mono);font-size:0.65rem;font-weight:700;color:${color};margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.08em;`;
        titleEl.textContent = title;
        section.appendChild(titleEl);
        
        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
        
        phonemeList.forEach(ph => {
            const btn = document.createElement('button');
            btn.textContent = ph;
            btn.style.cssText = 'background:var(--cream);border:2px solid var(--border);border-radius:20px;padding:6px 12px;font-family:var(--mono);font-size:0.7rem;cursor:pointer;transition:all 0.1s;';
            btn.className = 'vowel-btn' + (ph === current ? ' active' : '');
            btn.title = ph;
            
            btn.onmouseover = () => {
                btn.style.background = 'var(--pink)';
                btn.style.transform = 'scale(1.05)';
            };
            btn.onmouseout = () => {
                btn.style.background = 'var(--cream)';
                btn.style.transform = 'scale(1)';
            };
            
            btn.onclick = () => {
                picker.querySelectorAll('.vowel-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                onChange(ph);
            };
            
            btnWrap.appendChild(btn);
        });
        
        section.appendChild(btnWrap);
        picker.appendChild(section);
    }
    
    addSection('VOWELS', vowels, '#ff4d7e');
    addSection('CONSONANTS', consonants, '#5ddba8');
    addSection('DIPHTHONGS & CLUSTERS', diphthongs, '#ffd93d');
}

function updateSylParam(param, rawVal) {
    if (activeWIdx === null || activeSIdx === null) return;
    const val = parseFloat(rawVal);
    words[activeWIdx].syllables[activeSIdx][param] = val;
    markModified(activeWIdx);
    renderSylStrip(activeWIdx);
    renderChips();
}

function selectNote(note, wi, si) {
    const wIdx = (wi !== undefined) ? wi : activeWIdx;
    let sIdx = (si !== undefined) ? si : activeSIdx;
    if (wIdx === null || sIdx === null) return;
    
    while (sIdx >= words[wIdx].syllables.length) {
        words[wIdx].syllables.push(makeSyl(''));
        words[wIdx].syllables[words[wIdx].syllables.length - 1].text = '';
        words[wIdx].syllables[words[wIdx].syllables.length - 1].phonemes = ['AA'];
    }
    
    words[wIdx].syllables[sIdx].baseNote = note;
    words[wIdx].syllables[sIdx].note = note;
    markModified(wIdx);
    renderSylStrip(wIdx);
    renderPianoRoll(wIdx);
    renderChips();
}

function addSyllable(wi) {
    words[wi].syllables.push(makeSyl('ah'));
    markModified(wi);
    activeSIdx = words[wi].syllables.length - 1;
    selectSyl(wi, activeSIdx);
}

function removeSyllable(wi, si) {
    if (words[wi].syllables.length <= 1) return;
    words[wi].syllables.splice(si, 1);
    markModified(wi);
    activeSIdx = Math.min(si, words[wi].syllables.length - 1);
    selectSyl(wi, activeSIdx);
}

function markModified(wi) {
    words[wi].modified = true;
}

function buildNotePicker() {
    const picker = $('notePicker');
    const NOTES = ['C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3', 'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5'];
    NOTES.forEach(note => {
        const btn = document.createElement('button');
        btn.className = 'note-btn';
        btn.textContent = note;
        btn.dataset.note = note;
        btn.addEventListener('click', () => selectNote(note));
        picker.appendChild(btn);
    });
}

function updateGlobal(param, rawVal) {
    const val = parseFloat(rawVal);
    globalOpts[param] = val;
    const fmts = {
        spacing: v => Math.round(v) + ' ms',
    };
    const ids = { spacing: 'spacingVal' };
    if (fmts[param]) $(ids[param]).textContent = fmts[param](val);
}

function noteToFreq(name) {
    const map = { C:0,D:2,E:4,F:5,G:7,A:9,B:11 };
    const f2s = { 'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#' };
    const fm = name.match(/^([A-G]b)(\d)$/);
    let n = name;
    if (fm) { const s = f2s[fm[1]]; if (s) n = s + fm[2]; }
    const m = n.match(/^([A-G]#?)(\d)$/);
    if (!m) return 261;
    const semi = map[m[1][0]] + (m[1][1] === '#' ? 1 : 0);
    const midi = (parseInt(m[2]) + 1) * 12 + semi;
    return Math.round(440 * Math.pow(2, (midi - 69) / 12));
}

async function playSong() {
    if (!words.length) {
        setStatus('parse some words first');
        return;
    }
    
    const audioReady = await initAudio();
    if (!audioReady) return;

    let phonemeString = "";
    let syllableCount = 0;
    let wordSpacingMs = globalOpts.spacing || 200;
    
    for (let w = 0; w < words.length; w++) {
        const word = words[w];
        for (const syllable of word.syllables) {
            syllableCount++;
            
            let phonemes = [];
            if (syllable.phonemes && syllable.phonemes.length > 0) {
                phonemes = syllable.phonemes;
            } else if (syllable.phoneme) {
                phonemes = [syllable.phoneme];
            } else {
                phonemes = ['AA'];
            }
            
            let noteName = syllable.baseNote || syllable.note || 'C4';
            
            let durationMs = Math.floor((syllable.dur || 0.45) * 1000);
            durationMs = Math.min(durationMs, 8000);
            durationMs = Math.max(durationMs, 100);
            
            if (phonemes.length === 1) {
                phonemeString += `b${noteName} r${durationMs} ${phonemes[0]} `;
            } else {
                let firstPart = phonemes.slice(0, -1).join(' ');
                let lastPhoneme = phonemes[phonemes.length - 1];
                phonemeString += `b${noteName} ${firstPart} r${durationMs} ${lastPhoneme} `;
            }
        }
        if (w < words.length - 1) {
            phonemeString += `p${wordSpacingMs} `;
        }
    }
    
    console.log("phoneme string:", phonemeString);
    setStatus(`singing!`);
    
    $('playBtn').disabled = true;
    $('stopBtn').disabled = false;
    stopRequested = false;
    
    klattschEngine.stop();
    
    try {
        await klattschEngine.speak(phonemeString.trim());
        setStatus('done ♪');
    } catch (e) {
        console.error('playback error:', e);
        setStatus('error: ' + e.message);
    }
    
    $('playBtn').disabled = false;
    $('stopBtn').disabled = true;
    clearHighlight();
}

function stopSong() {
    stopRequested = true;
    if (window.wordTimeouts) {
        window.wordTimeouts.forEach(clearTimeout);
        window.wordTimeouts = [];
    }
    if (klattschEngine) {
        klattschEngine.stop();
    }
    $('playBtn').disabled = false;
    $('stopBtn').disabled = true;
    clearHighlight();
    setStatus('');
}

function highlightChip(wi) {
    document.querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('playing', i === wi));
}

function clearHighlight() {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('playing'));
}

function generateShareLink() {
    if (!words.length) { 
        setStatus('nothing to share!'); 
        return; 
    }
    
    const data = {
        t: $('lyricInput').value,
        w: words.map(w => ({
            text: w.text,
            syls: w.syllables.map(s => [s.text, (s.phonemes || [s.phoneme]).join(' '), s.note, s.bend, s.dur, 0, 0]),
        })),
    };
    
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    const url = location.origin + location.pathname + '?s=' + encoded;
    
    const shareUrl = $('shareUrl');
    const shareBox = $('shareBox');
    
    if (shareUrl) shareUrl.value = url;
    if (shareBox) shareBox.style.display = 'flex';
    
    setStatus('share link created');
}

function copyShare() {
    $('shareUrl').select();
    document.execCommand('copy');
    setStatus('link copied!');
}

function loadFromUrl() {
    const params = new URLSearchParams(location.search);
    if (!params.get('s')) return;
    try {
        const data = JSON.parse(decodeURIComponent(escape(atob(params.get('s')))));
        $('lyricInput').value = data.t || '';
        if (data.w) {
            words = data.w.map(wd => ({
                text: wd.text,
                modified: true,
                syllables: (wd.syls || []).map(([text, phoneme, note, bend, dur, breath, vibrato]) => ({
                  text,
                  phoneme,
                  phonemes: phoneme ? phoneme.split(' ') : ['AA'],
                  note,
                  bend,
                  dur,
                  breath,
                  vibrato,
                })),
            }));
            $('panel-roll').style.display = 'block';
            $('panel-play').style.display = 'block';
            renderChips();
        }
    } catch (e) { console.warn('share load failed', e); }
}

function toggleHelp() {
    const body = $('helpBody');
    const arrow = $('helpArrow');
    const isOpen = body.style.display !== 'none' && body.style.display !== '';
    body.style.display = isOpen ? 'none' : 'block';
    arrow.textContent = isOpen ? '▸' : '▾';
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setStatus(msg) {
    const statusEl = $('statusBar');
    if (statusEl) statusEl.textContent = msg;
}

window.toggleHelp = function() {
    const body = document.getElementById('helpBody');
    const arrow = document.getElementById('helpArrow');
    if (!body || !arrow) {
        console.error('help elements not found');
        return;
    }
    const isOpen = body.style.display === 'block';
    body.style.display = isOpen ? 'none' : 'block';
    arrow.textContent = isOpen ? '▸' : '▾';
};

async function downloadWav() {
    if (!words.length) { 
        setStatus('nothing to export!'); 
        return; 
    }
    
    const audioReady = await initAudio();
    if (!audioReady) return;

    setStatus('rendering...');
    $('playBtn').disabled = true;

    let phonemeString = "";
    
    for (const word of words) {
        for (const syllable of word.syllables) {
            let phonemes = [];
            if (syllable.phonemes && syllable.phonemes.length > 0) {
                phonemes = syllable.phonemes;
            } else if (syllable.phoneme) {
                phonemes = [syllable.phoneme];
            } else {
                phonemes = ['AA'];
            }
            
            let noteName = syllable.baseNote || syllable.note || 'C4';
            noteName = noteName.replace(/[+-][\d.]+$/, '');
            
            let durationMs = Math.floor((syllable.dur || 0.45) * 1000);
            durationMs = Math.min(durationMs, 8000);
            durationMs = Math.max(durationMs, 100);
            
            if (phonemes.length === 1) {
                phonemeString += `b${noteName} r${durationMs} ${phonemes[0]} `;
            } else {
                let firstPart = phonemes.slice(0, -1).join(' ');
                let lastPhoneme = phonemes[phonemes.length - 1];
                phonemeString += `b${noteName} ${firstPart} r${durationMs} ${lastPhoneme} `;
            }
        }
        phonemeString += " ";
    }
    
    console.log("export string:", phonemeString);

    try {
        const audioBuffer = await klattschEngine.renderToBuffer(phonemeString.trim());
        if (!audioBuffer) { 
            setStatus('nothing rendered'); 
            $('playBtn').disabled = false; 
            return; 
        }
        
        const samples = audioBuffer.getChannelData(0);
        
        let maxSample = 0;
        for (let i = 0; i < samples.length; i++) {
            const abs = Math.abs(samples[i]);
            if (abs > maxSample) maxSample = abs;
        }
        console.log("max sample before boost:", maxSample);
        
        if (maxSample < 0.1) {
            const boost = 0.9 / maxSample;
            for (let i = 0; i < samples.length; i++) {
                let boosted = samples[i] * Math.min(boost, 50.0);
                samples[i] = Math.max(-0.99, Math.min(0.99, boosted));
            }
            
            let newMax = 0;
            for (let i = 0; i < samples.length; i++) {
                const abs = Math.abs(samples[i]);
                if (abs > newMax) newMax = abs;
            }
            console.log("max sample after boost:", newMax);
        }

        const wav = audioBufferToWav(audioBuffer);
        const blob = new Blob([wav], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'song.wav';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setStatus('downloaded!');
    } catch(e) {
        console.error(e);
        setStatus('export error: ' + e.message);
    }
    $('playBtn').disabled = false;
}

function audioBufferToWav(buffer) {
    const numChannels = 1;
    const sampleRate = buffer.sampleRate;
    const samples = buffer.getChannelData(0);
    const dataLen = samples.length * 2;
    const ab = new ArrayBuffer(44 + dataLen);
    const view = new DataView(ab);
    const str = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    str(0, 'RIFF');
    view.setUint32(4, 36 + dataLen, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, dataLen, true);
    let off = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
    }
    return ab;
}

function saveToLocalStorage() {
    if (!words.length) {
        setStatus('nothing to save');
        return;
    }
    
    const saveData = {
        lyrics: $('lyricInput').value,
        words: words.map(w => ({
            text: w.text,
            syllables: w.syllables.map(s => ({
                text: s.text,
                phonemes: s.phonemes,
                phoneme: s.phoneme,
                baseNote: s.baseNote || s.note,
                note: s.note,
                dur: s.dur
            }))
        }))
    };
    
    localStorage.setItem('formant_save', JSON.stringify(saveData));
    setStatus('saved to browser!');
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('formant_save');
    if (!saved) {
        setStatus('no saved project found');
        return;
    }
    
    try {
        const data = JSON.parse(saved);
        $('lyricInput').value = data.lyrics || '';
        
        words = data.words.map(w => ({
            text: w.text,
            modified: true,
            syllables: w.syllables.map(s => ({
                text: s.text,
                phonemes: s.phonemes || [s.phoneme || 'AA'],
                phoneme: s.phoneme || 'AA',
                baseNote: s.baseNote || s.note || 'C4',
                note: s.note || 'C4',
                dur: s.dur || 0.5
            }))
        }));
        
        activeWIdx = null;
        activeSIdx = null;
        $('wordEditor').style.display = 'none';
        $('sylEditor').style.display = 'none';
        $('panel-roll').style.display = 'block';
        $('panel-play').style.display = 'block';
        renderChips();
        setStatus('loaded from browser!');
    } catch(e) {
        console.error('load failed:', e);
        setStatus('load failed');
    }
}

function clearLocalStorage() {
    localStorage.removeItem('formant_save');
    setStatus('saved data cleared');
}

function closeSylEditor() {
    $('sylEditor').style.display = 'none';
    activeSIdx = null;
    setStatus('syllable editor closed');
}

window.generateShareLink = generateShareLink;
window.copyShare = copyShare;