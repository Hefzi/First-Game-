# Legion Logic

An original Android crowd-runner about mental maths. You lead a legion down one endless road. Drag left or right to choose maths gates (`+`, `−`, `×`, `÷`), hold the line against an almost continuous horde, and decide when to break bonus walls in the side lane.

## Rules

- **One endless road.** A level is only a distance marker (every 400 units). Nothing on the road marks it: no end line, no end-of-level boss, and no speed jump, because speed rises smoothly with distance. The only signs are the **level badge at top right**, which counts up with a pop, and a short "LEVEL N" on screen.
- **Hold the line.** The horde comes in zones, an almost continuous red stream. When a zone charges, your legion **stands its ground** and shoots. It marches on only when no enemy in front is still alive. Your crowd fights about half the time or more (47–60%).
- **Gates on the march** between zones: `+`, `−`, `×`, `÷`. Behind a divider you are locked into a split path, so work out the whole path first.
- **Bonus lane** on the right: blue `+1` tiles are free as you pass them. Yellow pockets sit behind a wall. Hug the right edge of the road to shoot the wall, but **while you do, your legion does not shoot the horde**. A wall still standing when you pass it loses its pocket.
- **Legion cap:** your crowd cannot grow past 2× the level's target size (the count turns gold and shows `MAX`). At the cap, a bigger `+` or a `×` is wasted, so read the gates with the cap in mind.
- **No game over.** If your crowd falls to 0, the current level restarts. It restarts with the crowd you had when the level began, but never less than the level's floor, so a restart is never a dead end.
- **Score** = distance + enemies shot. It banks at each level marker and rolls back to that value on a restart. **Best score** is saved on the device. You can reset it from the main menu (with a confirm step).
- **Pause menu:** *Resume*, *Restart from level 1*, and *Quit to menu*. Restart and Quit both save your score to the best score. Quit also saves your run, so the main menu shows *Continue — level N*.
- The Android back button pauses the game. On the main menu, it quits the app.

## How the horde works

- Each zone is built for the level's **target crowd** (10 at level 1, +4 per level), not for your actual crowd. So a bigger legion clears zones faster and marches sooner, and your gate choices pay off in progress.
- Zone strength rises from 0.6× to 1.9× the target's firepower by level 14, with a wave peak at 1.6× that in the middle of each zone. Late peaks bleed even a full legion, so the crowd usually sits below the cap and every `+` counts.
- An enemy that reaches you kills 0.3 soldiers at level 1, rising to 0.7. Below 1, the cliff is softer: losing a few soldiers does not snowball into an instant wipe-out.
- Every 3rd level has a boss inside one zone.
- **Every level is checked before you see it.** The generator plays it as a careful player starting from the retry floor. If that player cannot win, the level is built again. Tests confirm this at full speed for levels 1–60.

## Difficulty curve (measured, not guessed)

Measured with the game's own careful-player logic on the real simulation (20 runs per level for the mistake columns). A "mistake" means picking the worse side of a choice.

| Levels | March speed | Enemy speed | Level time | Fighting | Crowd / cap at level start | Clear with 1 mistake | 2 mistakes |
|---|---|---|---|---|---|---|---|
| 1–3 | 21–23 | 17–18 | 34 s | 47% | 3/20 .. 28/36 | 100% | 100% |
| 4–6 | 24–25 | 19–20 | 32 s | 50% | 29/44 .. 52/60 | 100% | 100% |
| 7–10 | 26–29 | 21–23 | 29 s | 51% | 60/68 .. 84/92 | 93% | 69% |
| 11–15 | 30–33 | 24–27 | 29 s | 56% | 92/100 .. 124/132 | 59% | 32% |
| 16–20 | 34–38 | 28–30 | 25 s | 57% | 108/140 .. 164/172 | 91% | 82% |
| 21–30 | 39–45 | 31–36 | 23 s | 60% | 172/180 .. 244/252 | 77% | 45% |
| 31–40 | 45 | 36 | 22 s | 59% | 252/260 .. 214/332 | 84% | 53% |

A careful player marches from level 1 to 40 in about 18 minutes, with 3 restarts.

Known limits: the curve is not smooth. Levels 11–15 are the hardest band, and 16–20 is easier again. Level 1 opens with a short quiet march (no horde), so a crowd of 3 can grow first.

## Project layout

```
app/src/main/assets/www/logic.js   game rules: world generator, horde, bonus lane, simulation, scoring (pure JS, no DOM)
app/src/main/assets/www/main.js    rendering, input, menus, saving
app/src/main/assets/www/index.html page and menu layout
app/src/main/java/.../MainActivity.java  Android WebView host (back button, pause on app switch, quit)
test/logic.test.js                 tests: winnable from floor 1-60, continuous march, hold the line, bonus lane, cap, score
```

## Run and test

- Play in a browser: open `app/src/main/assets/www/index.html`. On desktop, use the arrow keys or drag with the mouse.
- Tests: `node --test test/logic.test.js`
- APK: every push runs `.github/workflows/android.yml`. It runs the tests, builds `app-debug.apk`, and uploads it as the `legion-logic-debug-apk` artifact. On your phone, download that artifact, unzip it, and install the APK (allow "install unknown apps").
- Local build: open the folder in Android Studio, or run `./gradlew assembleDebug` with the Android SDK installed.
