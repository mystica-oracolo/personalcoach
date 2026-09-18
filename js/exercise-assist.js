// Assistente vocale in tempo reale per il singolo esercizio (feedback: "non
// voglio la lista letta una volta, voglio che mi assista contando le
// ripetizioni in tempo reale, con frasi motivazionali random, aiutandomi a
// tenere il ritmo"). Modulo separato, come le altre feature nuove.
//
// Analizza l'esercizio e decide come assisterlo:
// - 'reps'   -> conta le ripetizioni a voce a un ritmo stimato dal tipo di
//               esercizio, per tutte le serie previste (con riposo tra una
//               serie e l'altra, adattato al tipo di esercizio)
// - 'hold'    -> countdown in secondi (plank, riscaldamenti, blocchi cardio
//               a tempo), anche qui per più serie se previste
// - 'manual'  -> il dato non è affidabile per contare a voce (es. "max",
//               "20 metri", "10 esercizi a rotazione"): annuncia solo l'inizio,
//               il resto resta manuale con il pulsante "Fatto" come prima
//
// Interazione: se la modalità mani libere è attiva (VoiceInput disponibile e
// richiesto da chi chiama), durante reps/hold resta un ascolto continuo per
// pochi comandi: "pausa", "riprendi", "salta", "ripeti", "quante mancano".
const ExerciseAssist = (function () {
    let running = false;
    let paused = false;
    let timerId = null;
    let commandListener = null;
    let lastState = null;
    let lastSpokenText = '';

    const DEFAULT_TEMPO = 3; // secondi tra una ripetizione e la successiva

    // Ritmo stimato in base al tipo di movimento (euristica, migliorabile
    // esercizio per esercizio in futuro se il ritmo non convince)
    const TEMPO_KEYWORDS = [
        { match: ['squat', 'affondi', 'stacco', 'hip thrust', 'ponte', 'leg press', 'panca', 'military', 'shoulder', 'curl', 'trazioni', 'dip', 'push-up', 'piegamenti', 'rematore'], tempo: 3 },
        { match: ['polpacci', 'alzate', 'jumping jack'], tempo: 1.5 },
        { match: ['burpee', 'kettlebell', 'mountain climber'], tempo: 3.5 }
    ];

    function guessTempo(name) {
        const n = (name || '').toLowerCase();
        const found = TEMPO_KEYWORDS.find(t => t.match.some(k => n.includes(k)));
        return found ? found.tempo : DEFAULT_TEMPO;
    }

    // Riposo tra le serie adattato al tipo di esercizio (prima era fisso a
    // 20 secondi per tutti): i multiarticolari pesanti hanno bisogno di più
    // recupero, gli isolamenti/i movimenti veloci di meno, gli isometrici
    // ancora meno.
    const REST_KEYWORDS = [
        { match: ['squat', 'stacco', 'panca', 'military', 'trazioni', 'dip', 'affondi', 'hip thrust', 'rematore', 'leg press'], rest: 45 },
        { match: ['curl', 'alzate', 'polpacci', 'jumping jack', 'kettlebell', 'mountain climber', 'shoulder'], rest: 20 },
        { match: ['plank'], rest: 15 }
    ];
    const DEFAULT_REST = 30;

    function guessRest(name) {
        const n = (name || '').toLowerCase();
        const found = REST_KEYWORDS.find(t => t.match.some(k => n.includes(k)));
        return found ? found.rest : DEFAULT_REST;
    }

    // Casi con un dato numerico ambiguo o assente: meglio non "inventare"
    // un conteggio a voce che non corrisponde alla realtà.
    const MANUAL_HINTS = /metri|esercizi|lavoro|riposo|max/i;

    function analyze(exercise) {
        const setsStr = String(exercise.sets || '');
        const setsNum = parseInt(setsStr, 10);
        const rest = guessRest(exercise.name);

        if (exercise.type === 'time') {
            const minutes = parseFloat(setsStr);
            if (!isNaN(minutes) && minutes > 0) {
                return { mode: 'hold', seconds: Math.round(minutes * 60), sets: 1, rest };
            }
            return { mode: 'manual' };
        }

        const repsStr = String(exercise.reps || '');
        if (MANUAL_HINTS.test(repsStr)) return { mode: 'manual' };

        const secMatch = repsStr.match(/(\d+)\s*sec/i);
        if (secMatch) {
            return {
                mode: 'hold',
                seconds: parseInt(secMatch[1], 10),
                sets: (!isNaN(setsNum) && setsNum > 0) ? setsNum : 1,
                rest
            };
        }

        const numMatch = repsStr.match(/^(\d+)/);
        if (numMatch && !isNaN(setsNum) && setsNum > 0) {
            return {
                mode: 'reps',
                reps: parseInt(numMatch[1], 10),
                sets: setsNum,
                tempo: guessTempo(exercise.name),
                rest
            };
        }

        return { mode: 'manual' };
    }

    function pickMotivational(avatarId) {
        if (typeof getCoachMessage === 'function') return getCoachMessage(avatarId, 'motivation', '');
        return 'Forza, continua così!';
    }

    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // --- Frasi variate per fase, per non sembrare un metronomo che ripete
    // sempre le stesse identiche parole (migliora l'esperienza vs. v1) ---
    function startPhraseReps(setIndex, totalSets, reps) {
        return pickRandom([
            `Serie ${setIndex} di ${totalSets}. ${reps} ripetizioni. Pronti? Via!`,
            `Si comincia: serie ${setIndex} su ${totalSets}, ${reps} ripetizioni. Forza!`,
            `Serie ${setIndex} di ${totalSets}. Obiettivo ${reps} ripetizioni. Andiamo!`
        ]);
    }

    function startPhraseHold(setIndex, totalSets, seconds) {
        return pickRandom([
            `Serie ${setIndex} di ${totalSets}. Tieni per ${seconds} secondi. Via.`,
            `Si comincia: ${seconds} secondi, serie ${setIndex} di ${totalSets}. Resisti!`,
            `Serie ${setIndex} di ${totalSets}. ${seconds} secondi da tenere. Pronti, via.`
        ]);
    }

    function lastRepsPhrase() {
        return pickRandom(['Ultime, dai!', 'Ancora poche, non fermarti!', 'Ci siamo quasi, spingi!']);
    }

    function restStartPhrase(seconds) {
        return pickRandom([
            `Serie completata. Riposa ${seconds} secondi.`,
            `Ottimo. ${seconds} secondi di recupero e si riparte.`,
            `Fatto! Riposa ${seconds} secondi, poi si continua.`
        ]);
    }

    function restEndPhrase() {
        return pickRandom(['Si riparte!', 'Andiamo di nuovo!', 'Pronti per la prossima serie!']);
    }

    function completionPhrase() {
        return pickRandom(['Esercizio completato! Ottimo lavoro.', 'Fatto! Sei stato grande.', 'Esercizio finito, complimenti!']);
    }

    function remainingPhrase() {
        if (!lastState) return 'Non ho ancora iniziato a contare.';
        if (lastState.mode === 'reps') return `Ripetizione ${lastState.rep} di ${lastState.totalReps}, serie ${lastState.set} di ${lastState.totalSets}.`;
        if (lastState.mode === 'hold') return `Mancano ${lastState.remaining} secondi, serie ${lastState.set} di ${lastState.totalSets}.`;
        if (lastState.mode === 'rest') return `Riposo, mancano ${lastState.seconds} secondi.`;
        return 'Tutto secondo programma.';
    }

    // start: exercise = voce della scheda; avatarId = 'sara'/'marco';
    // opts.onUpdate(stato) per aggiornare la UI ad ogni tick;
    // opts.onComplete() quando l'esercizio (tutte le serie) è finito;
    // opts.handsFree: true per attivare l'ascolto dei comandi vocali durante
    // l'assistenza ("pausa", "riprendi", "salta", "ripeti", "quante mancano");
    // opts.announceCommandsHint: true per spiegare i comandi la prima volta.
    function start(exercise, avatarId, { onUpdate, onComplete, handsFree, announceCommandsHint } = {}) {
        stop(); // sicurezza: non due assistenze insieme

        const genderHint = avatarId === 'marco' ? 'male' : 'female';
        const say = (text, onEnd) => {
            lastSpokenText = text;
            if (typeof CoachVoice !== 'undefined') CoachVoice.speak(text, genderHint, onEnd);
            else if (onEnd) onEnd();
        };
        const update = (state) => {
            lastState = state;
            if (onUpdate) onUpdate(state);
        };

        const plan = analyze(exercise);

        if (plan.mode === 'manual') {
            say(`${exercise.name}. Fai con calma, segna "Fatto" quando hai finito.`);
            update({ mode: 'manual' });
            return; // nessun timer: resta l'uso manuale del pulsante come prima
        }

        running = true;
        paused = false;
        const totalSets = plan.sets || 1;

        // --- Comandi vocali durante l'assistenza (solo se richiesto e
        // disponibile: senza mic/permesso l'esercizio funziona lo stesso,
        // semplicemente senza questa parte) ---
        if (handsFree && typeof VoiceInput !== 'undefined' && VoiceInput.supported() && VoiceInput.listenContinuous) {
            commandListener = VoiceInput.listenContinuous({
                onResult: (transcript) => {
                    const cmd = typeof matchCommand === 'function' ? matchCommand(transcript) : null;
                    if (!cmd || !running) return;
                    if (cmd === 'pausa' && !paused) {
                        paused = true;
                        say('Ok, in pausa. Dì "riprendi" quando vuoi ripartire.');
                    } else if (cmd === 'riprendi' && paused) {
                        paused = false;
                        say(restEndPhrase());
                    } else if (cmd === 'ripeti') {
                        say(lastSpokenText || 'Non ho ancora detto nulla.');
                    } else if (cmd === 'stato') {
                        say(remainingPhrase());
                    } else if (cmd === 'salta') {
                        if (timerId) { clearTimeout(timerId); timerId = null; }
                        finishAll(true);
                    }
                },
                onError: () => { /* niente: si continua senza comandi vocali */ },
                onGiveUp: () => { commandListener = null; } // mic non disponibile: l'esercizio continua comunque, solo senza comandi vocali
            });
        }

        const hint = (handsFree && announceCommandsHint)
            ? ' Puoi dire "pausa", "salta", "ripeti" o "quante mancano" in qualsiasi momento.'
            : '';

        function finishAll(skipped) {
            running = false;
            if (commandListener) { commandListener.stop(); commandListener = null; }
            say(skipped ? 'Ok, passiamo al prossimo.' : completionPhrase());
            if (onComplete) onComplete();
        }

        function restThen(nextSetIndex) {
            let remaining = plan.rest;
            say(restStartPhrase(remaining) + (nextSetIndex === 2 ? hint : ''));
            update({ mode: 'rest', seconds: remaining, set: nextSetIndex, totalSets });
            const restTick = () => {
                if (!running) return;
                if (paused) { timerId = setTimeout(restTick, 500); return; }
                remaining--;
                update({ mode: 'rest', seconds: remaining, set: nextSetIndex, totalSets });
                if (remaining <= 0) { say(restEndPhrase()); runSet(nextSetIndex); return; }
                if (remaining <= 3) say(String(remaining));
                timerId = setTimeout(restTick, 1000);
            };
            timerId = setTimeout(restTick, 1000);
        }

        function runSet(setIndex) {
            if (plan.mode === 'hold') {
                let remaining = plan.seconds;
                update({ mode: 'hold', remaining, set: setIndex, totalSets });
                say(startPhraseHold(setIndex, totalSets, remaining) + (setIndex === 1 ? hint : ''));
                const holdTick = () => {
                    if (!running) return;
                    if (paused) { timerId = setTimeout(holdTick, 500); return; }
                    remaining--;
                    update({ mode: 'hold', remaining, set: setIndex, totalSets });
                    if (remaining === Math.floor(plan.seconds / 2) && remaining > 3) {
                        say(pickMotivational(avatarId));
                    }
                    if (remaining <= 0) {
                        if (setIndex >= totalSets) finishAll();
                        else restThen(setIndex + 1);
                        return;
                    }
                    if (remaining <= 3) say(String(remaining));
                    timerId = setTimeout(holdTick, 1000);
                };
                timerId = setTimeout(holdTick, 1000);
                return;
            }

            // mode === 'reps' — il ritmo è dato dalla voce stessa: si conta il
            // numero, e solo dopo che il coach ha finito di parlare si aspetta
            // il tempo di ritmo prima del colpo successivo (così non sfasa mai
            // rispetto a quello che l'utente sente davvero nelle cuffie).
            let rep = 0;
            update({ mode: 'reps', rep: 0, totalReps: plan.reps, set: setIndex, totalSets });
            say(startPhraseReps(setIndex, totalSets, plan.reps) + (setIndex === 1 ? hint : ''), () => {
                if (!running) return;
                timerId = setTimeout(beat, plan.tempo * 1000);
            });

            function beat() {
                if (!running) return;
                if (paused) { timerId = setTimeout(beat, 500); return; }
                rep++;
                const remaining = plan.reps - rep;
                let text;
                if (remaining === 2 && plan.reps > 4) {
                    text = lastRepsPhrase(); // avviso "ultime" poco prima della fine, non un numero
                } else {
                    const useMotivation = rep > 1 && remaining > 2 && Math.random() < 0.25;
                    text = useMotivation ? pickMotivational(avatarId) : String(rep);
                }
                update({ mode: 'reps', rep, totalReps: plan.reps, set: setIndex, totalSets });
                say(text, () => {
                    if (!running) return;
                    if (rep >= plan.reps) {
                        if (setIndex >= totalSets) finishAll();
                        else restThen(setIndex + 1);
                        return;
                    }
                    timerId = setTimeout(beat, plan.tempo * 1000);
                });
            }
        }

        runSet(1);
    }

    function stop() {
        running = false;
        paused = false;
        lastState = null;
        lastSpokenText = '';
        if (timerId) { clearTimeout(timerId); timerId = null; }
        if (commandListener) { commandListener.stop(); commandListener = null; }
        if (typeof CoachVoice !== 'undefined') CoachVoice.stopAll();
    }

    function isRunning() {
        return running;
    }

    function isPaused() {
        return paused;
    }

    return { start, stop, isRunning, isPaused, analyze };
})();
