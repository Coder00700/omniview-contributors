import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { appUpdates } from '../app-updates.js';
test('update endpoint signs only release APKs, never footage keys', async () => {
  let key = 'app-updates/4/OmniView-Contributors.apk';
  const s3={send:async()=>({Body:{transformToString:async()=>JSON.stringify({build:4,version:'0.1.4',key})}})};
  let signed=0;
  const app=express();app.use(appUpdates({B2_BUCKET:'test'},s3,async()=>{signed++;return 'https://example.invalid/release';}));
  const server=app.listen(0);await new Promise(r=>server.once('listening',r));
  try {
    const url=`http://127.0.0.1:${server.address().port}/app-update`;
    const ok=await fetch(url);assert.equal(ok.status,200);assert.equal((await ok.json()).build,4);
    key='someone/clip/video';
    assert.equal((await fetch(url)).status,503);assert.equal(signed,1);
  } finally {await new Promise(r=>server.close(r));}
});
