import { basename, dirname, resolve } from 'node:path'

import { DENO_REPO, fetchGithubFileList, fetchGithubRaw } from './utils'

export interface DenoLibInfo {
    name: string
    path: string
    kind: 'lib' | 'ext'
}

export async function parseLibsList(commit: string): Promise<DenoLibInfo[]> {
    const buildScript = await fetchGithubRaw(DENO_REPO, commit, 'cli/build.rs')

    // determine dts folder
    const allFiles = await fetchGithubFileList(DENO_REPO, commit)
    // guess it based on the location of good-known lib file names
    const possibleDtsFolders = new Set<string>()
    for (const it of allFiles) {
        if (it.startsWith('tests/')) continue

        switch (basename(it)) {
            case 'lib.d.ts':
            case 'lib.dom.d.ts':
            case 'lib.esnext.d.ts':
                possibleDtsFolders.add(dirname(it))
                break
        }
    }
    if (possibleDtsFolders.size !== 1) {
        throw new Error(`Failed to determine dts folder (candidates: ${[...possibleDtsFolders].join(', ')})`)
    }
    const dtsFolder = [...possibleDtsFolders][0]

    const res: DenoLibInfo[] = []

    for (const it of buildScript.matchAll(/op_crate_libs\.insert\(\s*"(.+?)",\s*(.+?),?\s*\);/gsm)) {
        const [_, name, provider] = it

        let path
        if (provider === 'deno_webgpu_get_declaration()') {
            path = `${dtsFolder}/lib.deno_webgpu.d.ts`
        } else if (provider.startsWith('deno_') && provider.endsWith('::get_declaration()')) {
            // try to parse from rust code (god help us)
            const extName = provider.slice('deno_'.length, -'::get_declaration()'.length)
            const entry = await fetchGithubRaw(DENO_REPO, commit, `ext/${extName}/lib.rs`)

            // pub fn get_declaration() -> PathBuf {
            //   ...
            // }
            const functionCode = entry.match(/pub fn get_declaration\(\) -> PathBuf \{\s*(.*?)\s*\}/sm)?.[1]
            if (!functionCode) {
                throw new Error(`Failed to find get_declaration in ${extName}`)
            }

            // PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("lib.deno_cache.d.ts")
            const libName = functionCode.match(/^\s*PathBuf::from\(env!\("CARGO_MANIFEST_DIR"\)\)\s*\.join\("(.+?)"\)\s*$/m)?.[1]
            if (!libName) {
                throw new Error(`Failed to parse lib name from ${extName}`)
            }

            path = `ext/${extName}/${libName}`
        } else if (provider.match(/^"\..+?"$/)) {
            const relative = JSON.parse(provider)
            path = resolve('/cli', relative).slice(1)
        } else {
            throw new Error(`failed to parse dts provider: ${provider}`)
        }

        res.push({
            name,
            path,
            kind: 'ext',
        })
    }

    const builtinLibs = buildScript.match(/^\s*let libs = vec!\[(.+?)\];\s*$/sm)?.[1]
    if (!builtinLibs) {
        throw new Error('Failed to find builtin libs')
    }

    // clean up a bit
    const libs = builtinLibs
        // remove comments
        .replace(/^\s*\/\/.*?$\n/gm, '')
        // remove indentation
        .replace(/^\s*/gm, '')
        // remove line breaks
        .replace(/\n/g, '')
        .split(',')
        .filter(Boolean)
        .map(it => JSON.parse(it.trim()))

    for (const it of libs) {
        res.push({
            name: it,
            path: `${dtsFolder}/lib.${it}.d.ts`,
            kind: it.startsWith('deno.') ? 'ext' : 'lib',
        })
    }
    return res
}
