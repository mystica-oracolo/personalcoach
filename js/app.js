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
        eta: parseInt(document.getElementById('eta').value),
        peso: parseFloat(document.getElementById('peso').value),
        altezza: parseInt(document.getElementById('altezza').value),
        obiettivo: document.getElementById('obiettivo').value,
        livello: document.getElementById('livello').value,
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
        'profile': 'profile.html'
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
    WorkoutSession.reset();
    currentFocus = null;
    currentPlan = [];
    document.getElementById('focus-selector').style.display = 'block';
    document.getElementById('workout-section').style.display = 'none';
    document.getElementById('workout-actions').style.display = 'none';
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
                <button type="button" class="btn-toggle-exercise" onclick="toggleExerciseDone('${ex.id}')">
                    ${isDone ? 'Annulla' : 'Fatto ✓'}
                </button>
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

function startWorkout() {
    if (!WorkoutSession.isActive()) return; // serve prima scegliere il focus

    if (!activeWorkout) {
        activeWorkout = {
            startTime: new Date().toISOString(),
            avatar: selectedAvatar
        };
    }
    
    workoutSeconds = 0;
    document.getElementById('btn-start').style.display = 'none';
    document.getElementById('btn-end').style.display = 'block';
    document.getElementById('active-workout').style.display = 'block';
    updateChangeFocusButton();
    
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

    // Annuncia a voce la scheda del giorno (in coda dopo il messaggio iniziale)
    if (typeof announcePlan === 'function') {
        announcePlan(currentPlan, selectedAvatar);
    }
}

function endWorkout() {
    clearInterval(workoutTimer);
    clearInterval(motivationTimer);
    
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