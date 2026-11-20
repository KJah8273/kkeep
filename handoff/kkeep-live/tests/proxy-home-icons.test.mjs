import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root = new URL('../public/',import.meta.url);
for (const [app,title] of [['xbox','Xbox Cloud'],['gfn','GeForce NOW']]) {
  test(`${app} has independent home screen branding and launch destination`,()=>{
    const html=readFileSync(new URL(`${app}/index.html`,root),'utf8');
    assert.ok(html.includes(`name="apple-mobile-web-app-title" content="${title}"`));
    assert.ok(html.includes(`href="/${app}/apple-touch-icon.png"`));
    assert.ok(html.includes(`href="/${app}/manifest.webmanifest"`));
    assert.ok(!html.includes('href="/apple-touch-icon.png"'));
    const manifest=JSON.parse(readFileSync(new URL(`${app}/manifest.webmanifest`,root),'utf8'));
    assert.equal(manifest.id,`/${app}/`);
    assert.equal(manifest.scope,`/${app}/`);
    assert.equal(manifest.start_url,`/${app}/index.html`);
    assert.equal(manifest.short_name,title);
    for(const [file,size] of [['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]]) {
      const png=readFileSync(new URL(`${app}/${file}`,root));
      assert.equal(png.subarray(1,4).toString(),'PNG');
      assert.equal(png.readUInt32BE(16),size);
      assert.equal(png.readUInt32BE(20),size);
    }
    for(const icon of manifest.icons) assert.ok(icon.src.startsWith(`/${app}/`));
  });
}
test('Kkeep keeps its own home screen icon',()=>{
  const manifest=JSON.parse(readFileSync(new URL('manifest.webmanifest',root),'utf8'));
  assert.equal(manifest.short_name,'Kkeep');
  assert.equal(manifest.icons[0].src,'/kkeep-portrait.png?v=1');
});
