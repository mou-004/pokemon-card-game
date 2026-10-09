const API = 'https://pokeapi.co/api/v2';
const SUITS = ['fire', 'water', 'grass', 'electric'];
const SUIT_COLORS = { fire: '#ff765f', water: '#62b5ff', grass: '#b0e65d', electric: '#f3d655', wild: '#bd91ff' };
const PAGE_SIZE = 36;
const $ = (selector) => document.querySelector(selector);

const state = {
  pokemon: [],
  deck: [],
  hand: [],
  rivals: [],
  discard: [],
  currentSeat: 0,
  direction: 1,
  playerCount: 2,
  busy: false,
  active: false,
  drawn: false,
  needsCall: false,
  match: 1,
  cardSerial: 0,
  toastTimer: null,
  cpuTimer: null
};

async function fetchPokemon() {
  $('#loading-state').hidden = false;
  $('#error-state').hidden = true;
  $('#game-table').hidden = true;
  $('#turn-label').textContent = 'LOADING CARDS';
  try {
    const listResponse = await fetch(`${API}/pokemon?limit=${PAGE_SIZE}&offset=0`);
    if (!listResponse.ok) throw new Error('Card collection request failed');
    const list = await listResponse.json();
    state.pokemon = await Promise.all(list.results.map(async (pokemon) => {
      const response = await fetch(pokemon.url);
      if (!response.ok) throw new Error('Card artwork unavailable');
      return response.json();
    }));
    $('#loading-state').hidden = true;
    startGame();
  } catch (error) {
    console.error('Could not load the card collection:', error);
    $('#loading-state').hidden = true;
    $('#error-state').hidden = false;
    $('#turn-label').textContent = 'CONNECTION NEEDED';
  }
}

function shuffle(cards) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [cards[index], cards[other]] = [cards[other], cards[index]];
  }
  return cards;
}

function makeDeck() {
  const deck = [];
  const add = (color, value, action = '') => {
    const pokemon = state.pokemon[Math.floor(Math.random() * state.pokemon.length)];
    deck.push({ id: `card-${state.cardSerial++}`, color, value, action, pokemon });
  };

  for (const color of SUITS) {
    add(color, 0);
    for (let value = 1; value <= 9; value += 1) {
      add(color, value);
      add(color, value);
    }
    for (const action of ['skip', 'reverse', 'draw2']) {
      add(color, action, action);
      add(color, action, action);
    }
  }

  for (let index = 0; index < 4; index += 1) {
    add('wild', 'wild', 'wild');
    add('wild', 'wild4', 'wild4');
  }
  return shuffle(deck);
}

function startGame() {
  clearTimeout(state.cpuTimer);
  state.cardSerial = 0;
  state.deck = makeDeck();
  state.hand = [];
  state.rivals = Array.from({ length: state.playerCount - 1 }, (_, index) => ({
    seat: index + 1,
    name: `RIVAL ${index + 1}`,
    hand: []
  }));
  state.discard = [];
  state.currentSeat = 0;
  state.direction = 1;
  state.busy = false;
  state.active = true;
  state.drawn = false;
  state.needsCall = false;
  $('#match-number').textContent = String(state.match).padStart(3, '0');
  $('#seat-label').textContent = `${state.playerCount} SEATS`;
  $('#result-modal').hidden = true;
  $('#wild-picker').hidden = true;

  for (let count = 0; count < 7; count += 1) {
    state.hand.push(drawFromDeck());
    state.rivals.forEach((rival) => rival.hand.push(drawFromDeck()));
  }

  let firstCard = drawFromDeck();
  while (firstCard.action) {
    state.deck.unshift(firstCard);
    shuffle(state.deck);
    firstCard = drawFromDeck();
  }
  state.discard.push(firstCard);
  $('#game-table').hidden = false;
  $('#turn-label').textContent = 'YOUR TURN';
  setStatus('Your move — match the top card or draw.');
  render();
}

function drawFromDeck() {
  if (state.deck.length === 0 && state.discard.length > 1) {
    const topCard = state.discard.pop();
    state.deck = shuffle(state.discard);
    state.discard = [topCard];
  }
  if (state.deck.length === 0) state.deck = makeDeck();
  return state.deck.pop();
}

function imageOf(card) {
  return card?.pokemon?.sprites?.other?.['official-artwork']?.front_default || card?.pokemon?.sprites?.front_default || '';
}

function describeCard(card) {
  if (card.action === 'draw2') return `${card.color} draw two`;
  if (card.action === 'wild4') return 'wild draw four';
  if (card.action === 'skip') return `${card.color} skip`;
  if (card.action === 'reverse') return `${card.color} reverse`;
  if (card.action === 'wild') return `wild ${card.chosenColor}`;
  return `${card.color} ${card.value}`;
}

