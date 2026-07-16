# LEGATO

LEGATO is an interactive AI music tutor for pianists. Build exact chord voicings, connect them with a harmonic technique, see and hear the compiled result, then ask why the transition works.

## Run locally

Requires Node.js 20+.

```bash
npm start
```

Open `http://localhost:8000`. The app loads VexFlow, Tone.js, and Salamander piano samples from CDNs, so notation/audio need an internet connection on first load.

For AI coaching, set the server-only environment variable before starting:

```bash
export OPENAI_API_KEY="your-key"
export OPENAI_MODEL="gpt-5.6" # optional default
npm start
```

Never put the key in client code. `server.mjs` serves the local API route; `api/coach.js` is also compatible with a Vercel serverless deployment.

## Architecture

The UI mutates one `progression`. Pure `compile()` turns it into atomic segments with exact pitches and timing. VexFlow notation, Tone.js playback, highlighting, and coach grounding all consume that same segment list. User MIDI voicings are never altered; generated technique material alone uses closest-voicing search.

Key areas: `js/state.js` (runtime contract), `js/engine/` (techniques, voice leading, rhythm), `js/notation/`, `js/audio/`, `js/ui/`, and `api/coach.js`.

## Test

```bash
npm test
```

Tests cover seam preservation, validation, all eight registry techniques, user-voicing integrity, generated-register choice, run beat caps, measure-relative timing, and tempo independence.
