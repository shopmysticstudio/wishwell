# Chooser simulation

Five fake people (cozy homebody, outdoorsy, artsy, gamer, practical) each judge ideas by a
hidden taste the app never sees. They circle what they like, cut what they dislike, mark a
few as Have it, rank their circles after round 2, and press More ideas six times.

    npm i --no-save jsdom
    node scripts/chooser-sim/run.cjs ../app/index.html 30 quiz    # they answer the quiz
    node scripts/chooser-sim/run.cjs ../app/index.html 30 blank   # no quiz, learning only

Each column is one batch of 8: how many they would circle, and how many categories it had.

Results on Nov 27, 2026 (30 runs each, average of all five people):

| Batch            | 1   | 2   | 3   | 4   | 5   | 6   |
|------------------|-----|-----|-----|-----|-----|-----|
| Old, with quiz   | 4.2 | 3.6 | 3.1 | 3.1 | 3.1 | 3.1 |
| New, with quiz   | 4.0 | 5.0 | 6.0 | 5.6 | 5.4 | 5.5 |
| Old, no quiz     | 1.4 | 1.4 | 1.4 | 1.3 | 1.2 | 1.3 |
| New, no quiz     | 1.4 | 3.1 | 4.7 | 5.1 | 5.3 | 5.4 |

"Old" is the version 2 chooser on the same bigger idea list.
