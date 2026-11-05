# Legion Logic

An original Android crowd-battle game about timing and mental maths. Your legion stands its ground at the bottom of a three-lane road while a red carpet of enemies pushes in. Drag left to grow, drag right to break a wall and pick the right maths tiles, and beat the boss at the end of every wave.

## Rules

- **Your legion stands still** at the bottom of the screen. Drag left or right to move it between three lanes. It shoots the nearest enemy by itself.
- **Centre: the horde.** A red carpet of enemies creeps toward you in ranks, and a dense rank pushes right into your legion. Shots work better up close. When the carpet touches, your soldiers also fight hand to hand, and you only lose soldiers when more enemies arrive than you can cut down.
- **Left lane: the blue belt.** Blue `+` tiles slide toward you. Stand in the lane to collect them. You still shoot the horde from there.
- **Right lane: the wall and the maths tiles.** A stone wall with HP guards a column of yellow maths tiles (`+`, `×`, `−`, `÷`). Stand in the lane to shoot the wall, but **while you do, you do not shoot the horde.** Once the wall breaks, the tiles slide down. Stand in the lane to take a tile, or step out to dodge it. Work out each one before it arrives. Tile colours stop giving hints at level 4.
- **Boss.** Each wave ends with a boss that walks in behind its carpet, alone. Kill it before it reaches your legion. If it reaches you, the level restarts.
- **Level = one wave.** When the boss dies, the level badge at top right counts up. The next wave's carpet is already marching in right behind it, so there is no break. A new wave brings a new wall: a wall you did not break is lost.
- **Legion cap:** your crowd cannot grow past 1.5× the level's target size (the count turns gold and shows `MAX`). At the cap, a `+` or `×` tile is wasted.
- **No game over.** If your legion falls to 0, or a boss reaches it, the level restarts with a full legion.
- **Score** = enemies shot. It banks at each level and rolls back to that value on a restart. **Best score** is saved on the device. You can reset it from the main menu (with a confirm step).
- **Pause menu:** *Resume*, *Restart from level 1*, and *Quit to menu*. Restart and Quit both save your score to the best score. Quit also saves your run, so the main menu shows *Continue — level N*.
- The Android back button pauses the game. On the main menu, it quits the app.

## How a wave works

- Each wave is built for the level's **target crowd** (12 at level 1, +4 per level), not for your actual crowd. A bigger legion holds the carpet further away and loses fewer soldiers.
- Enemy arrival rises from 1.3× to 1.9× the target's firepower. Each carpet has four ranks: a lighter front, an even middle, a dense crush (1.4×), and an even rear.
- An enemy that gets through kills 0.3 soldiers at level 1, rising to 0.7.
- The wall's HP and the boss's HP grow with the level. The boss's HP is sized so that a full legion can kill it in the time it needs to walk in.
- The math column has 4 to 8 tiles. Good tiles (`+`, `×`) are 75% of them at first, falling to 45%.

## Measured, not guessed

Measured with the game's own careful-player logic on the real simulation. The careful player fights from the left lane, breaks the wall only while the horde is far away, and takes only tiles that help:

| Level | 1 | 3 | 5 | 10 | 13 | 20 | 30 | 40 |
|---|---|---|---|---|---|---|---|---|
| Carpet pressing the legion (share of the wave) | 8% | 7% | 19% | 27% | 32% | 35% | 37% | 38% |
| Wave time | 29 s | 29 s | 29 s | 29 s | 29 s | 29 s | 30 s | 32 s |
| Player who takes **every** maths tile | wins | wins | **loses** | **loses** | **loses** | **loses** | **loses** | wins |

The careful player beats levels 1 to 40 in one continuous game (about 18 minutes) with no restarts. Every level from 1 to 60 is winnable from a restart, and the tests check this.

Known limit: from a full legion, a careful player almost never bleeds. The danger comes from mistakes: a bad maths tile, breaking the wall while a dense rank comes in, or falling below the cap just before a boss.

## Project layout

```
app/src/main/assets/www/logic.js   game rules: waves, carpet, lanes, boss, simulation, scoring (pure JS, no DOM)
app/src/main/assets/www/main.js    rendering, input, menus, saving
app/src/main/assets/www/index.html page and menu layout
app/src/main/java/.../MainActivity.java  Android WebView host (back button, pause on app switch, quit)
test/logic.test.js                 tests: winnable 1-60, continuous waves, pressing, lanes, maths tiles, boss, cap, score
```

## Run and test

- Play in a browser: open `app/src/main/assets/www/index.html`. On desktop, use the arrow keys or drag with the mouse.
- Tests: `node --test test/logic.test.js`
- APK: every push runs `.github/workflows/android.yml`. It runs the tests, builds `app-debug.apk`, and uploads it as the `legion-logic-debug-apk` artifact. On your phone, download that artifact, unzip it, and install the APK (allow "install unknown apps").
- Local build: open the folder in Android Studio, or run `./gradlew assembleDebug` with the Android SDK installed.
