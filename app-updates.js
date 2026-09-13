import { Router } from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
export function appUpdates(env = process.env, injected, sign = getSignedUrl) {
  const router = Router();
  const s3 = injected || new S3Client({endpoint:env.B2_ENDPOINT,region:env.B2_REGION,forcePathStyle:true,credentials:{accessKeyId:env.B2_KEY_ID || '',secretAccessKey:env.B2_APPLICATION_KEY || ''}});
  router.get(['/app-update', '/app-download'], async (req,res) => {
    try {
      const object = await s3.send(new GetObjectCommand({Bucket:env.B2_BUCKET,Key:'app-updates/latest.json'}));
      const manifest = JSON.parse(await object.Body.transformToString());
      if (!Number.isSafeInteger(manifest.build) || !/^app-updates\/\d+\/OmniView-Contributors\.apk$/.test(manifest.key)) throw Error('Invalid release');
      const url = await sign(s3,new GetObjectCommand({Bucket:env.B2_BUCKET,Key:manifest.key,ResponseContentType:'application/vnd.android.package-archive',ResponseContentDisposition:'attachment; filename="OmniView-Contributors.apk"'}),{expiresIn:600});
      if (req.path === '/app-download') return res.set('Cache-Control','no-store').redirect(302,url);
      res.set('Cache-Control','no-store').json({build:manifest.build,version:manifest.version,sha256:manifest.sha256,url});
    } catch { res.status(503).json({error:'Update checks are temporarily unavailable.'}); }
  });
  return router;
}
