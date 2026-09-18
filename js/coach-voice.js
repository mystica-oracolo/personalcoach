// Modulo voce del coach: legge ad alta voce i messaggi, pensato per l'uso
// con le cuffie durante l'allenamento (niente da leggere sullo schermo).
const CoachVoice = (function () {
    const STORAGE_KEY = 'fitcoach_voice_enabled';
    let voicesCache = [];

    function supported() {
        return typeof window !== 'undefined' && 'speechSynthesis' in window;
    }

    function loadVoices() {
        if (!supported()) return;
        voicesCache = window.speechSynthesis.getVoices();
    }

    if (supported()) {
        loadVoices();
        // Su molti browser le voci si caricano in modo asincrono
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    function isEnabled() {
        const v = localStorage.getItem(STORAGE_KEY);
        return v === null ? true : v === 'true';
    }

    function setEnabled(val) {
        localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false');
        if (!val && supported()) window.speechSynthesis.cancel();
    }

    // Il Web Speech API non espone il genere della voce: bisogna indovinarlo
    // dal nome. BUG ORIGINALE: si cercava la stringa letterale "male"/"female"
    // nel nome della voce, ma quasi nessuna voce italiana la contiene davvero
    // (es. "Google italiano", "Microsoft Cosimo", "Alice") — quindi la ricerca
    // falliva sempre e si tornava sempre pool[0], la stessa voce per entrambi
    // i coach. Qui si usa invece una lista di nomi di voci italiane comuni
    // (Google/Microsoft/Apple) per genere.
    const KNOWN_VOICE_NAMES = {
        female: ['elsa', 'isabella', 'alice', 'federica', 'paola', 'silvia', 'giulia', 'elisa', 'lucia', 'valentina', 'francesca', 'chiara'],
        male: ['cosimo', 'diego', 'luca', 'niccolò', 'niccolo', 'riccardo', 'giorgio', 'matteo', 'alessandro', 'fabio', 'roberto']
    };

    function pickVoice(genderHint) {
        if (!voicesCache.length) loadVoices();
        const italian = voicesCache.filter(v => v.lang && v.lang.toLowerCase().startsWith('it'));
        const pool = italian.length ? italian : voicesCache;
        if (!pool.length) return null;
        if (genderHint && KNOWN_VOICE_NAMES[genderHint]) {
            const names = KNOWN_VOICE_NAMES[genderHint];
            const guess = pool.find(v => names.some(n => v.name.toLowerCase().includes(n)));
            if (guess) return guess;
            // Nessun nome noto trovato: se ci sono più voci italiane disponibili,
            // ne scegliamo una diversa per genere invece di tornare sempre la
            // stessa (che era esattamente il bug da correggere). Su dispositivi
            // con una sola voce italiana installata i due coach suoneranno
            // comunque uguali: limite del sistema, non risolvibile da qui.
            if (pool.length > 1) {
                const otherNames = KNOWN_VOICE_NAMES[genderHint === 'male' ? 'female' : 'male'];
                const remaining = pool.filter(v => !otherNames.some(n => v.name.toLowerCase().includes(n)));
                const idx = genderHint === 'male' ? 0 : 1;
                return remaining[idx % remaining.length] || pool[idx % pool.length];
            }
        }
        return pool[0];
    }

    // genderHint: 'male' o 'female'. onEnd (opzionale): richiamata quando la
    // voce ha finito di parlare (o subito, se la voce è disattivata/non
    // supportata) — serve per incatenare azioni dopo che il coach ha finito
    // di parlare, es. "chiedi a voce quale esercizio, poi ascolta".
    function speak(text, genderHint, onEnd) {
        if (!supported() || !isEnabled() || !text) {
            if (onEnd) onEnd();
            return;
        }
        try {
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = 'it-IT';
            const voice = pickVoice(genderHint);
            if (voice) utter.voice = voice;
            if (onEnd) {
                let done = false;
                const finish = () => { if (done) return; done = true; onEnd(); };
                utter.onend = finish;
                utter.onerror = finish;
                // Rete di sicurezza: su alcuni browser/dispositivi la sintesi
                // può non emettere mai né "onend" né "onerror" (bug noto,
                // osservato anche qui). Senza questo, chi aspetta la callback
                // (es. il flusso mani libere) resterebbe bloccato in silenzio
                // per sempre. Stima generosa in base alla lunghezza del testo.
                const timeoutMs = Math.max(3000, text.length * 90);
                setTimeout(finish, timeoutMs);
            }
            window.speechSynthesis.speak(utter);
        } catch (e) {
            console.warn('Sintesi vocale non disponibile:', e);
            if (onEnd) onEnd();
        }
    }

    function stopAll() {
        if (supported()) window.speechSynthesis.cancel();
    }

    return { supported, isEnabled, setEnabled, speak, stopAll };
})();

// Legge un messaggio del coach (stesso testo mostrato a schermo) e lo ritorna,
// cosi' il chiamante puo' anche aggiornare il testo visibile con lo stesso valore.
function speakCoachMessage(avatarId, type, userName = '') {
    const text = getCoachMessage(avatarId, type, userName);
    const genderHint = avatarId === 'marco' ? 'male' : 'female';
    CoachVoice.speak(text, genderHint);
    return text;
}

// Annuncia a voce la scheda del giorno. Usa exercisePhrase() (workout-engine.js)
// cosi' gli esercizi a tempo (riscaldamento, cardio) non usano piu' lo schema
// "N serie da M" che suonava innaturale — bug noto risolto insieme al 4.2.
function announcePlan(plan, avatarId, onEnd) {
    if (!plan || !plan.length) { if (onEnd) onEnd(); return; }
    const genderHint = avatarId === 'marco' ? 'male' : 'female';
    const phrase = typeof exercisePhrase === 'function'
        ? exercisePhrase
        : (e) => `${e.name}, ${e.sets} serie da ${e.reps}`;
    const elenco = plan.map(phrase).join('. Poi, ');
    CoachVoice.speak(`Ecco la tua scheda di oggi. ${elenco}.`, genderHint, onEnd);
}

// Annuncia a voce il prossimo esercizio consigliato durante una sessione
// adattiva (usato dopo che l'utente segna un esercizio come fatto).
function announceNextExercise(exercise, avatarId) {
    if (!exercise) {
        CoachVoice.speak('Scheda completata! Ottimo lavoro.', avatarId === 'marco' ? 'male' : 'female');
        return;
    }
    const genderHint = avatarId === 'marco' ? 'male' : 'female';
    const phrase = typeof exercisePhrase === 'function'
        ? exercisePhrase(exercise)
        : `${exercise.name}, ${exercise.sets} serie da ${exercise.reps}`;
    CoachVoice.speak(`Prossimo esercizio: ${phrase}.`, genderHint);
}
