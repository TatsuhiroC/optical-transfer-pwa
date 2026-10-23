import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// Only dummy keys/passwords and local fake executables are used. No real key or
// GitHub account is accessed by these integration tests.
describe.skipIf(process.platform === 'win32')('private signing tools', () => {
  let folder: string, key: string, log: string, env: NodeJS.ProcessEnv;
  const password = 'test-only-password-$&-{path}';
  const material = 'THIS-IS-A-DUMMY-KEYSTORE-NOT-A-PRIVATE-KEY';
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'optical-signing-test-'));
    mkdirSync(join(folder, 'bin'), {mode:0o700});
    key = join(folder, 'private', 'release.keystore'); log = join(folder, 'calls.jsonl');
    env = {...process.env, PATH:join(folder,'bin')+':'+process.env.PATH,
      ANDROID_KEYSTORE_PASSWORD:password, KEY_ALIAS:'test-alias', VALIDITY_DAYS:'10000',
      AUDIT_LOG:log, AUDIT_MATERIAL:material, AUDIT_FAIL:''};
    writeFileSync(join(folder,'bin/keytool'), `#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);
fs.appendFileSync(process.env.AUDIT_LOG,JSON.stringify({tool:'keytool',args})+'\\n');
if(process.env.AUDIT_FAIL==='keytool'){console.error(process.env.OPTICAL_KEYTOOL_PASSWORD);process.exit(1);}
if(args.includes('-genkeypair')){const path=args[args.indexOf('-keystore')+1];fs.writeFileSync(path,process.env.AUDIT_MATERIAL);fs.chmodSync(path,0o644);console.log(process.env.OPTICAL_KEYTOOL_PASSWORD);}
else if(args.includes('-list'))console.log(require('node:tls').rootCertificates[0]);
`,{mode:0o700});
    writeFileSync(join(folder,'bin/gh'), `#!/usr/bin/env node
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{
require('node:fs').appendFileSync(process.env.AUDIT_LOG,JSON.stringify({tool:'gh',args:process.argv.slice(2),input})+'\\n');
console.log(input);if(process.env.AUDIT_FAIL==='gh'){console.error(input);process.exitCode=1;}
});
`,{mode:0o700});
  });
  afterEach(() => rmSync(folder,{recursive:true,force:true}));
  const mode = (path:string) => statSync(path).mode & 0o777;
  const calls = () => existsSync(log) ? readFileSync(log,'utf8').trim().split('\n').map(x=>JSON.parse(x)) : [];
  const generate = () => spawnSync('bash',['-x','scripts/make-keystore.sh',key],{env,encoding:'utf8'});
  const configure = () => spawnSync(process.execPath,['scripts/make-keystore.mjs','--configure-github',key+'.secrets.json'],{env,encoding:'utf8'});
  const noSecrets = (output:string) => {
    expect(output).not.toContain(password);
    expect(output).not.toContain(material);
    expect(output).not.toContain(Buffer.from(material).toString('base64'));
  };
  it('creates private files, uses environment passwords and never logs secrets even with shell tracing', () => {
    const result=generate();expect(result.status).toBe(0);noSecrets(result.stdout+result.stderr);
    expect(mode(join(folder,'private'))).toBe(0o700);
    for(const file of [key,key+'.secrets.json'])expect(mode(file)).toBe(0o600);
    const config=JSON.parse(readFileSync(key+'.secrets.json','utf8'));
    expect(config.ANDROID_KEYSTORE_PASSWORD).toBe(password);
    expect(config.ANDROID_KEYSTORE_BASE64).toBe(Buffer.from(material).toString('base64'));
    expect(result.stdout).toContain(config.ANDROID_CERT_SHA256);
    expect(calls().every(x=>x.tool==='keytool'&&!x.args.includes(password))).toBe(true);
    expect(calls()[0].args).toContain('-storepass:env');
    expect(readdirSync(join(folder,'private')).some(x=>x.startsWith('.keygen-'))).toBe(false);
  });
  it('stores an automatically generated password without printing it', () => {
    env.ANDROID_KEYSTORE_PASSWORD='';const result=generate();expect(result.status).toBe(0);
    const config=JSON.parse(readFileSync(key+'.secrets.json','utf8'));
    expect(config.ANDROID_KEYSTORE_PASSWORD.length).toBeGreaterThanOrEqual(32);
    expect(result.stdout+result.stderr).not.toContain(config.ANDROID_KEYSTORE_PASSWORD);
  });
  it('refuses to replace existing keys or dangling symlinks', () => {
    expect(generate().status).toBe(0);const original=readFileSync(key);
    expect(generate().status).not.toBe(0);expect(readFileSync(key)).toEqual(original);
    rmSync(key);symlinkSync(join(folder,'missing-key'),key);
    expect(generate().status).not.toBe(0);expect(lstatSync(key).isSymbolicLink()).toBe(true);
    expect(existsSync(join(folder,'missing-key'))).toBe(false);
  });
  it('does not change the permissions of an unrelated existing output directory', () => {
    mkdirSync(join(folder,'private'),{mode:0o755});chmodSync(join(folder,'private'),0o755);
    expect(generate().status).not.toBe(0);expect(mode(join(folder,'private'))).toBe(0o755);
    expect(existsSync(key)).toBe(false);
  });
  it('suppresses tool errors and removes incomplete material', () => {
    env.AUDIT_FAIL='keytool';const result=generate();expect(result.status).not.toBe(0);
    noSecrets(result.stdout+result.stderr);expect(existsSync(key)).toBe(false);
    expect(readdirSync(join(folder,'private'))).toEqual([]);
  });
  it('only uploads explicitly, with each secret on stdin and never in output or arguments', () => {
    expect(generate().status).toBe(0);const config=JSON.parse(readFileSync(key+'.secrets.json','utf8'));
    const result=configure();expect(result.status).toBe(0);noSecrets(result.stdout+result.stderr);
    const uploads=calls().filter(x=>x.tool==='gh');expect(uploads).toHaveLength(5);
    for(const upload of uploads){expect(upload.args.slice(0,2)).toEqual(['secret','set']);expect(upload.input).toBe(config[upload.args[2]]);expect(upload.args).not.toContain(upload.input);}
  });
  it('refuses a readable configuration and hides failed upload output', () => {
    expect(generate().status).toBe(0);chmodSync(key+'.secrets.json',0o644);
    expect(configure().status).not.toBe(0);expect(calls().filter(x=>x.tool==='gh')).toHaveLength(0);
    chmodSync(key+'.secrets.json',0o600);env.AUDIT_FAIL='gh';const result=configure();
    expect(result.status).not.toBe(0);noSecrets(result.stdout+result.stderr);
  });
  it('replaces pre-existing readable signing files and symlinks with private inodes', () => {
    const android=join(folder,'android');mkdirSync(join(android,'app/src/main'),{recursive:true});
    writeFileSync(join(android,'app/build.gradle'),'android {}\n');
    writeFileSync(join(android,'app/src/main/AndroidManifest.xml'),'<manifest></manifest>');
    const outside=join(folder,'outside.txt');writeFileSync(outside,'DO-NOT-CHANGE');
    symlinkSync(outside,join(android,'app/ci-release.keystore'));
    writeFileSync(join(android,'keystore.properties'),'old');chmodSync(join(android,'keystore.properties'),0o644);
    const result=spawnSync(process.execPath,['scripts/prepare-android.mjs',android],{encoding:'utf8',env:{...env,
      ANDROID_KEYSTORE_BASE64:Buffer.alloc(128,7).toString('base64'),ANDROID_KEY_ALIAS:'fixture',ANDROID_KEY_PASSWORD:password,
      GITHUB_REF_TYPE:'branch',GITHUB_REF_NAME:'test',GITHUB_RUN_NUMBER:'1',GITHUB_OUTPUT:'',GITHUB_STEP_SUMMARY:''}});
    expect(result.status).toBe(0);expect(readFileSync(outside,'utf8')).toBe('DO-NOT-CHANGE');
    for(const file of ['app/ci-release.keystore','keystore.properties']){expect(mode(join(android,file))).toBe(0o600);expect(lstatSync(join(android,file)).isSymbolicLink()).toBe(false);}
    expect(readdirSync(android).some(x=>x.endsWith('.tmp'))).toBe(false);
  });
});
