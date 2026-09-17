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

    function pickVoice(genderHint) {
        if (!voicesCache.length) loadVoices();
        const italian = voicesCache.filter(v => v.lang && v.lang.toLowerCase().startsWith('it'));
        const pool = italian.length ? italian : voicesCache;
        if (!pool.length) return null;
        if (genderHint) {
            const guess = pool.find(v => v.name.toLowerCase().includes(genderHint));
            if (guess) return guess;
        }
        return pool[0];
    }

    // genderHint: 'male' o 'female' (best-effort: non tutti i browser
    // espongono il genere della voce, si prova a indovinare dal nome)
    function speak(text, genderHint) {
        if (!supported() || !isEnabled() || !text) return;
        try {
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = 'it-IT';
            const voice = pickVoice(genderHint);
            if (voice) utter.voice = voice;
            window.speechSynthesis.speak(utter);
        } catch (e) {
            console.warn('Sintesi vocale non disponibile:', e);
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
function announcePlan(plan, avatarId) {
    if (!plan || !plan.length) return;
    const genderHint = avatarId === 'marco' ? 'male' : 'female';
    const phrase = typeof exercisePhrase === 'function'
        ? exercisePhrase
        : (e) => `${e.name}, ${e.sets} serie da ${e.reps}`;
    const elenco = plan.map(phrase).join('. Poi, ');
    CoachVoice.speak(`Ecco la tua scheda di oggi. ${elenco}.`, genderHint);
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
