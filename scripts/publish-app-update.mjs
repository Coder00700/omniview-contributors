import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
const build = Number(process.argv[2]);
if (!Number.isSafeInteger(build) || build < 1) throw Error('Provide Android build number');
const body=readFileSync('OmniView-Contributors.apk');
const env=process.env;
const s3=new S3Client({endpoint:env.B2_ENDPOINT,region:env.B2_REGION,forcePathStyle:true,credentials:{accessKeyId:env.B2_KEY_ID,secretAccessKey:env.B2_APPLICATION_KEY},requestChecksumCalculation:'WHEN_REQUIRED'});
const key=`app-updates/${build}/OmniView-Contributors.apk`;
await s3.send(new PutObjectCommand({Bucket:env.B2_BUCKET,Key:key,Body:body,ContentType:'application/vnd.android.package-archive'}));
const manifest={build,version:`0.1.${build}`,key,sha256:createHash('sha256').update(body).digest('hex')};
// Publish the announcement only after the complete APK is stored.
await s3.send(new PutObjectCommand({Bucket:env.B2_BUCKET,Key:'app-updates/latest.json',Body:JSON.stringify(manifest),ContentType:'application/json'}));
console.log(`Published Android update ${manifest.version}`);