function cardFace(card, options = {}) {
  const isWild = card.color === 'wild';
  const symbol = card.action === 'skip' ? '⊘'
    : card.action === 'reverse' ? '⇄'
      : card.action === 'draw2' ? '+2'
        : card.action === 'wild4' ? '+4'
          : isWild ? '✦' : '';
  const inner = card.action
    ? `<div class="card-energy"><span class="card-special"><b>${symbol}</b><small>${card.action === 'draw2' ? 'DRAW TWO' : card.action === 'wild4' ? 'WILD FOUR' : card.action.toUpperCase()}</small></span></div>`
    : `<div class="card-energy">${imageOf(card) ? `<img src="${imageOf(card)}" alt="${card.pokemon.name}" loading="lazy" />` : ''}<span class="card-value">${card.value === 'wild' ? '✦' : card.value}</span></div>`;
  const wildMarker = isWild && card.chosenColor
    ? `<span class="wild-current" style="--suit:${SUIT_COLORS[card.chosenColor]}"></span>` : '';
  const name = card.pokemon ? ` ${card.pokemon.name}` : '';

  return `<button class="game-card ${options.className || ''}" data-card="${card.id}" data-color="${card.color}" aria-label="${card.color} ${card.value}${name}" style="--tilt:${options.tilt || '0deg'}" ${options.disabled ? 'disabled' : ''}>
    <span class="card-frame"></span><span class="card-corner">${symbol || card.value}</span>
    <span class="card-symbol">${card.pokemon ? card.pokemon.name.slice(0, 3).toUpperCase() : '★'}</span>
    ${inner}<span class="card-corner bottom">${symbol || card.value}</span>${wildMarker}
  </button>`;
}

function handForSeat(seat) {
  return seat === 0 ? state.hand : state.rivals[seat - 1].hand;
}

function isPlayable(card) {
  const topCard = state.discard[state.discard.length - 1];
  const activeColor = topCard.chosenColor || topCard.color;
  return card.color === 'wild' || card.color === activeColor || card.value === topCard.value;
}

function backCards(count) {
  return Array.from({ length: count }, (_, index) =>
    `<span class="back-card" style="--tilt:${(index - (count - 1) / 2) * 2}deg"></span>`
  ).join('');
}

function renderOpponents() {
  $('#opponent-hand').innerHTML = state.rivals.map((rival) => `
    <div class="rival-seat">
      <div class="player-badge rival-badge${state.currentSeat === rival.seat ? ' turn-active' : ''}">
        <span class="player-avatar rival-avatar">◈</span>
        <span><b>${rival.name}</b><small>${rival.hand.length} CARDS</small></span>
        <i></i>
      </div>
      <div class="opponent-cards" aria-label="${rival.hand.length} face-down cards">${backCards(rival.hand.length)}</div>
    </div>`).join('');
}

function render() {
  const isHumanTurn = state.currentSeat === 0;
  $('#player-count').textContent = state.hand.length;
  $('#deck-count').textContent = `${state.deck.length} LEFT`;
  $('#turn-label').textContent = !state.active ? 'MATCH COMPLETE'
    : state.busy ? `${state.rivals[state.currentSeat - 1]?.name || 'RIVAL'} TURN`
      : isHumanTurn ? 'YOUR TURN' : `${state.rivals[state.currentSeat - 1]?.name || 'RIVAL'} TURN`;
  renderOpponents();

  $('#player-hand').innerHTML = state.hand.map((card, index) => {
    const playable = isPlayable(card);
    const canPlay = isHumanTurn && !state.busy && state.active && $('#wild-picker').hidden && playable;
    const tilt = (index - (state.hand.length - 1) / 2) * 2.8;
    return cardFace(card, { className: playable ? 'playable' : 'unplayable', tilt: `${tilt}deg`, disabled: !canPlay });
  }).join('');

  const topCard = state.discard[state.discard.length - 1];
  $('#discard-pile').innerHTML = state.discard.slice(-4).map((card) => cardFace(card)).join('');
  $('#draw-pile').disabled = !isHumanTurn || state.busy || !state.active || !$('#wild-picker').hidden || state.drawn;
  $('#end-turn').hidden = !(isHumanTurn && state.drawn && state.active && !state.busy);
  $('#call-button').hidden = !(state.needsCall && isHumanTurn && state.active);
  $('#player-turn-dot').parentElement.classList.toggle('turn-active', isHumanTurn && !state.busy);
  if (topCard?.action === 'wild' || topCard?.action === 'wild4') {
    const dot = document.createElement('span');
    dot.className = 'wild-current';
    dot.style.setProperty('--suit', SUIT_COLORS[topCard.chosenColor] || SUIT_COLORS.wild);
    $('#discard-pile').append(dot);
  }
}

