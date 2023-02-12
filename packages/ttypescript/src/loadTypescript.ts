import * as TS from 'typescript';
type ts = typeof TS;
import { readFileSync } from 'fs';
import { sync as resolveSync } from 'resolve';
import { patchCreateProgram } from './patchCreateProgram';
import { dirname } from 'path';
import { runInThisContext } from 'vm';
import Module = require('module');

export function loadTypeScript(
    filename: string,
    { folder = __dirname, forceConfigLoad = false }: { folder?: string; forceConfigLoad?: boolean } = {}
): ts {
    const libFilename = resolveSync('typescript/lib/' + filename, { basedir: folder });

    if (!require.cache[libFilename]) {
        require.cache[libFilename] = TSModuleFactory(libFilename);
    }

    const ts = TSModuleFactory(libFilename).exports;
    const [major, minor] = ts.versionMajorMinor.split('.');
    if (+major < 3 && +minor < 7) {
        throw new Error('ttypescript supports typescript from 2.7 version');
    }

    return patchCreateProgram(ts, forceConfigLoad);
}

type TypeScriptFactory = (exports: ts, require: NodeRequire, module: Module, module2: Module, filename: string, dirname: string) => void;
const typeScriptFactoryCache = new Map<string, TypeScriptFactory>();

function TSModuleFactory(filename: string) {
    let factory = typeScriptFactoryCache.get(filename);
    if (!factory) {
        let code = readFileSync(filename, 'utf8');

        code = [
          code,
          [
            `Object.entries(module.exports).forEach(entry => {`,
            `  module2.exports[entry[0]] = entry[1];`,
            `});`,
            ``,
          ].join('\n'),
        ].join('\n\n')

        factory = runInThisContext(`(function (exports, require, module, module2, __filename, __dirname) {${code}\n});`, {
            filename: filename,
            lineOffset: 0,
            displayErrors: true,
        }) as TypeScriptFactory;

        typeScriptFactoryCache.set(filename, factory);
    }

    const newModule = new Module(filename, module);
    const newModule2 = new Module(filename, module);
    factory.call(newModule, newModule.exports, require, newModule, newModule2, filename, dirname(filename));
    return newModule2;
}
