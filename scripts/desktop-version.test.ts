import { stampVersion } from './desktop-version';

const configPattern = /(\bversion:\s*)(')[^']*\2/;
const packagePattern = /(\"version\":\s*)(\")[^\"]*\2/;

const config = "app: {\r\n  version: '0.0.1',\r\n}";
if (stampVersion(config, configPattern, '0.1.0', 'electrobun.config.ts') !== "app: {\r\n  version: '0.1.0',\r\n}") {
  throw new Error('Electrobun version stamping must preserve CRLF line endings.');
}

const packageJson = '{\n  "version": "0.0.1"\n}\n';
const stampedPackage = stampVersion(packageJson, packagePattern, '0.1.0', 'package.json');
if (stampVersion(stampedPackage, packagePattern, '0.1.0', 'package.json') !== stampedPackage) {
  throw new Error('Version stamping must be safe to repeat for an already stamped version.');
}

let missingFieldRejected = false;
try {
  stampVersion('export default {}', configPattern, '0.1.0', 'invalid.ts');
} catch {
  missingFieldRejected = true;
}
if (!missingFieldRejected) throw new Error('Version stamping must fail when a version field is missing.');

console.log('Desktop version stamping tests passed');