function setStatus(message) { $('#game-status').textContent = message; }

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => element.classList.remove('show'), 2200);
}

function drawIntoSeat(seat) {
  const card = drawFromDeck();
  handForSeat(seat).push(card);
  return card;
}

function drawCards(seat, amount) {
  const cards = [];
  for (let count = 0; count < amount; count += 1) {
    cards.push(drawIntoSeat(seat));
  }
  return cards;
}

function moveToSeat(seat) {
  const totalSeats = state.rivals.length + 1;
  state.currentSeat = (seat + totalSeats) % totalSeats;
}

function moveAheadFrom(seat, count = 1) {
  moveToSeat(seat + state.direction * count);
}

function playFromHand(cardId) {
  if (state.currentSeat !== 0 || state.busy || !state.active || !$('#wild-picker').hidden) return;
  if (state.needsCall) {
    drawCards(0, 2);
    state.needsCall = false;
    toast('Missed your call! Draw two cards.');
  }

  const index = state.hand.findIndex((card) => card.id === cardId);
  if (index < 0 || !isPlayable(state.hand[index])) return;
  const [card] = state.hand.splice(index, 1);
  state.drawn = false;
  state.discard.push(card);
  if (state.hand.length === 0) { finishGame(0); return; }
  state.needsCall = state.hand.length === 1;

  if (card.color === 'wild') {
    $('#wild-picker').hidden = false;
    renderWildOptions();
    setStatus('Choose an energy color to continue.');
    render();
    return;
  }
  resolvePlayedCard(card, 0);
}

function renderWildOptions() {
  $('#wild-options').innerHTML = SUITS.map((color) =>
    `<button aria-label="Choose ${color}" title="${color}" style="background:${SUIT_COLORS[color]}" data-suit="${color}"></button>`
  ).join('');
}

function resolvePlayedCard(card, actorSeat, chosenColor = '') {
  if (card.color === 'wild') card.chosenColor = chosenColor;
  $('#wild-picker').hidden = true;

  if (card.action === 'draw2' || card.action === 'wild4') {
    const targetSeat = (actorSeat + state.direction + state.rivals.length + 1) % (state.rivals.length + 1);
    const amount = card.action === 'draw2' ? 2 : 4;
    drawCards(targetSeat, amount);
    moveAheadFrom(actorSeat, 2);
    const targetName = targetSeat === 0 ? 'You' : state.rivals[targetSeat - 1].name;
    setStatus(`${targetName} draws ${amount}. The next player loses a turn.`);
  } else if (card.action === 'skip') {
    const skippedSeat = (actorSeat + state.direction + state.rivals.length + 1) % (state.rivals.length + 1);
    moveAheadFrom(actorSeat, 2);
    const skippedName = skippedSeat === 0 ? 'You' : state.rivals[skippedSeat - 1].name;
    setStatus(`${skippedName} is skipped.`);
  } else if (card.action === 'reverse') {
    state.direction *= -1;
    moveAheadFrom(actorSeat, state.rivals.length === 1 ? 2 : 1);
    setStatus(state.rivals.length === 1 ? 'Direction reversed — play again!' : 'Direction reversed!');
  } else if (!card.action) {
    moveAheadFrom(actorSeat);
    if (card.value !== 7) setStatus(`${actorSeat === 0 ? 'You' : state.rivals[actorSeat - 1].name} played ${describeCard(card)}.`);
  } else {
    moveAheadFrom(actorSeat);
    setStatus(`${actorSeat === 0 ? 'You' : state.rivals[actorSeat - 1].name} played ${describeCard(card)}.`);
  }

  if (actorSeat > 0 && handForSeat(actorSeat).length === 1) setStatus(`${state.rivals[actorSeat - 1].name} calls out — one card left!`);
  render();
  if (state.currentSeat !== 0) scheduleCPU();
}

function drawForPlayer() {
  if (state.currentSeat !== 0 || state.busy || !state.active || state.drawn || !$('#wild-picker').hidden) return;
  if (state.needsCall) {
    drawCards(0, 2);
    state.needsCall = false;
    toast('Missed your call! Draw two cards.');
  }
  const drawnCard = drawIntoSeat(0);
  state.drawn = true;
  setStatus(isPlayable(drawnCard) ? 'You drew a match! Play it or end your turn.' : 'No match — end your turn.');
  render();
}

function endPlayerTurn() {
  if (state.currentSeat !== 0 || state.busy || !state.drawn) return;
  state.drawn = false;
  moveAheadFrom(0);
  setStatus('Rivals are thinking…');
  render();
  if (state.currentSeat !== 0) scheduleCPU();
}

