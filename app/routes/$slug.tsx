import {Link, useLoaderData} from "@remix-run/react";
import {LinksFunction, MetaFunction, useParams} from "remix";
import {useMemo} from "react";
import styles from '../../styles/retro.css'

export async function loader({params}: any) {
    const result = await fetch('https://proxy.c2.com/wiki/remodel/pages/' + params.slug)
    const json = await result.json()
    return {date: json.date, text: json.text}
}

export const links: LinksFunction = () => [{rel: 'stylesheet', href: styles}]


const isUrl = (s: string) => {
    try {
        const url = new URL(s)
        return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
        return false
    }
}

type WikiElement =
    | { type: 'root', children: (WikiElement | string)[] }
    | { type: 'hrule', children: (WikiElement | string)[] }
    | { type: 'paragraph', children: (WikiElement | string)[] }
    | { type: 'bold', children: (WikiElement | string)[] }
    | { type: 'italic', children: (WikiElement | string)[] }
    | { type: 'link', href: string, children: (WikiElement | string)[] }
    | { type: 'list', children: (WikiElement | string)[], depth: number }

function parseLine(line: string, stack: WikiElement[], root: WikiElement) {
    let idx = 0
    line = line.trim()
    let context = stack[stack.length - 1]
    if (line.length === 0) (context ?? root).children.push({type: 'paragraph', children: []})
    if (line[0] !== '*') stack.length = 0
    if (line[0] === '*') {
        if (context?.type === 'paragraph') stack.pop()
        context = stack[stack.length- 1]
        let depth = 0;
        while (line[idx + depth] === '*') {
            depth++
        }
        idx += depth
        if (stack.length !== depth) {
            if (stack.length < depth) {
                while (stack.length < depth) {
                    const last: WikiElement = context?.children[context?.children.length - 1] as any
                    const l: WikiElement = {type: 'list', depth, children: []};
                    (last ?? root).children.push(l)
                    stack.push(l)
                }
            } else {
                const l: WikiElement = {type: 'list', depth, children: []};
                (context ?? root).children.push(l)
                stack.push(l)
            }
        }
    }
    while (idx < line.length) {
        let context: WikiElement = stack[stack.length - 1] ?? root
        if (line[idx] === '\n') stack.pop()
        if (context.type === 'root' || context.type === 'list') {
            const pg: WikiElement = {type: 'paragraph', children: []}
            context.children.push(pg)
            stack.push(pg)
            while (line[idx] === ' ' || line[idx] === '\t') {
                idx++
            }
            continue;
        }

        if (line[idx] === "'" && line.substring(idx, idx + 3) === "'''") {
            if (context.type === 'bold') {
                stack.pop()
                idx += 3
                continue;
            }
            const newCtx: WikiElement = {type: 'bold', children: []}
            context.children.push(newCtx)
            stack.push(newCtx)
            idx += 3
            continue;
        }
        if (line[idx] === "'" && line.substring(idx, idx + 2) === "''") {
            if (context.type === 'italic') {
                stack.pop()
                idx += 2
                continue;
            }
            const newCtx: WikiElement = {type: 'italic', children: []}
            context.children.push(newCtx)
            stack.push(newCtx)
            idx += 2
            continue;
        }
        if (line[idx] === '-' && line.substring(idx, idx + 4) === '----') {
            context.children.push({type: 'hrule', children: []})
            idx += 4
            continue;
        }

        let word = line[idx++]
        while (line[idx] !== ' ' && line[idx] !== "'" && line[idx] !== '*' && line[idx] !== '\r' && line[idx] !== '\n' && idx < line.length) {
            word += line[idx++]
        }

        let match;
        const pascalCaseRe = /([A-Z][a-z]+[A-Z][a-z][A-Za-z]+)/g
        if ((match = pascalCaseRe.exec(word))) {
            const newCtx: WikiElement = {
                type: 'link',
                children: [match[0]],
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
            const newCtx: WikiElement = {type: 'link', children: [word], href: word}
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
}

// A fairly dumb parser that takes a WardWiki string and turns it into a list of
// "wiki elements"
function parseText(text: string): WikiElement {
    const root: WikiElement = {type: 'root', children: []}
    const wordssplit = text.split('\r\n')
    const stack: WikiElement[] = []
    for (const words of wordssplit) {
        parseLine(words, stack, root)
    }
    return root
}

function renderWiki(elem: WikiElement | string, key?: any): JSX.Element {
    if (typeof elem == 'string') return elem as any
    switch (elem.type) {
        case 'root':
            return elem.children.map(renderWiki) as any
        case "bold":
            return <strong key={key}>{elem.children.map(renderWiki)}</strong>
        case "italic":
            return <em key={key}>{elem.children.map(renderWiki)}</em>
        case 'link':
            if (elem.href.startsWith('/')) return <Link to={elem.href}>{elem.children.map(renderWiki)}</Link>
            return <a key={key} href={elem.href}>{elem.children.map(renderWiki)}</a>
        case "paragraph":
            return <div key={key}>{elem.children.map(renderWiki)}</div>
        case 'list':
            return <ul key={key}>{elem.children
                .map((x, i) => <li key={i}>{renderWiki(x)}</li>)}</ul>
        case 'hrule':
            return <hr/>
    }
}

function Paragraph({text, names}: { text: string, names: Set<string> }) {
    const parsed = parseText(text.replace("''''''", "'"))
    return renderWiki(parsed) as any as JSX.Element
}

const splitPascal = (s: string) => s.replace(/[a-z][A-Z]/g, s => s[0] + ' ' + s[1])

export const meta: MetaFunction = (props) => {
    return { title: 'C2 Wiki - ' + splitPascal(props.params.slug || '') };
};

export default function Page() {
    const params = useParams<'slug'>()
    const data = useLoaderData()
    const names = useMemo(() => new Set(data.names as string[]), [data.names])

    return <div className="app">
        <h1>
            {splitPascal(params.slug || '')}
        </h1>
        <Paragraph text={data.text} names={names}/>
    </div>
}