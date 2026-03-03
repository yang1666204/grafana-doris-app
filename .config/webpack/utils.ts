import fs from 'fs';
import process from 'process';
import os from 'os';
import path from 'path';
import { glob } from 'glob';
import { SOURCE_DIR } from './constants.ts';

export function isWSL() {
  if (process.platform !== 'linux') {
    return false;
  }

  if (os.release().toLowerCase().includes('microsoft')) {
    return true;
  }

  try {
    return fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

function loadJson(path: string) {
  const rawJson = fs.readFileSync(path, 'utf8');
  return JSON.parse(rawJson);
}

export function getPackageJson() {
  return loadJson(path.resolve(process.cwd(), 'package.json'));
}

export function getPluginJson() {
  return loadJson(path.resolve(process.cwd(), `${SOURCE_DIR}/plugin.json`));
}

export function getCPConfigVersion() {
  const cprcJson = path.resolve(process.cwd(), './.config', '.cprc.json');
  return fs.existsSync(cprcJson) ? loadJson(cprcJson).version : { version: 'unknown' };
}

export function hasReadme() {
  return fs.existsSync(path.resolve(process.cwd(), SOURCE_DIR, 'README.md'));
}

function globFiles(pattern: string, options: { absolute: boolean }): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const done = (error: Error | null, matches?: string[]) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(matches ?? []);
    };

    try {
      const result = (glob as unknown as (...args: unknown[]) => unknown)(pattern, options, done);

      // glob@10+ returns Promise<string[]>, glob@7 uses callback API.
      if (result && typeof (result as Promise<string[]>).then === 'function') {
        (result as Promise<string[]>).then((matches) => done(null, matches)).catch((error) => done(error as Error));
      }
    } catch (error) {
      reject(error as Error);
    }
  });
}

// Support bundling nested plugins by finding all plugin.json files in src directory
// then checking for a sibling module.[jt]sx? file.
export async function getEntries() {
  const pluginsJson = await globFiles('**/src/**/plugin.json', { absolute: true });

  const plugins = await Promise.all(
    pluginsJson.map((pluginJson) => {
      const folder = path.dirname(pluginJson);
      return globFiles(`${folder}/module.{ts,tsx,js,jsx}`, { absolute: true });
    })
  );

  return plugins.reduce<Record<string, string>>((result, modules) => {
    return modules.reduce((innerResult, module) => {
      const pluginPath = path.dirname(module);
      const pluginName = path.relative(process.cwd(), pluginPath).replace(/src\/?/i, '');
      const entryName = pluginName === '' ? 'module' : `${pluginName}/module`;

      innerResult[entryName] = module;
      return innerResult;
    }, result);
  }, {});
}
