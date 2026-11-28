# Wishwell test model (ml/)

A first test of learning which shown ideas people keep, from the anonymous round log in the D1
database `wishwell-ideas`. Nothing in the app or the Worker uses it yet.

## Files

- `train.py`: builds the labels and features, runs the evaluation, and saves the model.
- `export_rules.mjs`: copies the app's rule-score inputs out of `app/index.html` into `rules.json`,
  so the baseline scores ideas the same way the app does. Rerun it after changing those rules:
  `node ml/export_rules.mjs` from the repo root.
- `model.json`: the logistic model (feature names, scaling, weights). Plain JSON, so the Worker or
  the app could score with it later without Python.
- `model_boosted.joblib`: the small gradient-boosted model (scikit-learn).
- `report.json`: the numbers from the last run.

No round data is kept in the repo, because the repo is public. The model files hold only weights and
tree splits. Idea popularity is a feature, but it is not stored: at scoring time it would come from
the live idea pool.

## Labels

- kept = 1, starred on the Rank list ("top") = 1 with double weight, cut = 0.
- "have" (they already own it) is left out, since it says nothing about taste.
- Ideas nobody touched, and lists where nothing was touched (like the 52 starter test rounds), are
  left out. Test runs (`"dry": true`) are never logged, so they never reach the data.
- Lists that are copies of another list are dropped, and lists with the same quiz answers count as
  one person. The evaluation holds out one person at a time, so a person's own picks never help
  score that person.

## Run it

Needs Python 3 with `scikit-learn` and `numpy` (`python3 -m pip install scikit-learn numpy`).

Export two files with the D1 console or `wrangler d1 execute wishwell-ideas --remote`, and keep them
outside the repo:

```sql
-- profiles.txt (one line per list)
SELECT DISTINCT substr(list_id,1,4)||'|'||for_who||'|'||age||'|'||lean||'|'||style||'|'||budget||'|'||ints||'|'||quiz||'|'||has_details
FROM rounds WHERE list_id IN (SELECT DISTINCT list_id FROM round_ideas WHERE outcome!='none');

-- rows.txt (one line per touched idea)
SELECT substr(list_id,1,4)||'|'||round||'|'||pos||'|'||category||'|'||substr(src,1,1)||'|'||lo||'|'||hi||'|'||substr(outcome,1,1)||'|'||title
FROM round_ideas WHERE outcome!='none' ORDER BY list_id, round, pos;
```

Then:

```
python3 ml/train.py --rows ../data/rows.txt --profiles ../data/profiles.txt
```

## First run (Nov 28, 2026)

276 labeled ideas from 7 people (2 of them made 80% of the rows).

| method | AUC | top-3 hit rate |
|---|---|---|
| random | 0.51 | 0.48 |
| display order | 0.58 | 0.62 |
| current rules | 0.63 | 0.59 |
| logistic | 0.59 | 0.51 |
| boosted | 0.44 | 0.56 |

Neither model beats the current order or rules yet. The learning curve was still flat at about 220
training rows. Worth retrying at roughly 1,500 or more labeled ideas from 50 or more different people.
