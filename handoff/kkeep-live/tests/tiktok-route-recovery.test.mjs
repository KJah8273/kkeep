import test from 'node:test';
import assert from 'node:assert/strict';
import {createTikTokStartupRecovery, TIKTOK_HOME, isTikTokLanding, isTikTokUnavailable} from '../lib/tiktok-recovery.ts';

test('manual reconnect remembers the observed content page without automatically replaying it', () => {
 for (const url of [
  'https://www.tiktok.com/@real.user',
  'https://www.tiktok.com/@real.user/video/123?lang=en',
  'https://www.tiktok.com/following',
  'https://www.tiktok.com/observed-account-section',
  'https://www.tiktok.com/search?q=hello%20world%2Btest&lang=en',
  'https://www.tiktok.com/%40real.user?lang=en',
 ]) {
  const flow=createTikTokStartupRecovery();
  assert.deepEqual(flow.navigate(url),{unavailable:false});
  assert.deepEqual(flow.navigate('https://www.tiktok.com/404'),{unavailable:true});
  assert.equal(flow.reconnectUrl(),url,'Keep the actual route/encoding, not a constructed account link');
  assert.deepEqual(flow.navigate('https://www.tiktok.com/404'),{unavailable:true});
  assert.equal(flow.reconnectUrl(),url,'Duplicate error navigation must not erase the destination');
  flow.reset();assert.equal(flow.reconnectUrl(),TIKTOK_HOME);
 }
});

test('manual recovery never retains callbacks, challenges, token URLs or the signed-out profile placeholder', () => {
 for (const url of [
  'https://www.tiktok.com/login',
  'https://www.tiktok.com/en/sign-in',
  'https://www.tiktok.com/auth/callback',
  'https://www.tiktok.com/%6c%6f%67%69%6e',
  'https://www.tiktok.com/%256c%256f%2567%2569%256e',
  'https://www.tiktok.com/verify',
  'https://www.tiktok.com/captcha',
  'https://www.tiktok.com/consent',
  'https://www.tiktok.com/?code=synthetic&state=synthetic',
  'https://www.tiktok.com/@real.user?token=synthetic',
  'https://www.tiktok.com/search?q=hello&verifyFp=synthetic',
  'https://www.tiktok.com/#access_token=synthetic',
  'https://www.tiktok.com/@',
  'https://www.tiktok.com/%40',
  'https://accounts.google.com/signin',
  'https://login-us.www.tiktok.com/callback',
  'https://www.tiktok.com:8443/@real.user',
  'https://user:password@www.tiktok.com/@real.user',
  'https://tiktok.com.evil.example/@real.user',
 ]) {
  const flow=createTikTokStartupRecovery();
  flow.navigate('https://www.tiktok.com/@previous-page');
  flow.navigate(url);
  assert.deepEqual(flow.navigate('https://www.tiktok.com/404'),{unavailable:true},url);
  assert.equal(flow.reconnectUrl(),TIKTOK_HOME,url);
 }
});

test('manual target tracking does not extend the single automatic public landing retry', () => {
 const flow=createTikTokStartupRecovery();
 flow.navigate('https://www.tiktok.com/foryou?lang=en');
 assert.deepEqual(flow.navigate('https://www.tiktok.com/404'),{retry:TIKTOK_HOME,unavailable:false});
 flow.navigate(TIKTOK_HOME);
 flow.navigate('https://www.tiktok.com/@real.user');
 assert.deepEqual(flow.navigate('https://www.tiktok.com/404'),{unavailable:true});
 assert.equal(flow.reconnectUrl(),'https://www.tiktok.com/@real.user');
 flow.navigate(TIKTOK_HOME);
 assert.deepEqual(flow.navigate('https://www.tiktok.com/404'),{unavailable:true});
});

test('nonstandard ports are not accepted as a trusted TikTok landing or error page', () => {
 assert.equal(isTikTokLanding('https://www.tiktok.com:8443/'),false);
 assert.equal(isTikTokUnavailable('https://www.tiktok.com:8443/404'),false);
});
