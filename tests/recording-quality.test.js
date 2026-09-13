import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locationQuality } from '../src/recording-quality.js';
test('rejects long gaps, weak fixes and missing end coverage', () => {
  assert.equal(locationQuality([], 10).usable, false);
  assert.equal(locationQuality([{relativeMs:0,accuracy:3},{relativeMs:10000,accuracy:3}],10).usable,false);
  const track = Array.from({length:11},(_,i)=>({relativeMs:i*1000,accuracy:4}));
  assert.equal(locationQuality(track,10).usable,true);
  assert.equal(locationQuality(track.map(p=>({...p,accuracy:80})),10).usable,false);
  assert.equal(locationQuality(track,20).usable,false);
});
