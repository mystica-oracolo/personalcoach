// Motore allenamento: genera la scheda in base a livello + obiettivo + focus
// del giorno (punto 4.3), e traccia la sessione in modo adattivo — l'utente
// può segnare esercizi fuori ordine e il coach ricalcola cosa manca (4.2).
// Modulo separato da app.js, come deciso per le feature nuove.

const FOCUS_LABELS = {
    gambe: 'Gambe',
    upper: 'Upper Body',
    cardio: 'Cardio',
    full: 'Full Body'
};

// type: 'reps' -> "N serie da M" (default). 'time' -> il campo "sets" è già
// la durata del blocco intero (es. "5 min"), non un numero di serie: si legge
// diversamente a voce (bug noto in handoff, sistemato qui in announcePlan).
const EXERCISE_LIBRARY = {
    gambe: {
        principiante: [
            { name: 'Riscaldamento', sets: '5 min', reps: 'Mobilità caviglie e anche', type: 'time' },
            { name: 'Squat a corpo libero', sets: '3', reps: '12', type: 'reps' },
            { name: 'Affondi', sets: '3', reps: '10 per gamba', type: 'reps' },
            { name: 'Ponte glutei', sets: '3', reps: '15', type: 'reps' },
            { name: 'Alzate su punte', sets: '3', reps: '20', type: 'reps' },
            { name: 'Stretching gambe', sets: '5 min', reps: 'Quadricipiti e polpacci', type: 'time' }
        ],
        intermedio: [
            { name: 'Riscaldamento', sets: '8 min', reps: 'Cardio leggero + mobilità', type: 'time' },
            { name: 'Squat con salto', sets: '4', reps: '12', type: 'reps' },
            { name: 'Affondi in camminata', sets: '4', reps: '12 per gamba', type: 'reps' },
            { name: 'Stacco rumeno (o su una gamba)', sets: '4', reps: '10', type: 'reps' },
            { name: 'Hip thrust', sets: '4', reps: '12', type: 'reps' },
            { name: 'Polpacci in piedi', sets: '3', reps: '20', type: 'reps' }
        ],
        avanzato: [
            { name: 'Riscaldamento', sets: '10 min', reps: 'Mobilità dinamica', type: 'time' },
            { name: 'Squat pesante', sets: '5', reps: '5', type: 'reps' },
            { name: 'Stacchi da terra', sets: '4', reps: '6', type: 'reps' },
            { name: 'Bulgarian split squat', sets: '4', reps: '8 per gamba', type: 'reps' },
            { name: 'Leg press', sets: '4', reps: '10', type: 'reps' },
            { name: 'Sprint brevi', sets: '6', reps: '20 metri', type: 'reps' }
        ]
    },
    upper: {
        principiante: [
            { name: 'Riscaldamento', sets: '5 min', reps: 'Mobilità spalle e busto', type: 'time' },
            { name: 'Push-up facilitati (ginocchia)', sets: '3', reps: '10', type: 'reps' },
            { name: 'Rematore con elastico', sets: '3', reps: '12', type: 'reps' },
            { name: 'Shoulder press leggera', sets: '3', reps: '10', type: 'reps' },
            { name: 'Plank', sets: '3', reps: '20 secondi', type: 'reps' },
            { name: 'Stretching braccia e spalle', sets: '5 min', reps: 'Defaticamento', type: 'time' }
        ],
        intermedio: [
            { name: 'Riscaldamento', sets: '8 min', reps: 'Mobilità articolare', type: 'time' },
            { name: 'Push-up', sets: '4', reps: '15', type: 'reps' },
            { name: 'Trazioni assistite (o lat machine)', sets: '4', reps: '8', type: 'reps' },
            { name: 'Military press', sets: '3', reps: '10', type: 'reps' },
            { name: 'Curl bicipiti', sets: '3', reps: '12', type: 'reps' },
            { name: 'Plank con spinta', sets: '3', reps: '30 secondi', type: 'reps' }
        ],
        avanzato: [
            { name: 'Riscaldamento', sets: '10 min', reps: 'Mobilità dinamica', type: 'time' },
            { name: 'Panca piana', sets: '5', reps: '5', type: 'reps' },
            { name: 'Trazioni zavorrate', sets: '4', reps: '8', type: 'reps' },
            { name: 'Military press in piedi', sets: '4', reps: '6', type: 'reps' },
            { name: 'Dip alle parallele', sets: '4', reps: '10', type: 'reps' },
            { name: 'Plank con peso', sets: '3', reps: '45 secondi', type: 'reps' }
        ]
    },
    cardio: {
        principiante: [
            { name: 'Riscaldamento', sets: '5 min', reps: 'Camminata veloce', type: 'time' },
            { name: 'Camminata in salita / tapis roulant', sets: '15 min', reps: 'Ritmo costante', type: 'time' },
            { name: 'Jumping jack', sets: '3', reps: '20', type: 'reps' },
            { name: 'Defaticamento', sets: '5 min', reps: 'Camminata lenta e stretching', type: 'time' }
        ],
        intermedio: [
            { name: 'Riscaldamento', sets: '8 min', reps: 'Corsa leggera', type: 'time' },
            { name: 'Corsa a ritmo moderato', sets: '20 min', reps: 'Frequenza cardiaca media', type: 'time' },
            { name: 'Burpees', sets: '4', reps: '12', type: 'reps' },
            { name: 'Mountain climbers', sets: '4', reps: '30 secondi', type: 'reps' },
            { name: 'Defaticamento', sets: '5 min', reps: 'Stretching', type: 'time' }
        ],
        avanzato: [
            { name: 'Riscaldamento', sets: '10 min', reps: 'Corsa progressiva', type: 'time' },
            { name: 'HIIT Tabata', sets: '20 min', reps: '20 sec lavoro / 10 sec riposo', type: 'time' },
            { name: 'Burpees', sets: '5', reps: '15', type: 'reps' },
            { name: 'Kettlebell swing', sets: '4', reps: '20', type: 'reps' },
            { name: 'Defaticamento', sets: '8 min', reps: 'Corsa lenta e stretching', type: 'time' }
        ]
    },
    full: {
        principiante: [
            { name: 'Riscaldamento', sets: '5 min', reps: 'Camminata e mobilità', type: 'time' },
            { name: 'Squat', sets: '3', reps: '12', type: 'reps' },
            { name: 'Push-up (facilitati)', sets: '3', reps: '10', type: 'reps' },
            { name: 'Rematore con elastico', sets: '3', reps: '12', type: 'reps' },
            { name: 'Plank', sets: '3', reps: '20 secondi', type: 'reps' },
            { name: 'Stretching', sets: '5 min', reps: 'Tutto il corpo', type: 'time' }
        ],
        intermedio: [
            { name: 'Riscaldamento', sets: '10 min', reps: 'Cardio leggero', type: 'time' },
            { name: 'Squat', sets: '4', reps: '12', type: 'reps' },
            { name: 'Push-up', sets: '4', reps: '12', type: 'reps' },
            { name: 'Rematore', sets: '4', reps: '12', type: 'reps' },
            { name: 'Affondi', sets: '3', reps: '10 per gamba', type: 'reps' },
            { name: 'Plank', sets: '3', reps: '40 secondi', type: 'reps' }
        ],
        avanzato: [
            { name: 'Riscaldamento', sets: '10 min', reps: 'Mobilità dinamica', type: 'time' },
            { name: 'Circuito a corpo libero', sets: '5', reps: '10 esercizi a rotazione', type: 'reps' },
            { name: 'Burpees', sets: '4', reps: '15', type: 'reps' },
            { name: 'Trazioni', sets: '4', reps: 'max', type: 'reps' },
            { name: 'Kettlebell swing', sets: '4', reps: '20', type: 'reps' },
            { name: 'Plank con peso', sets: '3', reps: '45 secondi', type: 'reps' }
        ]
    }
};

