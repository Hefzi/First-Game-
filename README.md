# Legion Logic

An original Android crowd-runner about mental maths. You lead a legion down one endless road. Drag left or right to choose maths gates (`+`, `−`, `×`, `÷`). Your legion shoots at enemy squads, walls, and bosses. To win, you need a big enough legion when you reach them.

## Rules

- **One continuous march.** A level is a fixed distance of 800 units. At the level line nothing stops: the same crowd keeps marching in the same lane, the next level's route is already on the road, and the **level badge at top right** counts up.
- **Always a fight.** Each level is a chain of about 10 enemy squads, then a guardian (a wall, or a boss on every 3rd level). Each squad fight holds one gate choice, so you choose gates while you shoot. Your crowd fights 56–69% of the time.
- **No game over.** If your crowd falls to 0, or you reach a wall or boss before it breaks, the current level starts again with the crowd you had at its start.
- **Score** = points banked at the start of the level + distance in this level. When you clear a level, you also bank the soldiers you have left. A hit rolls the score back to the banked value.
- **Best score** is saved on the device. You can reset it from the main menu (with a confirm step).
- **Pause menu:** *Resume*, *Restart from level 1*, and *Quit to menu*. Restart and Quit both save your score to the best score. Quit also saves your run (level and crowd), so the main menu shows *Continue — level N*.
- The Android back button pauses the game. On the main menu, it quits the app.

## How the fights work

- A squad sizes itself when it wakes, from your real crowd. It is sized so that the **better side** of that fight's gate choice loses a set share of the crowd: 10% at level 1, rising to 40%. The wrong side loses more, because fewer soldiers shoot for the rest of the fight.
- **Bite:** an enemy that reaches you kills 0.3 soldiers at level 1, rising to 1 soldier at level 19. So early mistakes cost only part of their full price.
- Gate values scale with your crowd: `+` adds up to 50%, and `−` takes up to 23% at level 1 and 50% from level 10. `×` is not offered above 1.5× the level's target crowd (16 at level 1, +4 per level), so numbers stay readable. `÷` starts at level 4 as `÷2`, and `÷3` comes at level 8.
- Below 3 soldiers, reinforcements join at the level line.

## Why you must think, not only react

All four operations only raise or lower the count, so with free choices "take the bigger number now" is often right. The game adds **split paths**: a divider locks your side for 2–4 gates. You must work out the whole path, for example `×3 then −12` against `+4 then ×2`, and the order matters because the gates land during the fight. From level 5 on, many split paths are traps: the first gate that looks better leads to the worse path. Gate colours stop giving hints at level 4.

## Difficulty curve (measured, not guessed)

Measured with `node` bots on the real simulation, along the solver's own march (60 runs per level for the mistake columns):

| Levels | Speed (units/s) | Level time | Fights / level | Time under fire | Clear with 1 mistake | 2 mistakes | 3 mistakes |
|---|---|---|---|---|---|---|---|
| 1–3 | 18–20 | 42 s | 10 | 69% | 100% | 89% | 73% |
| 4–6 | 21–22 | 38 s | 10 | 69% | 58% | 25% | 11% |
| 7–10 | 23–25 | 33 s | 10 | 67% | 40% | 17% | 5% |
| 11–15 | 26–29 | 29 s | 9.6 | 64% | 23% | 5% | 0% |
| 16–20 | 30–33 | 25 s | 9.6 | 65% | 23% | 5% | 2% |
| 21–30 | 34–39 | 21 s | 9.1 | 62% | 31% | 9% | 2% |
| 31–40 | 39 | 21 s | 9.0 | 60% | 30% | 10% | 4% |

Known limit: from level 21 on, the bot curve stops falling (about 30% with one mistake). There, the top speed (39 units/s, about 2 s per choice) makes the game harder for a human, and bots do not feel speed.

The guardian at the end of each level also checks the whole level. Its HP is set so that only a share of all choice sequences passes: 60% at level 1, falling 10% per level to a 5% floor. Every 5th level + 1 is a little easier, to give the player a rest.

## Project layout

```
app/src/main/assets/www/logic.js   game rules: level generator, simulation, scoring (pure JS, no DOM)
app/src/main/assets/www/main.js    rendering, input, menus, saving
app/src/main/assets/www/index.html page and menu layout
app/src/main/java/.../MainActivity.java  Android WebView host (back button, pause on app switch, quit)
test/logic.test.js                 tests: continuous march 1-40, choices under fire, fight time, forgiveness, score rules
```

## Run and test

- Play in a browser: open `app/src/main/assets/www/index.html`. On desktop, use the arrow keys or drag with the mouse.
- Tests: `node --test test/logic.test.js`
- APK: every push runs `.github/workflows/android.yml`. It runs the tests, builds `app-debug.apk`, and uploads it as the `legion-logic-debug-apk` artifact. On your phone, download that artifact, unzip it, and install the APK (allow "install unknown apps").
- Local build: open the folder in Android Studio, or run `./gradlew assembleDebug` with the Android SDK installed.
