import { mkdir, copyFile, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/staging', { recursive: true });
for (const name of ['index', 'about', 'videos', 'companion', 'bot-battle', 'power-racers']) {
  let html = await readFile(`${name}.html`, 'utf8');
  if (name === 'companion') {
    html = html.replace('No personal information is collected,', 'Staging accounts store a participant display name and demo progress,');
    html = html.replace('Demo achievements remain in this browser.', 'Demo achievements sync to the staging account while signed in.');
    html = html.replace('Progress is saved on this device only; it is not a real check-in or proof of attendance.', 'Without sign-in, progress stays on this device. While signed in, sample badges sync to your staging account. They are not proof of attendance.');
    html = html.replace('Clear all demo passport badges on this device?', 'Clear these demo passport badges? While signed in this resets your staging account demo passport across devices.');
    html = html.replace('</body>', `<script>
      {const localSave=save;let remoteSave=null;
       window.makerQuestPassport={
         get:()=>[...earned],
         replace:ids=>{earned=new Set(ids);render();choose(selected)},
         connect:handler=>{remoteSave=handler},
         restoreLocal:()=>{let ids=[];try{ids=JSON.parse(localStorage.getItem(storageKey)||'[]')}catch{};earned=new Set(Array.isArray(ids)?ids.filter(k=>Object.hasOwn(booths,k)):[]);render();choose(selected)}
       };
       save=()=>remoteSave?remoteSave([...earned]):localSave();}
    </script></body>`);
  }
  // Only staged build outputs receive account controls. Original pages stay intact.
  html = html.replace('</body>', '<script type="module" src="./staging/account.js"></script></body>');
  await writeFile(`dist/${name}.html`, html);
}
await cp('assets', 'dist/assets', { recursive: true });
await copyFile('staging/account.html', 'dist/staging/account.html');
await build({ entryPoints: ['staging/account.js'], outfile: 'dist/staging/account.js',
  bundle: true, format: 'esm', minify: true, target: ['safari15', 'chrome100'],
  legalComments: 'eof' });
await writeFile('dist/robots.txt', 'User-agent: *\nDisallow: /\n');
console.log('Built isolated staging assets in dist/');
