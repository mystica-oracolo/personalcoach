// Gestione Dati
const Storage = {
    save(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    },
    
    get(key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    },
    
    remove(key) {
        localStorage.removeItem(key);
    }
};

// Stato Globale
let currentUser = null;
let selectedAvatar = null;
let activeWorkout = null;
let workoutTimer = null;
let workoutSeconds = 0;
let motivationTimer = null;
let activeAssistExerciseId = null; // id dell'esercizio con assistenza vocale attiva ora
let commandsHintGiven = false; // spiega i comandi vocali una sola volta a workout
const HANDSFREE_MAX_RETRIES = 3; // dopo N silenzi/errori di fila, si rinuncia invece di continuare all'infinito
const HANDSFREE_RETRY_DELAY_MS = 1500; // pausa minima prima di ridomandare, per non martellare la voce a raffica

// Inizializzazione
document.addEventListener('DOMContentLoaded', () => {
    checkExistingUser();
    setupEventListeners();
    // Init pagine secondarie (va fatto qui, dopo checkExistingUser,
    // così currentUser/selectedAvatar sono già valorizzati)
    if (document.getElementById('history-list')) loadHistory();
    if (document.getElementById('weight-chart')) loadProgress();
    if (document.getElementById('coach-talk')) loadCoachMessage('greetings');
    const audioBtn = document.getElementById('btn-audio-toggle');
    if (audioBtn && typeof CoachVoice !== 'undefined') {
        audioBtn.textContent = CoachVoice.isEnabled() ? '🔊' : '🔇';
    }
    // Voce attiva di default: appena si arriva sul workout senza un focus già
    // scelto, il coach saluta da solo e chiede a voce cosa allenare oggi
    // (vedi FOCUS_GREETINGS più sotto) — non serve più toccare nulla prima.
    // askFocusByVoice() stessa verifica se c'è già un focus attivo o se la
    // voce non è disponibile, quindi qui basta chiamarla quando ha senso.
    if (document.getElementById('focus-selector')) {
        askFocusByVoice();
    }
});

function checkExistingUser() {
    const savedUser = Storage.get('fitcoach_user');
    if (savedUser) {
        currentUser = savedUser;
        selectedAvatar = savedUser.avatar;
        // Solo su index.html: se esiste già un profilo, mostra subito
        // la dashboard invece del wizard di benvenuto (senza redirect,
        // altrimenti su workout/history/progress/profile si tornerebbe
        // sempre indietro a index.html)
        if (document.getElementById('step-dashboard')) {
            nextStep('step-dashboard');
        }
        loadDashboard();
    }
}

function setupEventListeners() {
    // Form profilo
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileSubmit);
    }
    
    // Form peso
    const weightForm = document.getElementById('weight-form');
    if (weightForm) {
        weightForm.addEventListener('submit', handleWeightSubmit);
    }
}

function nextStep(stepId) {
    document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
    document.getElementById(stepId).classList.add('active');
}

function handleProfileSubmit(e) {
    e.preventDefault();
    
    currentUser = {
        nome: document.getElementById('nome').value,
        sesso: document.getElementById('sesso').value,
        eta: parseInt(document.getElementById('eta').value),
        peso: parseFloat(document.getElementById('peso').value),
        altezza: parseInt(document.getElementById('altezza').value),
        obiettivo: document.getElementById('obiettivo').value,
        livello: document.getElementById('livello').value,
        giorniSettimana: parseInt(document.getElementById('giorni').value),
        doveAllena: document.getElementById('dove').value,
        limitazioni: document.getElementById('limitazioni').value.trim(),
        createdAt: new Date().toISOString(),
        weightHistory: [
            { date: new Date().toISOString(), weight: parseFloat(document.getElementById('peso').value) }
        ],
        workouts: []
    };
    
    Storage.save('fitcoach_user', currentUser);
    nextStep('step-avatar');
}

