const fs = require('fs');
const path = require('path');

const gradleFile = path.join(
  __dirname,
  '..',
  'node_modules',
  '@codetrix-studio',
  'capacitor-google-auth',
  'android',
  'build.gradle'
);

if (!fs.existsSync(gradleFile)) process.exit(0);

const source = fs.readFileSync(gradleFile, 'utf8');
const patched = source.replace(/\bjcenter\(\)/g, 'mavenCentral()');

if (patched !== source) {
  fs.writeFileSync(gradleFile, patched);
  console.log('[postinstall] Replaced deprecated jcenter() in Capacitor Google Auth.');
}
