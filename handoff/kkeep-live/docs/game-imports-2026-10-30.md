# October 30 game imports

Five entries use the existing isolated SavedGamePlayer and Profile revision/conflict handling. Home shortcuts and ad configuration are unchanged. Cards expose only covers and names.

| Game | Supplied source | Progress storage |
| --- | --- | --- |
| Pixel Gun Zombie | `https://truffled.lol/games/pixl/index.html` | Unity PlayerPrefs/IDBFS; periodic filesystem flush |
| Knife Hit | `https://truffled.lol/games/knifehit/index.html` | Construct localforage, including KnifeHit-BestScore, KnifeHit-BestStage and KnifeHit-Apples |
| Jetpack Joyride | `https://truffled.lol/games/jetpackjoyride/index.html` | Native localStorage `data` (coins, best score and settings) |
| Angry Birds Online | `https://truffled.lol/gamefile/angrybirdsonline.html` | Ruffle SharedObject storage captured by the isolated save runtime |
| Amaze | `https://truffled.lol/games/amaze/index.html` | Local Playables adapter `kkeep.amaze.save.v1`, preserving the three mode levels |

The four uploaded HTML files were external iframe launchers. Local entry pages load the actual engines, retaining embedded game credits and third-party license notices. Truffled's injected advertising/telemetry scripts are omitted. No Google AdSense code was added.

Angry Birds' original SWF is stored locally from `https://cdn.jsdelivr.net/gh/greeniYT/y@main/angrybirds-3.1/main.swf`. Its player uses pinned Ruffle 0.7.1. Amaze's main bundle is stored locally with its touch-device rendering scale reduced from 1.5 to 1. Other game engine and asset requests use the existing allowlisted game resource gateway.

Pixel Gun gets a touch-only movement stick, look gestures, fire, jump, reload, weapon keys and pause, using the existing independent-input helper. The other games retain native controls. Shared gesture prevention leaves editable inputs usable. Progress means the game's own saved checkpoints, scores, unlocks and settings; it does not serialize every running frame.

Covers: Knife Hit and Angry Birds use game icons from their supplied sources; Jetpack Joyride uses Halfbrick's App Store icon; Amaze uses its icon from MEmu's game listing; Pixel Gun uses artwork from the LDPlayer Pixel Gun listing. Cover URLs were downloaded and validated as images.

Validation: TypeScript, JS syntax checks, game-save API/second-device restoration tests, independent multi-touch tests, and Amaze adapter mode preservation/pause tests passed. Required upstream engine files responded HTTP 200. Browser/iPad gameplay verification was unavailable because the managed browser could not start.
