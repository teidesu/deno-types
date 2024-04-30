import * as fsp from 'node:fs/promises'
import { dirname, relative } from 'node:path'

import { asyncPoolCallback } from 'eager-async-pool'

import { DENO_REPO, downloadFile, getGithubRawUrl, getTypescriptLibs } from './utils'
import { type DenoLibInfo, parseLibsList } from './libs'

const LIBS_FOR_NS_FLAVOR = [
    'deno.ns',
    'deno.net',
    'deno.unstable',
]

export async function generateNpmPackage(params: {
    commit: string
    outDir: string
    version?: string
}) {
    if (await fsp.exists(params.outDir)) {
        await fsp.rm(params.outDir, { recursive: true })
    }

    await fsp.mkdir(params.outDir, { recursive: true })

    console.log('Collecting lib list...')
    const libs = await parseLibsList(params.commit)

    const getDest = (lib: DenoLibInfo, base = params.outDir, kind: string = lib.kind) => {
        return `${base}/${kind}/lib.${lib.name}.d.ts`
    }

    // download them all
    let i = 1
    console.log('Found %d d.ts libs', libs.length)

    await asyncPoolCallback(async (info) => {
        const url = getGithubRawUrl(DENO_REPO, params.commit, info.path)

        const dest = getDest(info)

        if (await fsp.exists(dest)) {
            throw new Error(`Duplicate lib: ${dest}`)
        }

        await fsp.mkdir(dirname(dest), { recursive: true })

        await downloadFile(url, dest)

        if (info.kind === 'ext') {
            // make a copy in ext_tslib
            const destTslib = getDest(info, params.outDir, 'ext_tslib')
            await fsp.mkdir(dirname(destTslib), { recursive: true })
            await fsp.copyFile(dest, destTslib)
        }
    }, libs, (result) => {
        if (result.error) {
            throw result.error
        }

        const { path, name } = result.item

        console.log(`[${i++}/${libs.length}] Downloaded ${path} as ${name}...`)
    }, { limit: 8 })

    console.log('Generating a package')

    // process them
    const tsLibs = await getTypescriptLibs()
    for (const info of libs) {
        const file = getDest(info)
        let content = await fsp.readFile(file, 'utf-8')
        let changed = false

        // we need to replace triple-slash references to "lib" with relative paths
        content = content.replace(
            /\/\/\/ <reference lib="(.+)" \/>/g,
            (_, lib) => {
                const libInfo = libs.find(l => l.name === lib)
                if (!libInfo) {
                    console.warn(`[WARNING] Unknown lib: ${lib} (referenced in ${file})`)
                    return _
                }

                const libDest = getDest(libInfo)
                const relativePath = relative(dirname(file), libDest)
                changed = true
                return `/// <reference path="${relativePath}" />`
            },
        )

        if (changed) {
            await fsp.writeFile(file, content)
        }

        if (info.kind !== 'ext') continue

        // process ext_tslib
        const fileTslib = getDest(info, params.outDir, 'ext_tslib')
        content = await fsp.readFile(fileTslib, 'utf-8')
        changed = false

        // similar to above, but we want to use typescript's built-in libs instead
        // of the ones provided by Deno whenever possible. and also remove the
        // <reference no-default-lib="true"/> directive
        content = content.replace(
            /\/\/\/ <reference lib="(.+)" \/>/g,
            (directive, lib) => {
                if (tsLibs.includes(`lib.${lib}.d.ts`)) {
                    changed = true
                    return directive // it's okay to keep it as is
                }

                const libInfo = libs.find(l => l.name === lib)
                if (!libInfo) {
                    console.warn(`[WARNING] Unknown lib: ${lib} (referenced in ${fileTslib})`)
                    return directive
                }

                const libDest = getDest(libInfo)
                const relativePath = relative(dirname(file), libDest)
                changed = true
                return `/// <reference path="${relativePath}" />`
            },
        ).replace(/\/\/\/ <reference no-default-lib="true" \/>/g, () => {
            changed = true
            return ''
        })

        if (changed) {
            await fsp.writeFile(fileTslib, content)
        }
    }

    // generate ns.d.ts
    const nsFiles = libs
        .filter(lib => lib.kind === 'ext' && LIBS_FOR_NS_FLAVOR.includes(lib.name))
        .map(lib => getDest(lib, '.', 'ext_tslib'))
    if (nsFiles.length !== LIBS_FOR_NS_FLAVOR.length) {
        throw new Error('Failed to find all required libs for `ns` flavor')
    }

    await fsp.writeFile(`${params.outDir}/ns.d.ts`, nsFiles.map(file => `/// <reference path="${file}" />`).join('\n'))

    // generate full.d.ts and lib.d.ts
    await fsp.writeFile(
        `${params.outDir}/full.d.ts`,
        libs
            .filter(lib => lib.kind === 'ext')
            .map(lib => `/// <reference path="${getDest(lib, '.', 'ext_tslib')}" />`)
            .join('\n'),
    )
    await fsp.writeFile(
        `${params.outDir}/free-standing.d.ts`,
        [...libs]
            // "lib"-s should go first
            .sort((a, b) => a.kind === 'lib' ? -1 : b.kind === 'lib' ? 1 : 0)
            .map(lib => `/// <reference path="${getDest(lib, '.')}" />`)
            .join('\n'),
    )

    // generate package.json
    const packageJson: Record<string, unknown> = {
        name: '@teidesu/deno-types',
        version: params.version || `git-${params.commit}`,
        description: 'TypeScript definitions for Deno',
        license: 'MIT',
        main: '',
        repository: {
            type: 'git',
            url: 'https://github.com/teidesu/deno-types',
        },
    }

    await fsp.writeFile(`${params.outDir}/package.json`, JSON.stringify(packageJson, null, 2))

    console.log('Done')
}