// Genera la scheda del giorno: focus (gambe/upper/cardio/full) decide la base
// di esercizi, livello decide il volume/difficoltà, obiettivo continua a
// influenzare la scheda (finisher o carico) invece di essere ignorato.
function generateWorkoutPlan(level, objective, focus) {
    const lib = EXERCISE_LIBRARY[focus] || EXERCISE_LIBRARY.full;
    const base = lib[level] || lib.principiante;

    let plan = base.map((ex, i) => ({ ...ex, id: `${focus}-${level}-${i}` }));

    if (objective === 'dimagrimento' && focus !== 'cardio') {
        plan.push({
            id: `${focus}-${level}-finisher`,
            name: 'Finisher cardio',
            sets: '5 min',
            reps: 'Intervalli ad alta intensità',
            type: 'time'
        });
    }
    if (objective === 'forza' && focus !== 'cardio') {
        plan = plan.map(ex => ex.type === 'reps'
            ? { ...ex, reps: `${ex.reps} (aumenta il carico rispetto all'ultima volta)` }
            : ex);
    }

    return plan;
}

// Frase corretta per la sintesi vocale, a seconda del tipo di esercizio
// (fix del limite noto: gli esercizi a tempo non usano più lo schema "serie").
function exercisePhrase(ex) {
    if (ex.type === 'time') return `${ex.name}: ${ex.reps}, ${ex.sets}`;
    return `${ex.name}, ${ex.sets} serie da ${ex.reps}`;
}