function selectAvatar(avatarId) {
    selectedAvatar = avatarId;
    currentUser.avatar = avatarId;
    Storage.save('fitcoach_user', currentUser);
    
    // Visual feedback
    document.querySelectorAll('.avatar-card').forEach(card => {
        card.classList.remove('selected');
    });
    event.target.closest('.avatar-card').classList.add('selected');
    
    // Completa setup
    setTimeout(() => {
        showPage('dashboard');
        loadDashboard();
    }, 500);
}

function loadDashboard() {
    if (!currentUser || !selectedAvatar) return;
    const coach = avatars[selectedAvatar];

    // Aggiorna stats (solo se presenti in pagina, es. index.html)
    const statPeso = document.getElementById('stat-peso');
    if (statPeso) statPeso.textContent = `${currentUser.peso} kg`;

    const statWorkouts = document.getElementById('stat-workouts');
    if (statWorkouts) statWorkouts.textContent = currentUser.workouts.length;

    const statObiettivo = document.getElementById('stat-obiettivo');
    if (statObiettivo) statObiettivo.textContent = getObiettivoLabel(currentUser.obiettivo);

    // Coach banner (solo in index.html)
    const coachAvatar = document.getElementById('coach-avatar');
    if (coachAvatar) coachAvatar.src = coach.image;

    const welcomeMessage = document.getElementById('welcome-message');
    if (welcomeMessage) {
        welcomeMessage.textContent = getCoachMessage(selectedAvatar, 'greetings', currentUser.nome);
    }

    // Aggiorna mini avatar (es. in workout.html)
    const miniAvatar = document.getElementById('mini-coach-avatar');
    if (miniAvatar) {
        miniAvatar.src = coach.image;
    }
}

function getObiettivoLabel(value) {
    const labels = {
        dimagrimento: 'Dimagrimento',
        massa: 'Massa Muscolare',
        forza: 'Forza',
        mantenimento: 'Mantenimento',
        benessere: 'Benessere'
    };
    return labels[value] || value;
}

function showPage(page) {
    // Mappa pagine
    const pages = {
        'dashboard': 'index.html',
        'workout': 'workout.html',
        'history': 'history.html',
        'progress': 'progress.html',
        'profile': 'profile.html',
        'faq': 'faq.html'
    };
    
    if (pages[page]) {
        window.location.href = pages[page];
    }
}

// Workout Functions
// generateWorkoutPlan(livello, obiettivo, focus) ed exercisePhrase() vivono
// in workout-engine.js insieme a WorkoutSession (tracciamento adattivo).
let currentFocus = null;
let currentPlan = [];

// Punto 4.3: prima di generare la scheda, chiede il focus del giorno.
function chooseFocus(focus) {
    currentFocus = focus;
    currentPlan = generateWorkoutPlan(currentUser.livello, currentUser.obiettivo, focus);
    WorkoutSession.start(currentPlan);

    document.getElementById('focus-selector').style.display = 'none';
    document.getElementById('workout-section').style.display = 'block';
    document.getElementById('workout-actions').style.display = 'flex';
    const label = document.getElementById('focus-label');
    if (label) label.textContent = `— ${FOCUS_LABELS[focus] || ''}`;

    updateChangeFocusButton();
    renderWorkoutPlan();
}

function changeFocus() {
    if (activeWorkout) return; // non si cambia focus a workout già avviato
    if (typeof VoiceInput !== 'undefined') VoiceInput.cancel();
    WorkoutSession.reset();
    currentFocus = null;
    currentPlan = [];
    document.getElementById('focus-selector').style.display = 'block';
    document.getElementById('workout-section').style.display = 'none';
    document.getElementById('workout-actions').style.display = 'none';
    askFocusByVoice(); // il coach richiede subito a voce il nuovo focus, come al primo arrivo
}

// Riflette nel pulsante "Cambia focus" se è effettivamente utilizzabile
// (non durante un workout attivo) — prima era solo bloccato in JS ma restava
// cliccabile senza nessun segnale visivo.
function updateChangeFocusButton() {
    const btn = document.getElementById('btn-change-focus');
    if (!btn) return;
    const locked = !!activeWorkout;
    btn.disabled = locked;
    btn.title = locked ? 'Termina il workout per cambiare focus' : '';
}

