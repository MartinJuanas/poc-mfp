import { mkdir, writeFile, readFile, rm, rename } from 'node:fs/promises';
import path from 'node:path';
const root = () => path.resolve(process.env.BULK_STORAGE_DIR || './data/bulk');
const dir = id => { if (!/^[a-f\d]{24}$/i.test(String(id))) throw new Error('Lote inválido'); return path.join(root(), String(id)); };
export async function storeBuffers(id, files) {
  await mkdir(dir(id), { recursive: true });
  // Write sequentially to bound disk pressure. PDF bytes are never served publicly.
  for (let i = 0; i < files.length; i++) {
    const target = path.join(dir(id), `${i}.pdf`);
    await writeFile(`${target}.tmp`, files[i].buffer, { mode: 0o600 });
    await rename(`${target}.tmp`, target);
  }
}
export const readBuffer = (id, index) => readFile(path.join(dir(id), `${Number(index)}.pdf`));
export const removeBuffers = id => rm(dir(id), { recursive: true, force: true });