// --- Sessione adattiva ---
// Tiene traccia di cosa è stato fatto durante l'allenamento corrente, in
// qualsiasi ordine l'utente lo faccia davvero in palestra (punto 4.2).
const WorkoutSession = (function () {
    let state = null;

    function start(plan) {
        state = {
            planned: plan.map(ex => ({ ...ex, status: 'pending' })),
            extra: []
        };
        return state;
    }

    function isActive() {
        return state !== null;
    }

    function markDone(exerciseId) {
        if (!state) return;
        const ex = state.planned.find(e => e.id === exerciseId);
        if (ex) ex.status = 'done';
    }

    function markPending(exerciseId) {
        if (!state) return;
        const ex = state.planned.find(e => e.id === exerciseId);
        if (ex) ex.status = 'pending';
    }

    // L'utente ha fatto un esercizio fuori scheda (es. un attrezzo era
    // occupato e ha ripiegato su altro): lo registriamo come completato,
    // il resto della scheda pianificata resta invariato e si ricalcola da sé
    // (il "prossimo consigliato" salta semplicemente al successivo pending).
    function addUnplanned(name) {
        if (!state || !name || !name.trim()) return null;
        const entry = {
            id: `extra-${Date.now()}`,
            name: name.trim(),
            sets: '-',
            reps: 'fuori scheda',
            type: 'reps',
            status: 'done'
        };
        state.extra.push(entry);
        return entry;
    }

    function getNextSuggested() {
        if (!state) return null;
        return state.planned.find(e => e.status === 'pending') || null;
    }

    function getRemainingCount() {
        if (!state) return 0;
        return state.planned.filter(e => e.status === 'pending').length;
    }

    // Tutto ciò che è stato effettivamente completato (pianificato + extra),
    // usato per salvare lo storico reale invece della scheda teorica.
    function getCompletedExercises() {
        if (!state) return [];
        return [...state.planned.filter(e => e.status === 'done'), ...state.extra];
    }

    function getAll() {
        return state;
    }

    function reset() {
        state = null;
    }

    return {
        start, isActive, markDone, markPending, addUnplanned,
        getNextSuggested, getRemainingCount, getCompletedExercises,
        getAll, reset
    };
})();
