// Riconoscimento vocale (Web Speech API) per la modalità mani libere: il
// coach chiede a voce cosa allenare / quale esercizio si sta facendo, e qui
// si ascolta e si interpreta la risposta parlata.
//
// LIMITE NOTO (non risolvibile da qui): richiede microfono + pagina servita
// da HTTPS o localhost, e non è supportata da tutti i browser (es. Firefox
// desktop non la supporta). Dove non è disponibile, l'app resta comunque
// usabile normalmente a tocco: VoiceInput.supported() lo segnala prima di
// provare, così non si resta bloccati in attesa di un microfono che non
// risponderà mai.
// NOTA: se si usa l'altoparlante del telefono invece delle cuffie, il
// microfono può "sentire" la voce del coach stesso. Con le cuffie (l'uso
// previsto) l'audio del coach non arriva al microfono, quindi non c'è
// interferenza.
const VoiceInput = (function () {
    function supported() {
        return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    let activeRecognition = null;

    function listenOnce({ timeoutMs = 6000, onResult, onError, onNoMatch } = {}) {
        if (!supported()) { if (onError) onError('unsupported'); return; }
        const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new Rec();
        rec.lang = 'it-IT';
        rec.interimResults = false;
        rec.maxAlternatives = 3;
        rec.continuous = false;
        activeRecognition = rec;
        let done = false;

        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            try { rec.stop(); } catch (e) { /* già fermo, non importa */ }
            if (onNoMatch) onNoMatch();
        }, timeoutMs);

        rec.onresult = (event) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            const transcript = (event.results[0][0].transcript || '').trim().toLowerCase();
            if (onResult) onResult(transcript);
        };
        rec.onerror = (event) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            if (onError) onError(event.error);
        };
        rec.onend = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            if (onNoMatch) onNoMatch();
        };

        try {
            rec.start();
        } catch (e) {
            done = true;
            clearTimeout(timer);
            if (onError) onError(e);
        }
    }

    function cancel() {
        if (activeRecognition) {
            try { activeRecognition.stop(); } catch (e) { /* noop */ }
            activeRecognition = null;
        }
    }

    // Ascolto continuo per comandi brevi durante l'assistenza esercizio
    // ("pausa", "salta", ecc. — vedi matchCommand più sotto). A differenza di
    // listenOnce non si ferma dopo una frase: va fermato esplicitamente con
    // .stop() quando l'esercizio finisce. Alcuni browser interrompono da soli
    // il riconoscimento continuo dopo un po' di silenzio: qui lo si riavvia
    // finché non viene fermato esplicitamente. Per sicurezza c'è anche un
    // limite di riavvii e una piccola attesa tra uno e l'altro: senza,
    // se il riconoscimento si ferma e ripartisse all'istante (es. nessun
    // microfono reale disponibile) si genererebbe un loop stretto che
    // martella la CPU/batteria senza mai fermarsi.
    function listenContinuous({ onResult, onError, onGiveUp } = {}) {
        if (!supported()) return null;
        const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new Rec();
        rec.lang = 'it-IT';
        rec.interimResults = false;
        rec.continuous = true;
        rec.maxAlternatives = 1;
        let stopped = false;
        let restartCount = 0;
        const MAX_RESTARTS = 10; // oltre, il microfono probabilmente non è disponibile: si rinuncia invece di continuare all'infinito
        const RESTART_DELAY_MS = 300;

        rec.onresult = (event) => {
            restartCount = 0; // un risultato vero conferma che il microfono funziona
            const last = event.results[event.results.length - 1];
            if (last && last[0]) {
                const transcript = (last[0].transcript || '').trim().toLowerCase();
                if (onResult) onResult(transcript);
            }
        };
        rec.onerror = (event) => { if (onError) onError(event.error); };
        rec.onend = () => {
            if (stopped) return;
            restartCount++;
            if (restartCount > MAX_RESTARTS) {
                stopped = true;
                if (onGiveUp) onGiveUp();
                return;
            }
            setTimeout(() => {
                if (!stopped) { try { rec.start(); } catch (e) { /* già in ascolto */ } }
            }, RESTART_DELAY_MS);
        };

        try {
            rec.start();
        } catch (e) {
            if (onError) onError(e);
            return null;
        }

        return {
            stop: () => { stopped = true; try { rec.stop(); } catch (e) { /* noop */ } }
        };
    }

    return { supported, listenOnce, listenContinuous, cancel };
})();

// --- Interpretazione delle risposte parlate ---

const FOCUS_SYNONYMS = {
    gambe: ['gambe', 'gamba', 'cosce', 'glutei'],
    upper: ['upper', 'braccia', 'petto', 'busto', 'spalle', 'schiena', 'dorso'],
    cardio: ['cardio', 'corsa', 'aerobica'],
    full: ['full', 'tutto il corpo', 'total body', 'corpo intero']
};

function matchFocus(transcript) {
    const t = (transcript || '').toLowerCase();
    for (const focus of Object.keys(FOCUS_SYNONYMS)) {
        if (FOCUS_SYNONYMS[focus].some(word => t.includes(word))) return focus;
    }
    return null;
}

function normalizeText(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Trova nella scheda l'esercizio il cui nome corrisponde meglio a quello che
// l'utente ha detto (match per parole, per tollerare frasi come "sto
// facendo gli squat" invece del nome esatto "Squat a corpo libero").
function matchExerciseInPlan(transcript, plannedExercises) {
    const t = normalizeText(transcript);
    if (!t || !plannedExercises || !plannedExercises.length) return null;
    let best = null;
    let bestScore = 0;
    plannedExercises.forEach(ex => {
        const name = normalizeText(ex.name);
        const words = name.split(/\s+/).filter(w => w.length > 3);
        const matchedWords = words.filter(w => t.includes(w)).length;
        if (matchedWords > bestScore) {
            bestScore = matchedWords;
            best = ex;
        }
    });
    return best;
}

function isAffirmative(transcript) {
    return /^(s[iì]|ok|va bene|vai|inizia|certo|perfetto)/.test((transcript || '').trim().toLowerCase());
}

function isNegativeOrStop(transcript) {
    return /(basta|stop|fine|termina)/.test((transcript || '').trim().toLowerCase());
}

// Comandi brevi durante l'assistenza esercizio (vedi VoiceInput.listenContinuous
// e js/exercise-assist.js). Un solo comando riconosciuto per frase.
function matchCommand(transcript) {
    const t = (transcript || '').trim().toLowerCase();
    if (/pausa|fermati un attimo|aspetta/.test(t)) return 'pausa';
    if (/riprendi|ripartiamo|continua pure/.test(t)) return 'riprendi';
    if (/^salta$|salta (questo|l'esercizio)|prossimo esercizio|passa oltre/.test(t)) return 'salta';
    if (/ripeti|non ho sentito|come hai detto|cosa hai detto/.test(t)) return 'ripeti';
    if (/quante (ne )?mancano|a che punto siamo|quanto manca/.test(t)) return 'stato';
    return null;
}