function scheduleCPU() {
  if (!state.active || state.currentSeat === 0 || state.busy) return;
  state.busy = true;
  render();
  state.cpuTimer = setTimeout(() => {
    if (!state.active || state.currentSeat === 0) { state.busy = false; render(); return; }
    const seat = state.currentSeat;
    const cpu = state.rivals[seat - 1];
    const playable = cpu.hand.filter(isPlayable);
    if (!playable.length) {
      const drawnCard = drawIntoSeat(seat);
      if (drawnCard && isPlayable(drawnCard)) {
        playCPUCard(drawnCard, seat);
      } else {
        state.busy = false;
        moveAheadFrom(seat);
        setStatus(`${cpu.name} draws and passes.`);
        render();
        if (state.currentSeat !== 0) scheduleCPU();
      }
      return;
    }
    playCPUCard(chooseCPUCard(playable, cpu.hand, cpu.hand.length <= 3, state.hand.length <= 2), seat);
  }, 720);
}

function chooseCPUCard(playable, hand, rivalHasFewCards, playerHasFewCards) {
  const counts = Object.fromEntries(SUITS.map((color) => [color, hand.filter((card) => card.color === color).length]));
  const score = (card) => {
    let value = card.color === 'wild' ? -3 : counts[card.color] * 4;
    if (card.action === 'draw2') value += playerHasFewCards ? 24 : 9;
    if (card.action === 'wild4') value += playerHasFewCards ? 21 : 7;
    if (card.action === 'skip' || card.action === 'reverse') value += playerHasFewCards ? 17 : 5;
    if (rivalHasFewCards && card.color === 'wild') value += 12;
    if (rivalHasFewCards && card.action) value += 8;
    return value + Math.random() * 2;
  };
  return playable.reduce((best, card) => score(card) > score(best) ? card : best, playable[0]);
}

function chooseCPUColor(hand) {
  const counts = Object.fromEntries(SUITS.map((color) => [color, hand.filter((card) => card.color === color).length]));
  return SUITS.reduce((best, color) => counts[color] > counts[best] ? color : best, SUITS[0]);
}

function playCPUCard(card, seat) {
  const cpu = state.rivals[seat - 1];
  const index = cpu.hand.findIndex((item) => item.id === card.id);
  if (index >= 0) cpu.hand.splice(index, 1);
  state.discard.push(card);
  if (cpu.hand.length === 0) { state.busy = false; finishGame(seat); return; }

  if (cpu.hand.length === 1) setStatus(`${cpu.name} calls out — one card left!`);
  const chosenColor = card.color === 'wild' ? chooseCPUColor(cpu.hand) : '';
  state.busy = false;
  resolvePlayedCard(card, seat, chosenColor);
}

function finishGame(winnerSeat) {
  state.active = false;
  state.busy = false;
  $('#turn-label').textContent = 'MATCH COMPLETE';
  const won = winnerSeat === 0;
  const winnerName = won ? 'You win!' : `${state.rivals[winnerSeat - 1].name} wins.`;
  $('#result-title').textContent = winnerName;
  $('#result-copy').textContent = won ? 'You played every card. That was a clean finish.' : 'Your rival emptied their hand first. Rematch and take the win.';
  $('#result-spark').textContent = won ? '✦' : '◈';
  $('#result-spark').style.color = won ? 'var(--lime)' : 'var(--coral)';
  $('#result-modal').hidden = false;
  render();
}

$('#player-hand').addEventListener('click', (event) => {
  const card = event.target.closest('[data-card]');
  if (card && !card.disabled) playFromHand(card.dataset.card);
});
$('#draw-pile').addEventListener('click', drawForPlayer);
$('#end-turn').addEventListener('click', endPlayerTurn);
$('#call-button').addEventListener('click', () => {
  if (!state.needsCall) return;
  state.needsCall = false;
  setStatus('Call out! One card left — make it count.');
  render();
});
$('#wild-options').addEventListener('click', (event) => {
  const option = event.target.closest('[data-suit]');
  if (!option) return;
  const card = state.discard[state.discard.length - 1];
  resolvePlayedCard(card, 0, option.dataset.suit);
});
$('#new-game').addEventListener('click', () => {
  if (!state.pokemon.length) return;
  state.match += 1;
  startGame();
});
$('#play-again').addEventListener('click', () => { state.match += 1; startGame(); });
$('#retry').addEventListener('click', fetchPokemon);
document.querySelectorAll('[data-player-count]').forEach((button) => {
  button.addEventListener('click', () => {
    const count = Number(button.dataset.playerCount);
    if (count === state.playerCount) return;
    state.playerCount = count;
    document.querySelectorAll('[data-player-count]').forEach((option) => {
      const selected = Number(option.dataset.playerCount) === count;
      option.classList.toggle('selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    });
    if (state.pokemon.length) {
      state.match += 1;
      startGame();
    }
  });
});

fetchPokemon();
