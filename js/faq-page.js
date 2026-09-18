// Logica della pagina "Chiedi al Coach" (faq.html): ricerca testuale/vocale
// sulle 100 domande comuni in js/faq-data.js, con lettura ad alta voce della
// risposta trovata (coerente con l'uso a mani libere del resto dell'app).
let faqVoiceRetryStreak = 0;
const FAQ_VOICE_MAX_RETRIES = 2;

function renderFaqCategories() {
    const el = document.getElementById('faq-categories');
    if (!el || typeof FAQ_DATA === 'undefined') return;
    const categories = [...new Set(FAQ_DATA.map(e => e.category))];
    el.innerHTML = '<p class="faq-categories-title">Oppure sfoglia per argomento:</p>' +
        categories.map(c => `<button type="button" class="faq-category-chip" onclick="showFaqCategory('${c.replace(/'/g, "\\'")}')">${c}</button>`).join('');
}

function showFaqCategory(category) {
    const items = FAQ_DATA.filter(e => e.category === category);
    renderFaqResults(items, `Domande su: ${category}`);
}

function handleFaqSearch() {
    const input = document.getElementById('faq-input');
    const query = input ? input.value.trim() : '';
    if (!query) return;
    const results = faqSearch(query);
    renderFaqResults(results, null, query);
}

function renderFaqResults(results, sectionTitle, originalQuery) {
    const resultsEl = document.getElementById('faq-results');
    const emptyEl = document.getElementById('faq-empty');
    if (!resultsEl) return;

    if (!results.length) {
        resultsEl.innerHTML = '';
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.querySelector('p').textContent = originalQuery
                ? `Non ho trovato una risposta precisa per "${originalQuery}". Provo a riformulare la domanda in modo più semplice, oppure sfoglia le categorie qui sotto.`
                : 'Fammi una domanda su allenamento, alimentazione, integratori, recupero o motivazione — provo a risponderti dalle 100 domande più comuni che mi vengono fatte.';
        }
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    const titleHtml = sectionTitle ? `<p class="faq-section-title">${sectionTitle}</p>` : '';
    resultsEl.innerHTML = titleHtml + results.map(entry => `
        <div class="exercise-item faq-item">
            <div>
                <h4>${entry.question}</h4>
                <p class="assist-meta" style="margin-top:6px;">${entry.answer}</p>
            </div>
            <div class="exercise-actions">
                <button type="button" class="btn-assist" onclick="speakFaqAnswer(${entry.id})">🔊 Leggi</button>
            </div>
        </div>
    `).join('');
}

function speakFaqAnswer(id) {
    const entry = FAQ_DATA.find(e => e.id === id);
    if (!entry || typeof CoachVoice === 'undefined') return;
    const genderHint = (typeof selectedAvatar !== 'undefined' && selectedAvatar === 'marco') ? 'male' : 'female';
    CoachVoice.speak(entry.answer, genderHint);
}

// Fai la domanda a voce invece di scriverla, con lo stesso approccio anti-loop
// già usato per la modalità mani libere in allenamento (vedi js/app.js): un
// numero massimo di tentativi, poi si rinuncia con un avviso invece di restare
// bloccati ad ascoltare per sempre.
function askFaqByVoice() {
    if (typeof VoiceInput === 'undefined' || !VoiceInput.supported()) {
        alert('Il riconoscimento vocale non è supportato su questo browser/dispositivo. Puoi scrivere la domanda nel campo di ricerca.');
        return;
    }
    const genderHint = (typeof selectedAvatar !== 'undefined' && selectedAvatar === 'marco') ? 'male' : 'female';
    CoachVoice.speak('Dimmi la tua domanda.', genderHint, () => {
        VoiceInput.listenOnce({
            onResult: (transcript) => {
                faqVoiceRetryStreak = 0;
                const input = document.getElementById('faq-input');
                if (input) input.value = transcript;
                const results = faqSearch(transcript);
                renderFaqResults(results, null, transcript);
                if (results.length) {
                    CoachVoice.speak(results[0].answer, genderHint);
                } else {
                    CoachVoice.speak('Non ho trovato una risposta precisa. Puoi riformulare la domanda o scriverla.', genderHint);
                }
            },
            onError: () => retryFaqVoiceOrGiveUp('Non ho sentito bene il microfono.'),
            onNoMatch: () => retryFaqVoiceOrGiveUp('Non ho sentito nulla.')
        });
    });
}

function retryFaqVoiceOrGiveUp(message) {
    faqVoiceRetryStreak++;
    const genderHint = (typeof selectedAvatar !== 'undefined' && selectedAvatar === 'marco') ? 'male' : 'female';
    if (faqVoiceRetryStreak >= FAQ_VOICE_MAX_RETRIES) {
        faqVoiceRetryStreak = 0;
        CoachVoice.speak(`${message} Puoi scrivere la domanda nel campo di ricerca.`, genderHint);
        return;
    }
    CoachVoice.speak(message, genderHint, () => {
        setTimeout(() => askFaqByVoice(), 1200);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderFaqCategories();
    const input = document.getElementById('faq-input');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleFaqSearch();
        });
    }
    if (typeof VoiceInput === 'undefined' || !VoiceInput.supported()) {
        const voiceBtn = document.getElementById('btn-faq-voice');
        if (voiceBtn) voiceBtn.style.display = 'none';
    }
});