// Punto 4.2: rirenderizza la scheda in base allo stato reale della sessione
// (fatto/da fare), evidenziando il prossimo esercizio consigliato.
function renderWorkoutPlan() {
    const session = WorkoutSession.getAll();
    if (!session) return;

    const next = WorkoutSession.getNextSuggested();
    const planContainer = document.getElementById('workout-plan');

    const plannedHtml = session.planned.map(ex => {
        const isNext = next && ex.id === next.id;
        const isDone = ex.status === 'done';
        const classes = ['exercise-item'];
        if (isDone) classes.push('done');
        if (isNext) classes.push('suggested');
        const meta = ex.type === 'time' ? ex.reps : `Serie: ${ex.sets} | Ripetizioni: ${ex.reps}`;
        return `
            <div class="${classes.join(' ')}">
                <div class="exercise-main">
                    <h4>${isNext ? '👉 ' : ''}${ex.name}${isDone ? ' ✅' : ''}</h4>
                    <div class="exercise-meta">${meta}</div>
                </div>
                <div class="exercise-actions">
                    ${isDone ? '' : `<button type="button" class="btn-assist" onclick="startExerciseAssist('${ex.id}')" ${(!activeWorkout || activeAssistExerciseId) ? 'disabled' : ''} title="${!activeWorkout ? 'Avvia il workout prima' : ''}">▶️ Avvia</button>`}
                    <button type="button" class="btn-toggle-exercise" onclick="toggleExerciseDone('${ex.id}')">
                        ${isDone ? 'Annulla' : 'Fatto ✓'}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    const extraHtml = session.extra.length ? `
        <h4 class="extra-heading">Fuori scheda</h4>
        ${session.extra.map(ex => `
            <div class="exercise-item done">
                <div class="exercise-main">
                    <h4>${ex.name} ✅</h4>
                    <div class="exercise-meta">Aggiunto durante l'allenamento</div>
                </div>
            </div>
        `).join('')}
    ` : '';

    planContainer.innerHTML = plannedHtml + extraHtml;
}

// L'utente segna un esercizio come fatto (anche fuori ordine) o annulla.
function toggleExerciseDone(exerciseId) {
    const session = WorkoutSession.getAll();
    if (!session) return;
    const ex = session.planned.find(e => e.id === exerciseId);
    if (!ex) return;

    // Se stai segnando "Fatto" a mano mentre l'assistenza vocale sta ancora
    // contando su questo stesso esercizio, la fermiamo per non lasciarla
    // andare avanti in sottofondo su un esercizio già chiuso.
    if (exerciseId === activeAssistExerciseId) {
        stopExerciseAssist();
    }

    if (ex.status === 'done') {
        WorkoutSession.markPending(exerciseId);
    } else {
        WorkoutSession.markDone(exerciseId);
        // Annuncia a voce il prossimo esercizio consigliato, ricalcolato al volo
        if (activeWorkout && typeof announceNextExercise === 'function') {
            announceNextExercise(WorkoutSession.getNextSuggested(), selectedAvatar);
        }
    }
    renderWorkoutPlan();
}

// L'utente ha fatto un esercizio non previsto dalla scheda (es. attrezzo
// occupato, ha ripiegato su altro): lo registriamo e il piano si adatta.
function handleAddUnplanned() {
    const input = document.getElementById('extra-exercise-input');
    if (!input || !input.value.trim()) return;
    WorkoutSession.addUnplanned(input.value);
    input.value = '';
    renderWorkoutPlan();
    if (activeWorkout && typeof CoachVoice !== 'undefined') {
        speakCoachMessage(selectedAvatar, 'motivation', currentUser.nome);
    }
}

// --- Assistenza vocale in tempo reale sul singolo esercizio (feedback 1) ---
// Conta le ripetizioni o il tempo a voce, tenendo il ritmo, con frasi
// motivazionali random intercalate (vedi js/exercise-assist.js).
function startExerciseAssist(exerciseId) {
    if (!activeWorkout) return; // serve il workout avviato
    const session = WorkoutSession.getAll();
    if (!session) return;
    const ex = session.planned.find(e => e.id === exerciseId);
    if (!ex || ex.status === 'done') return;
    if (typeof ExerciseAssist === 'undefined') return;

    activeAssistExerciseId = exerciseId;
    const shouldAnnounceHint = voiceAssistAvailable() && !commandsHintGiven;
    if (shouldAnnounceHint) commandsHintGiven = true; // spiegato al massimo una volta a workout
    const stopBtn = document.getElementById('btn-stop-assist');
    if (stopBtn) stopBtn.style.display = 'inline-block';
    renderWorkoutPlan(); // disabilita gli altri "Avvia" mentre uno è attivo

    ExerciseAssist.start(ex, selectedAvatar, {
        onUpdate: (state) => renderAssistStatus(ex, state),
        handsFree: voiceAssistAvailable(),
        announceCommandsHint: shouldAnnounceHint,
        onComplete: () => {
            WorkoutSession.markDone(exerciseId);
            activeAssistExerciseId = null;
            if (stopBtn) stopBtn.style.display = 'none';
            const curEx = document.getElementById('current-exercise');
            if (curEx) curEx.innerHTML = '';
            renderWorkoutPlan();
            if (voiceAssistAvailable()) {
                askNextExerciseByVoice();
            } else if (typeof announceNextExercise === 'function') {
                announceNextExercise(WorkoutSession.getNextSuggested(), selectedAvatar);
            }
        }
    });
}

function stopExerciseAssist() {
    if (typeof ExerciseAssist !== 'undefined') ExerciseAssist.stop();
    activeAssistExerciseId = null;
    const stopBtn = document.getElementById('btn-stop-assist');
    if (stopBtn) stopBtn.style.display = 'none';
    const curEx = document.getElementById('current-exercise');
    if (curEx) curEx.innerHTML = '';
    renderWorkoutPlan();
}

function renderAssistStatus(ex, state) {
    const el = document.getElementById('current-exercise');
    if (!el) return;
    const pausedTag = (typeof ExerciseAssist !== 'undefined' && ExerciseAssist.isPaused && ExerciseAssist.isPaused())
        ? '<div class="assist-paused">⏸ In pausa — dì "riprendi"</div>' : '';
    if (state.mode === 'reps') {
        el.innerHTML = `${pausedTag}<div class="assist-exercise">${ex.name}</div><div class="assist-count">${state.rep} / ${state.totalReps}</div><div class="assist-meta">Serie ${state.set} di ${state.totalSets}</div>`;
    } else if (state.mode === 'hold') {
        el.innerHTML = `${pausedTag}<div class="assist-exercise">${ex.name}</div><div class="assist-count">${state.remaining}s</div><div class="assist-meta">Serie ${state.set} di ${state.totalSets}</div>`;
    } else if (state.mode === 'rest') {
        el.innerHTML = `<div class="assist-exercise">Riposo</div><div class="assist-count">${state.seconds}s</div><div class="assist-meta">Prossima serie: ${state.set} di ${state.totalSets}</div>`;
    } else {
        el.innerHTML = `<div class="assist-exercise">${ex.name}</div><div class="assist-meta">Segna "Fatto ✓" quando hai finito</div>`;
    }
}

// --- Modalità mani libere (feedback 3): il coach chiede a voce quale
// esercizio, e ascolta/interpreta la risposta parlata (js/voice-input.js).
// RIDISEGNATO: prima serviva un pulsante 🎙️ separato da attivare a mano.
// Ora la voce è attiva di default per tutta la sessione (unico interruttore
// resta 🔊, quello che già c'era) e il coach saluta da solo appena si arriva
// sulla pagina, senza bisogno di toccare nulla prima. "Non invadente" vuol
// dire: un saluto, un ascolto, e se non risponde nessuno si ferma lì senza
// insistere — i pulsanti a tocco restano comunque sempre visibili e utilizzabili.
function voiceAssistAvailable() {
    return typeof VoiceInput !== 'undefined' && VoiceInput.supported()
        && typeof CoachVoice !== 'undefined' && CoachVoice.isEnabled();
}

// Da chiamare quando il microfono non ha sentito nulla/ha dato errore: dopo
// un paio di tentativi rinuncia con un messaggio, invece di continuare a
// ridomandare all'infinito (era il loop che si era rotto nella versione
// precedente). Aspetta sempre un attimo prima di ridomandare, mai subito.
function handleHandsFreeSilence(retryFn, message, streakRef) {
    streakRef.count++;
    const genderHint = selectedAvatar === 'marco' ? 'male' : 'female';
    if (streakRef.count >= HANDSFREE_MAX_RETRIES) {
        streakRef.count = 0;
        CoachVoice.speak(`${message} Nessun problema, puoi toccare uno dei pulsanti quando vuoi.`, genderHint);
        return;
    }
    CoachVoice.speak(message, genderHint, () => {
        setTimeout(() => { if (voiceAssistAvailable()) retryFn(); }, HANDSFREE_RETRY_DELAY_MS);
    });
}

// Le 10 varianti di saluto fornite per l'apertura sessione: una a caso ogni
// volta, così il coach non sembra un disco rotto che dice sempre la stessa
// identica frase ad ogni allenamento.
const FOCUS_GREETINGS = [
    'Ciao! Pronto per la sessione di oggi? Scegli il tuo focus: parte superiore, parte inferiore o un allenamento full body?',
    'Buongiorno! È ora di muoversi. Cosa alleniamo oggi? Scegli tra upper body, lower body o total body.',
    'Pronto a dare il massimo? Seleziona il circuito di oggi: preferisci sopra, sotto o tutto il corpo?',
    'Bentornato! Iniziamo subito. Qual è l\'obiettivo del giorno? Parte alta, gambe e glutei, oppure un mix completo?',
    'Buongiorno! Che si fa oggi? Parte superiore, parte inferiore o full body?',
    'Carico per l\'allenamento? Dimmi su cosa vuoi concentrarti oggi: sopra, sotto o total body?',
    'Ciao! Iniziamo? Seleziona il focus di oggi: parte superiore, inferiore o una sessione completa.',
    'Buondì! Il tuo trainer virtuale è pronto. Quale zona del corpo facciamo bruciare oggi? Upper, lower o full body?',
    'Ottimo giorno per allenarsi! Su cosa lavoriamo oggi? Parte superiore, inferiore o preferisci total body?',
    'Buongiorno! Scaldiamo i muscoli: qual è il menù del giorno? Parte alta, parte bassa o corpo intero?'
];
let focusGreetingStreak = { count: 0 };

function askFocusByVoice() {
    if (!currentUser || WorkoutSession.isActive() || !voiceAssistAvailable()) return;
    const genderHint = selectedAvatar === 'marco' ? 'male' : 'female';
    const greeting = FOCUS_GREETINGS[Math.floor(Math.random() * FOCUS_GREETINGS.length)];
    CoachVoice.speak(greeting, genderHint, () => {
        VoiceInput.listenOnce({
            onResult: (transcript) => {
                focusGreetingStreak.count = 0; // una risposta captata, anche se non capita: il microfono funziona
                const focus = matchFocus(transcript);
                if (focus) {
                    chooseFocus(focus);
                    CoachVoice.speak(`Perfetto, ${FOCUS_LABELS[focus] || ''}.`, genderHint);
                } else {
                    CoachVoice.speak('Non ho capito. Puoi ripetere, oppure toccare uno dei pulsanti.', genderHint);
                }
            },
            onError: () => handleHandsFreeSilence(askFocusByVoice, 'Non ho sentito bene il microfono.', focusGreetingStreak),
            onNoMatch: () => handleHandsFreeSilence(askFocusByVoice, 'Non ho sentito nulla.', focusGreetingStreak)
        });
    });
}

let nextExerciseStreak = { count: 0 };

function askNextExerciseByVoice() {
    if (!activeWorkout || !voiceAssistAvailable()) return;
    const genderHint = selectedAvatar === 'marco' ? 'male' : 'female';
    const next = WorkoutSession.getNextSuggested();
    const prompt = next
        ? `Prossimo esercizio suggerito: ${next.name}. Dì "sì" per iniziare, oppure dimmi il nome di un altro esercizio che stai facendo.`
        : 'Hai completato tutta la scheda. Dì "fine" per terminare, oppure dimmi un esercizio extra che hai fatto.';
    CoachVoice.speak(prompt, genderHint, () => {
        VoiceInput.listenOnce({
            onResult: (transcript) => {
                if (!voiceAssistAvailable()) return;
                nextExerciseStreak.count = 0; // una risposta captata, anche se non capita: il microfono funziona
                if (next && isAffirmative(transcript)) {
                    startExerciseAssist(next.id);
                    return;
                }
                if (!next && isNegativeOrStop(transcript)) {
                    endWorkout();
                    return;
                }
                const matched = matchExerciseInPlan(transcript, WorkoutSession.getAll().planned);
                if (matched && matched.status !== 'done') {
                    startExerciseAssist(matched.id);
                    return;
                }
                // Non è un esercizio pianificato: lo registriamo come extra
                // (attrezzo occupato, ha fatto altro) e si continua a voce.
                WorkoutSession.addUnplanned(transcript);
                renderWorkoutPlan();
                CoachVoice.speak(`Segnato: ${transcript}.`, genderHint, () => askNextExerciseByVoice());
            },
            onError: () => handleHandsFreeSilence(askNextExerciseByVoice, 'Non ho sentito bene il microfono.', nextExerciseStreak),
            onNoMatch: () => handleHandsFreeSilence(askNextExerciseByVoice, 'Non ho sentito nulla.', nextExerciseStreak)
        });
    });
}

function startWorkout() {
    if (!WorkoutSession.isActive()) return; // serve prima scegliere il focus

    if (!activeWorkout) {
        activeWorkout = {
            startTime: new Date().toISOString(),
            avatar: selectedAvatar
        };
    }
    
    workoutSeconds = 0;
    commandsHintGiven = false; // si rispiega una volta per il nuovo workout
    nextExerciseStreak.count = 0;
    document.getElementById('btn-start').style.display = 'none';
    document.getElementById('btn-end').style.display = 'block';
    document.getElementById('active-workout').style.display = 'block';
    updateChangeFocusButton();
    renderWorkoutPlan(); // riabilita i pulsanti "Avvia", disabilitati finché il workout non è partito
    
    // Messaggio coach: mostrato a schermo E letto ad alta voce (uso con cuffie)
    const startMsg = typeof speakCoachMessage === 'function'
        ? speakCoachMessage(selectedAvatar, 'workoutStart', currentUser.nome)
        : getCoachMessage(selectedAvatar, 'workoutStart', currentUser.nome);
    document.getElementById('coach-text').textContent = startMsg;
    
    // Timer
    workoutTimer = setInterval(() => {
        workoutSeconds++;
        const mins = Math.floor(workoutSeconds / 60).toString().padStart(2, '0');
        const secs = (workoutSeconds % 60).toString().padStart(2, '0');
        document.getElementById('timer').textContent = `${mins}:${secs}`;
    }, 1000);

    // Incoraggiamento vocale periodico, cosi' chi si allena con le cuffie
    // sente qualcosa anche senza guardare il telefono
    if (typeof speakCoachMessage === 'function') {
        motivationTimer = setInterval(() => {
            speakCoachMessage(selectedAvatar, 'motivation', currentUser.nome);
        }, 90000);
    }

    // Annuncia a voce la scheda del giorno (in coda dopo il messaggio iniziale).
    // Se la modalità mani libere è attiva, appena finito chiede subito a voce
    // il primo esercizio, senza bisogno di toccare nulla.
    if (typeof announcePlan === 'function') {
        announcePlan(currentPlan, selectedAvatar, () => {
            if (voiceAssistAvailable()) askNextExerciseByVoice();
        });
    }
}

function endWorkout() {
    clearInterval(workoutTimer);
    clearInterval(motivationTimer);
    if (typeof ExerciseAssist !== 'undefined') ExerciseAssist.stop();
    if (typeof VoiceInput !== 'undefined') VoiceInput.cancel();
    activeAssistExerciseId = null;
    const stopBtn = document.getElementById('btn-stop-assist');
    if (stopBtn) stopBtn.style.display = 'none';
    
    const workoutData = {
        date: new Date().toISOString(),
        duration: workoutSeconds,
        focus: currentFocus,
        exercises: WorkoutSession.getCompletedExercises(),
        avatar: selectedAvatar
    };
    
    // Salva workout
    currentUser.workouts.push(workoutData);
    Storage.save('fitcoach_user', currentUser);
    
    // Messaggio coach: niente alert bloccante (con le cuffie non si vuole
    // dover toccare lo schermo) — parlato e mostrato nel box del coach
    const endMsg = typeof speakCoachMessage === 'function'
        ? speakCoachMessage(selectedAvatar, 'workoutEnd', currentUser.nome)
        : getCoachMessage(selectedAvatar, 'workoutEnd', currentUser.nome);
    const coachTextEl = document.getElementById('coach-text');
    if (coachTextEl) coachTextEl.textContent = endMsg;
    
    // Reset UI e sessione, pronto per un nuovo focus la prossima volta
    document.getElementById('btn-start').style.display = 'block';
    document.getElementById('btn-end').style.display = 'none';
    document.getElementById('active-workout').style.display = 'none';
    document.getElementById('focus-selector').style.display = 'block';
    document.getElementById('workout-section').style.display = 'none';
    document.getElementById('workout-actions').style.display = 'none';
    activeWorkout = null;
    workoutSeconds = 0;
    updateChangeFocusButton();
    WorkoutSession.reset();
    currentFocus = null;
    currentPlan = [];
    
    // Aggiorna stats
    loadDashboard();
}

// History Functions
function loadHistory() {
    const list = document.getElementById('history-list');
    const noHistory = document.getElementById('no-history');
    
    if (!currentUser || currentUser.workouts.length === 0) {
        list.style.display = 'none';
        noHistory.style.display = 'block';
        return;
    }
    
    noHistory.style.display = 'none';
    list.style.display = 'block';
    
    const sortedWorkouts = [...currentUser.workouts].reverse();
    
    list.innerHTML = sortedWorkouts.map((workout, index) => {
        const date = new Date(workout.date);
        const duration = `${Math.floor(workout.duration / 60)}:${(workout.duration % 60).toString().padStart(2, '0')}`;
        
        return `
            <div class="history-item">
                <div class="history-date">
                    ${date.toLocaleDateString('it-IT')} - ${duration} min
                </div>
                <div class="history-exercises">
                    ${workout.exercises.length} esercizi${workout.focus && typeof FOCUS_LABELS !== 'undefined' && FOCUS_LABELS[workout.focus] ? ' | ' + FOCUS_LABELS[workout.focus] : ''} | Coach: ${avatars[workout.avatar].name}
                </div>
            </div>
        `;
    }).join('');
}

// Progress Functions
let weightChart = null;

function loadProgress() {
    if (!currentUser) return;
    
    // Stats peso
    const weights = currentUser.weightHistory || [];
    const weightStats = document.getElementById('weight-stats');
    
    if (weights.length > 0) {
        const firstWeight = weights[0].weight;
        const lastWeight = weights[weights.length - 1].weight;
        const diff = lastWeight - firstWeight;
        const diffSign = diff > 0 ? '+' : '';
        
        weightStats.innerHTML = `
            <div class="stat-item">
                <div class="stat-label">Peso Iniziale</div>
                <div class="stat-number">${firstWeight} kg</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Peso Attuale</div>
                <div class="stat-number">${lastWeight} kg</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Variazione</div>
                <div class="stat-number" style="color: ${diff < 0 ? 'var(--success)' : 'var(--secondary)'}">
                    ${diffSign}${diff.toFixed(1)} kg
                </div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Rilevazioni</div>
                <div class="stat-number">${weights.length}</div>
            </div>
        `;
    }
    
    // Grafico
    const ctx = document.getElementById('weight-chart');
    if (ctx && typeof Chart !== 'undefined') {
        const labels = weights.map(w => new Date(w.date).toLocaleDateString('it-IT', {
            day: '2-digit',
            month: '2-digit'
        }));
        const data = weights.map(w => w.weight);
        
        if (weightChart) {
            weightChart.destroy();
        }
        
        weightChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Peso (kg)',
                    data: data,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: {
                            color: '#334155'
                        },
                        ticks: {
                            color: '#94a3b8'
                        }
                    },
                    x: {
                        grid: {
                            color: '#334155'
                        },
                        ticks: {
                            color: '#94a3b8'
                        }
                    }
                }
            }
        });
    }
    
    // Stats generali
    const generalStats = document.getElementById('general-stats');
    if (generalStats) {
        const totalWorkouts = currentUser.workouts.length;
        const totalMinutes = currentUser.workouts.reduce((acc, w) => acc + w.duration, 0);
        const avgDuration = totalWorkouts > 0 ? Math.floor(totalMinutes / totalWorkouts) : 0;
        
        generalStats.innerHTML = `
            <div class="stat-card">
                <h4>Totale Workout</h4>
                <p class="stat-value">${totalWorkouts}</p>
            </div>
            <div class="stat-card">
                <h4>Minuti Totali</h4>
                <p class="stat-value">${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m</p>
            </div>
            <div class="stat-card">
                <h4>Durata Media</h4>
                <p class="stat-value">${avgDuration} min</p>
            </div>
            <div class="stat-card">
                <h4>Ultimo Workout</h4>
                <p class="stat-value">
                    ${totalWorkouts > 0 ? 
                        new Date(currentUser.workouts[currentUser.workouts.length - 1].date)
                            .toLocaleDateString('it-IT') : 
                        '-'}
                </p>
            </div>
        `;
    }
}

function handleWeightSubmit(e) {
    e.preventDefault();
    
    const newWeight = parseFloat(document.getElementById('new-weight').value);
    
    if (!currentUser.weightHistory) {
        currentUser.weightHistory = [];
    }
    
    currentUser.weightHistory.push({
        date: new Date().toISOString(),
        weight: newWeight
    });
    
    currentUser.peso = newWeight;
    Storage.save('fitcoach_user', currentUser);
    
    // Reset form e reload
    document.getElementById('new-weight').value = '';
    loadProgress();
    loadDashboard();
    
    // Messaggio coach
    alert(getCoachMessage(selectedAvatar, 'progress', currentUser.nome));
}

// Utility
function loadCoachMessage(type) {
    const coachText = document.getElementById('coach-text');
    if (coachText && selectedAvatar && currentUser) {
        coachText.textContent = getCoachMessage(selectedAvatar, type, currentUser.nome);
    }
}

function toggleVoice() {
    if (typeof CoachVoice === 'undefined') return;
    const enabled = !CoachVoice.isEnabled();
    CoachVoice.setEnabled(enabled);
    const btn = document.getElementById('btn-audio-toggle');
    if (btn) btn.textContent = enabled ? '🔊' : '🔇';
}

// Export per debug
window.FitCoach = {
    Storage,
    currentUser,
    avatars,
    getCoachMessage
};