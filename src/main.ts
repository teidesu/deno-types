import { parseArgs } from 'node:util'

import { generateNpmPackage } from './generator'
import { DENO_REPO, resolveGithubCommit } from './utils'

const args = parseArgs({
    options: {
        ref: {
            type: 'string',
        },
        version: {
            type: 'string',
        },
        target: {
            type: 'string',
            default: 'out',
        },
    },
    strict: true,
    allowPositionals: true,
})

if (args.values.ref && args.values.version) {
    throw new Error('Cannot specify both ref and version')
}

const ref = args.values.ref || (args.values.version ? `v${args.values.version}` : 'main')

const commit = await resolveGithubCommit(DENO_REPO, ref)
console.log('Generating types from %s (commit %s)...', ref, commit)

await generateNpmPackage({
    commit,
    outDir: args.values.target!,
    version: args.values.version,
})
