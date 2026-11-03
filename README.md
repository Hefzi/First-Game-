# Legion Logic

An original Android crowd-runner about mental maths. You lead a legion down one endless road. Drag left or right to choose maths gates (`+`, `−`, `×`, `÷`). Your legion shoots at enemy squads, walls, and bosses. To win, you need a big enough legion when you reach them.

## Rules

- **Level** = a fixed distance of 600 units. Each level has the same route on every retry, so you can learn it.
- **No game over.** If an enemy reaches you and your legion falls to 0, or you reach a wall or boss before it breaks, the level starts again.
- **Score** = points banked at the start of the level + distance in this level. When you clear a level, you also bank the soldiers you have left. A hit rolls the score back to the banked value.
- **Best score** is saved on the device. You can reset it from the main menu (with a confirm step).
- **Pause menu:** *Resume*, *Restart from level 1*, and *Quit to menu*. Restart and Quit both save your score to the best score. Quit also saves your run, so the main menu shows *Continue — level N*.
- The Android back button pauses the game. On the main menu, it quits the app.

## Why you must think, not only react

All four gate operations only ever raise or lower the count. If you can choose freely at each gate, "take the bigger result now" is always best. So the game adds **split paths**: a divider locks your side for 2–4 gates in a row. You must work out the whole path, for example `×3 then −12` against `+4 then ×2`. From level 5 on, many split paths are traps: the first gate that looks better leads to the worse path.

## Difficulty curve (measured, not guessed)

The generator follows every possible choice sequence in a level. It then sets the guardian's HP so that only a target share of sequences gets through: 60% at level 1, falling by 10% per level to a 5% floor. Every 5th level + 1 is a little easier, to give the player a rest.

Measured with `node` bots, 200 random runs per level:

| Levels | Speed (units/s) | Split-path length | Random-choice clear rate | "Bigger number now" bot fails |
|---|---|---|---|---|
| 1–3 | 14–15 | none | 52% | 0 of 3 |
| 4–6 | 16–17 | 2 | 19% | 1 of 3 |
| 7–10 | 18–19 | 2–3 | 16% | 4 of 4 |
| 11–15 | 20–22 | 3–4 | 20% | 3 of 5 |
| 16–20 | 23–25 | 4 | 14% | 3 of 5 |
| 21–30 | 26–30 | 4 | 13% | 7 of 10 |
| 31–40 | 30 | 4 | 13% | 6 of 10 |

Known limit: from level 7 on, the random clear rate stays near 13–20%. It does not reach the 5% target, because long split paths leave only 2–4 decisions per level. In those levels, speed, longer paths, and plain gate colours (from level 4) make the game harder.

Other changes per level: enemy squads move faster and kill a larger share of your legion (15% → 60%), `−` gates start at level 2, `÷` gates start at level 4, and every 3rd level ends with a boss.

## Project layout

```
app/src/main/assets/www/logic.js   game rules: level generator, simulation, scoring (pure JS, no DOM)
app/src/main/assets/www/main.js    rendering, input, menus, saving
app/src/main/assets/www/index.html page and menu layout
app/src/main/java/.../MainActivity.java  Android WebView host (back button, pause on app switch, quit)
test/logic.test.js                 tests: same route per level, solver clears levels 1-40, greedy fails, score rules
```

## Run and test

- Play in a browser: open `app/src/main/assets/www/index.html`. On desktop, use the arrow keys or drag with the mouse.
- Tests: `node --test test/`
- APK: every push runs `.github/workflows/android.yml`. It runs the tests, builds `app-debug.apk`, and uploads it as the `legion-logic-debug-apk` artifact. On your phone, download that artifact, unzip it, and install the APK (allow "install unknown apps").
- Local build: open the folder in Android Studio, or run `./gradlew assembleDebug` with the Android SDK installed.
