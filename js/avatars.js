const avatars = {
    sara: {
        name: "Sara",
        image: "images/coach-female.jpg",
        style: "motivazionale",
        greetings: [
            "Ciao {nome}! Sono pronta a guidarti verso i tuoi obiettivi! 💪",
            "Bentornato {nome}! Oggi diamo il massimo insieme! ⭐",
            "Ehi {nome}! Ogni giorno è un'opportunità per migliorare! 🌟"
        ],
        workoutStart: [
            "Perfetto! Respira profondamente e dai il meglio di te!",
            "Ottimo! Ricorda: la costanza è la chiave del successo!",
            "Fantastico! Concentrati sulla tecnica, i risultati arriveranno!"
        ],
        workoutEnd: [
            "Complimenti {nome}! Hai dato tutto! Sono fiera di te! 🎉",
            "Bravissimo! Ogni allenamento ti avvicina al tuo obiettivo! ⭐",
            "Eccellente lavoro! Riposati bene, te lo sei meritato! 💖"
        ],
        motivation: [
            "Ce la puoi fare! Credici!",
            "Un passo alla volta, ci sei quasi!",
            "Sei più forte di quanto pensi!",
            "Continua così, stai andando alla grande!"
        ],
        progress: [
            "Guarda che progressi {nome}! Sono così orgogliosa! 📈",
            "Stai migliorando ogni giorno! Continua così! ⭐",
            "I tuoi sforzi stanno dando frutti! Avanti così! 🌟"
        ]
    },
    marco: {
        name: "Marco",
        image: "images/coach-male.jpg",
        style: "diretto",
        greetings: [
            "{nome}, è ora di lavorare sodo. Niente scuse! 💪",
            "Bentornato {nome}. Oggi si spacca! 🔥",
            "{nome}, pronti a superare i tuoi limiti? Andiamo! "
        ],
        workoutStart: [
            "Metti da parte le distrazioni. Concentrati solo sull'allenamento.",
            "Suda adesso, ringrazia dopo. Inizia!",
            "Niente pietà per te stesso. Dai dentro!"
        ],
        workoutEnd: [
            "Buon lavoro {nome}. Ma non fermarti qui, domani si ricomincia! 👊",
            "Ottimo. Ora recupera, ma non diventare molle! 🔥",
            "Hai fatto il tuo dovere. Bene. Ma si può sempre migliorare!"
        ],
        motivation: [
            "Niente scuse!",
            "Più duro, più forte!",
            "Non mollare!",
            "Spingi oltre!"
        ],
        progress: [
            "I numeri non mentono {nome}. Stai migliorando. Continua così! 📈",
            "Buoni progressi. Ma non accontentarti, puoi fare di meglio! ",
            "Vedi? Quando ti impegni, i risultati arrivano! 🔥"
        ]
    }
};

function getRandomMessage(avatarId, type) {
    const avatar = avatars[avatarId];
    const messages = avatar[type];
    return messages[Math.floor(Math.random() * messages.length)];
}

function personalizeMessage(message, userName) {
    return message.replace(/{nome}/g, userName);
}

function getCoachMessage(avatarId, type, userName = "") {
    const message = getRandomMessage(avatarId, type);
    return personalizeMessage(message, userName);
}