import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, makeChord, makeProgression } from '../js/state.js';
import { TECHNIQUES } from '../js/engine/techniques.js';

const settings={tempo:100,timeSig:{num:4,den:4},key:0,clef:'auto'};
test('all eight techniques compile inside their beat budget without re-voicing anchors', () => {
  for(const id of Object.keys(TECHNIQUES)){
    const from=makeChord([72,76,79],1,{rootMidi:72,quality:'Major'}), to=makeChord([36,40,43],1,{rootMidi:36,quality:'Major'});
    const segments=compile(makeProgression({settings,chords:[from,to],seams:[id]}));
    assert.deepEqual(segments.filter(s=>!s.isTechnique&&s.sourceId===from.id)[0].notes,from.notes);
    const total=segments.filter(s=>s.seamIndex===0).reduce((sum,s)=>sum+s.durationBeats,0);
    assert.equal(total,TECHNIQUES[id].beatCost);
  }
});

test('generated chord stays near departing register, not low target', () => {
  const from=makeChord([72,76,79]),to=makeChord([36,40,43],1,{rootMidi:36,quality:'Major'});
  const generated=compile(makeProgression({settings,chords:[from,to],seams:['secondaryDom']})).find(s=>s.isTechnique);
  assert.ok(generated.notes.reduce((a,b)=>a+b,0)/generated.notes.length>58);
});

test('wide scale run never exceeds two beats or sixteenth-note capacity', () => {
  const from=makeChord([40]),to=makeChord([88],1,{rootMidi:88,quality:'Major'});
  const run=compile(makeProgression({settings,chords:[from,to],seams:['scaleRun']})).filter(s=>s.seamIndex===0);
  assert.ok(run.length<=8); assert.equal(run.reduce((sum,s)=>sum+s.durationBeats,0),2);
});

test('short scale runs still spend exactly their allotted budget', () => {
  const from=makeChord([60]),to=makeChord([64],1,{rootMidi:64,quality:'Major'});
  const run=compile(makeProgression({settings,chords:[from,to],seams:['scaleRun']})).filter(s=>s.seamIndex===0);
  assert.equal(run.reduce((sum,s)=>sum+s.durationBeats,0),2);
  assert.ok(run.every(s=>[4,2,1,.5,.25].includes(s.durationBeats)));
});

test('compiled startBeat is measure-relative and tempo does not alter compile output',()=>{
  const p=makeProgression({settings:{...settings,tempo:80},chords:[makeChord([60,64,67],2)],seams:[]});
  const first=compile(p); p.settings.tempo=150; const second=compile(p);
  assert.deepEqual(first,second); assert.ok(first.every(s=>s.startBeat>=0&&s.startBeat<4));
});
