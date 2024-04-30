import * as fs from 'node:fs'
import { dirname } from 'node:path'

export const DENO_REPO = 'denoland/deno'

export function getGithubRawUrl(repo: string, branch: string, path: string) {
    return `https://raw.githubusercontent.com/${repo}/${branch}/${path}`
}

export async function fetchGithubRaw(repo: string, branch: string, path: string) {
    const res = await fetch(getGithubRawUrl(repo, branch, path))
    if (!res.ok) {
        throw new Error(`Failed to fetch ${path}: ${res.statusText}`)
    }
    return await res.text()
}

export async function downloadFile(url: string, dest: string) {
    const res = await fetch(url)
    if (!res.ok) {
        throw new Error(`Failed to download file ${url}: ${res.statusText}`)
    }

    const out = fs.createWriteStream(dest)

    const reader = res.body?.getReader()
    if (!reader) {
        throw new Error('Failed to get reader')
    }

    while (true) {
        const { done, value } = await reader.read()
        if (done) {
            break
        }

        out.write(value)
    }

    out.close()
}

export async function resolveGithubCommit(repo: string, ref: string): Promise<string> {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${ref}`)
    if (!res.ok) {
        throw new Error(`Failed to fetch commit info for ${ref}: ${res.statusText}`)
    }
    const data = await res.json()
    return data.sha
}

export async function fetchGithubFileList(repo: string, commit: string): Promise<string[]> {
    const res = await fetch(`https://github.com/${repo}/tree-list/${commit}`, {
        headers: {
            Accept: 'application/json',
        },
    })
    if (!res.ok) {
        throw new Error(`Failed to fetch file list: ${res.statusText}`)
    }
    const data = await res.json()
    return data.paths
}

export async function getTypescriptLibs(): Promise<string[]> {
    const path = require.resolve('typescript')
    const dir = dirname(path)
    const files = await fs.promises.readdir(dir)
    return files.filter(file => file.startsWith('lib.') && file.endsWith('.d.ts'))
}
