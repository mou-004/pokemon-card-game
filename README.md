PokéMatch

A Pokémon-themed, turn-based color-and-number shedding card game for one player against CPU rivals.

## Run

Open `index.html` in a browser or serve this folder with a static file server. No package installation or API key is needed. An internet connection is required to load the card art.

## Play

Choose a 2- or 4-seat match. Play a card that matches the discard by energy color or number, or draw from the deck. Action cards skip or penalize the next seat; wild cards let you choose the next energy. CPU rivals save action cards for the right moment and choose wild colors to fit their hands. Call out when you have one card left. First player to empty their hand wins.

This is a fan-made game prototype with original card styling and simplified two-player rules.

## CPU strategy

The CPU uses a lightweight weighted heuristic. It does not learn from previous matches or search every possible future turn. It scores its playable cards, then plays the card with the highest score. A small random bonus keeps its choices from feeling identical every round.

- **Keep a strong color:** a card gets 4 points for each other card of that color in the CPU's hand.
- **Use action cards to stop a near-win:** Draw 2 gets 24 points, Wild 4 gets 21, and Skip or Reverse gets 17 when the human player has two or fewer cards. Otherwise those cards get 9, 7, and 5 points.
- **Protect a nearly empty hand:** when the CPU has three or fewer cards, a Wild gets 12 extra points and any action card gets 8 extra points.
- **Choose useful wild colors:** the CPU picks the color it has most often in its remaining hand. Ties follow the suit order in the code.
- **When no card fits:** it draws one card, plays it if it matches, or ends its turn.

This makes the CPU reactive and understandable, while leaving room to improve its strategy later.
