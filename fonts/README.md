# Self-hosted display fonts

These fonts render the "playful" spots called out in the design system —
project title and chord symbols — in two visual modes selected per project:

- **JazzText mode** — `MuseJazzText.otf`. MuseScore's hand-lettered jazz
  chord-symbol text font. Loaded as `MuseJazz Text` in CSS.
- **Classical mode** — `Edwin-*.otf`. MuseScore 4's default engraver text
  font (Century-Schoolbook lineage). All four weights (Roman, Bold, Italic,
  BoldItalic) ship as a single `Edwin` family so callers can pick any
  weight/style. Chord symbols currently render in Bold (700 upright).

Both are SIL Open Font License 1.1; the two license files
(`MuseJazz-OFL.txt`, `Edwin-LICENSE.txt`) ship next to the font files as
required by OFL §5. Source: https://github.com/musescore/MuseScore

If a design ever wants a chord font other than Edwin/MuseJazzText (e.g.,
MuseJazz notation, or another engraver text font), re-download from the
MuseScore repo's `fonts/` directory.
