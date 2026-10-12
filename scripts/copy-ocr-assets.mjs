// Tesseract 워커·엔진·한국어/영어 학습 데이터를 public/ocr 로 복사해 CDN 없이 자체 호스팅합니다.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const out = new URL('../public/ocr/', import.meta.url).pathname;
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

mkdirSync(join(out, 'core'), { recursive: true });
mkdirSync(join(out, 'lang'), { recursive: true });

copyFileSync(join(pkgDir('tesseract.js'), 'dist/worker.min.js'), join(out, 'worker.min.js'));
const core = pkgDir('tesseract.js-core');
for (const f of readdirSync(core)) {
  if (f.endsWith('-lstm.wasm.js')) copyFileSync(join(core, f), join(out, 'core', f));
}
for (const lang of ['kor', 'eng']) {
  copyFileSync(
    join(pkgDir(`@tesseract.js-data/${lang}`), `4.0.0_best_int/${lang}.traineddata.gz`),
    join(out, 'lang', `${lang}.traineddata.gz`),
  );
}
console.log('OCR assets →', out);
