import {Link, useLoaderData} from "@remix-run/react";
import {LinksFunction, useParams} from "remix";
import {useMemo} from "react";
import styles from '../../styles/retro.css'

export async function loader({params}: any) {
    const result = await fetch('https://proxy.c2.com/wiki/remodel/pages/' + params.slug)
    const json = await result.json()
    return {date: json.date, text: json.text}
}

export const links: LinksFunction = ()=> [{rel: 'stylesheet', href: styles}]


const isUrl = (s: string) => {
    try {
        const url = new URL(s)
        return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
        return false
    }
}

type WikiElement =
    | { type: 'root', children: (WikiElement | string)[], parent?: WikiElement }
    | { type: 'hrule', children: (WikiElement | string)[], parent?: WikiElement }
    | { type: 'paragraph', children: (WikiElement | string)[], parent?: WikiElement }
    | { type: 'bold', children: (WikiElement | string)[], parent?: WikiElement }
    | { type: 'italic', children: (WikiElement | string)[], parent?: WikiElement }
    | { type: 'link', href: string, children: (WikiElement | string)[], parent?: WikiElement }
    | { type: 'list', children: (WikiElement | string)[], parent?: WikiElement, depth: number }

// A fairly dumb parser that takes a WardWiki string and turns it into a list of
// "wiki elements"
function parseText(words: string, names: Set<string>, idx: number): WikiElement {
    const root: WikiElement = {type: 'root', children: []}
    let context: WikiElement = root
    while (idx < words.length) {
        if (context.type === 'root') {
            const pg: WikiElement = {type: 'paragraph', children: [], parent: context}
            context.children.push(pg)
            context = pg
            continue;
        }

        if (words[idx] === "'" && words.substring(idx, idx + 3) === "'''") {
            if (context.type === 'bold') {
                context = context.parent!
                idx += 3
                continue;
            }
            const newCtx: WikiElement = {type: 'bold', children: [], parent: context}
            context.children.push(newCtx)
            context = newCtx
            idx += 3
            continue;
        }
        if (words[idx] === "'" && words.substring(idx, idx + 2) === "''") {
            if (context.type === 'italic') {
                context = context.parent!
                idx += 2
                continue;
            }
            const newCtx: WikiElement = {type: 'italic', children: [], parent: context}
            context.children.push(newCtx)
            context = newCtx
            idx += 2
            continue;
        }
        if (words[idx] === '-' && words.substring(idx, idx + 4) === '----') {
            context.children.push({type: 'hrule', children: []})
            idx += 4
            continue;
        }
        if (words[idx] === '\r') {
            idx++
            continue;
        }
        if (words[idx] === '\n') {
            idx++
            context = context.parent!
            continue;
        }

        if (words[idx] === '*') {
            let depth = 0
            while (words[idx] === '*') {
                depth++
                idx++
            }
            let parent: WikiElement | null = null
            for (let i = context.children.length - 1; i >= 0; --i) {
                const child = context.children[i]
                if (typeof child !== 'string' && child.type === 'list') {
                    parent = child
                    break
                }
            }
            if (parent?.type === 'list' && parent?.depth === depth) {
                context = parent
                continue;
            }
            // going back down
            if (parent?.type === 'list' && depth < parent?.depth) {
                continue;
            }
            const newCtx: WikiElement = {type: 'list', children: [], parent: context, depth}
            context.children.push(newCtx)
            context = newCtx
            continue;
        }

        let word = words[idx++]
        while (words[idx] != ' ' && words[idx] !== "'" && words[idx] !== '*' &&  words[idx] !== '\r' && words[idx] !== '\n' && idx < words.length) {
            word += words[idx++]
        }

        let match;
        const pascalCaseRe = /([A-Z][a-z]+[A-Z][a-z][A-Za-z]+)/g
        if ((match = pascalCaseRe.exec(word))) {
            const newCtx: WikiElement = {
                type: 'link',
                children: [match[0]],
                parent: context,
                href: '/' + match[0]
            }
            if (match.index !== 0) {
                context.children.push(word.substring(0, match.index))
            }
            context.children.push(newCtx)
            if (match.index + match[0].length !== word.length) {
                context.children.push(word.substring(match.index + match[0].length))
            }
            continue;
        }
        if (isUrl(word)) {
            const newCtx: WikiElement = {type: 'link', children: [word], parent: context, href: word}
            context.children.push(newCtx)
            continue;
        }
        const last = context.children.length - 1
        if (typeof context.children[last] == 'string') {
            context.children[last] += word
        } else {
            context.children.push(word)
        }
    }
    return root
}

function renderWiki(elem: WikiElement | string): JSX.Element {
    if (typeof elem == 'string') return elem as any
    switch (elem.type) {
        case 'root':
            return elem.children.map(renderWiki) as any
        case "bold":
            return <strong>{elem.children.map(renderWiki)}</strong>
        case "italic":
            return <em>{elem.children.map(renderWiki)}</em>
        case 'link':
            if (elem.href.startsWith('/')) return <Link to={elem.href}>{elem.children.map(renderWiki)}</Link>
            return <a href={elem.href}>{elem.children.map(renderWiki)}</a>
        case "paragraph":
            return <div>{elem.children.map(renderWiki)}</div>
        case 'list':
            return <ul>{elem.children.map((x, i) => <li key={i}>{renderWiki(x)}</li>)}</ul>
        case 'hrule':
            return <hr/>
    }
}

function Paragraph({text, names}: { text: string, names: Set<string> }) {
    const parsed = parseText(text.replace("''''''", "'"), names, 0)
    return renderWiki(parsed) as any as JSX.Element
}

const splitPascal = (s: string)=> s.replace(/[a-z][A-Z]/g, s => s[0] + ' ' + s[1])


export default function Page() {
    const params = useParams<'slug'>()
    const data = useLoaderData()
    const names = useMemo(() => new Set(data.names as string[]), [data.names])

    return <div className="app">
        <h1>{splitPascal(params.slug || '')}</h1>
        <Paragraph text={data.text} names={names}/>
    </div>
}