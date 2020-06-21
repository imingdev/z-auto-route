
import { parseComponent } from 'vue-template-compiler'
import { NestedMap, setToMap } from './nested-map'

export interface PageMeta {
  name: string
  chunkName: string
  specifier: string
  path: string
  pathSegments: string[]
  component: string
  children?: PageMeta[]
  routeMeta?: any
  route?: any
}

const routeBlockName = 'tz-route'

export function resolveRoutePaths(
  layoutPaths: string[],
  paths: string[],
  importPrefix: string,
  layout: string,
  readFile: (path: string) => string
): PageMeta[] {
  const map: NestedMap<string[]> = {}

  const splitedLayouts = layoutPaths.map((p) => p.split('/'))
  splitedLayouts.forEach((path) => {
    setToMap(map, pathToMapPath(path.slice(0, path.length - 1)), path)
  })

  const splitted = paths.map((p) => p.split('/'))
  splitted.forEach((path) => {
    if (hasRouteBlock(path, readFile)) {
      setToMap(map, pathToMapPath(path), path)
    }
  })

  return pathMapToMeta(map, importPrefix, readFile, 0, layout)
}

// 获取自定义标签内容
function getRouteBlock(path: string[], readFile: (path: string) => string) {
  const content = readFile(path.join('/'))
  const parsed = parseComponent(content, {
    pad: 'space',
  })
  return parsed.customBlocks.find(
    (b) => b.type === routeBlockName
  )
}

function hasRouteBlock(path: string[], readFile: (path: string) => string) {
  const routeBlock = getRouteBlock(path, readFile)
  return routeBlock && tryParseCustomBlock(routeBlock.content, path, routeBlockName)
}

function pathMapToMeta(
  map: NestedMap<string[]>,
  importPrefix: string,
  readFile: (path: string) => string,
  parentDepth: number = 0,
  layout: string,
): PageMeta[] {
  if (map.value) {
    const path = map.value

    const meta: PageMeta = {
      name: pathToName(path),
      chunkName: pathToChunkName(path),
      specifier: pathToSpecifier(path),
      path: pathToRoute(path, parentDepth, layout),
      pathSegments: toActualPath(path, layout),
      component: importPrefix + path.join('/'),
    }

    const routeBlock = getRouteBlock(path, readFile)
    if (routeBlock) {
      meta.route = tryParseCustomBlock(routeBlock.content, path, routeBlockName)
    }

    if (map.children) {
      meta.children = pathMapChildrenToMeta(
        map.children,
        importPrefix,
        readFile,
        meta.pathSegments.length,
        layout
      )
    }

    return [meta]
  }

  return map.children
    ? pathMapChildrenToMeta(
      map.children,
      importPrefix,
      readFile,
      parentDepth,
      layout
    )
    : []
}

function routePathComparator(a: string[], b: string[]): number {
  const a0 = a[0]
  const b0 = b[0]

  if (!a0 || !b0) {
    return a.length - b.length
  }

  const aOrder = isDynamicRoute(a0) ? 1 : 0
  const bOrder = isDynamicRoute(b0) ? 1 : 0
  const order = aOrder - bOrder

  return order !== 0 ? order : routePathComparator(a.slice(1), b.slice(1))
}

function pathMapChildrenToMeta(
  children: Map<string, NestedMap<string[]>>,
  importPrefix: string,
  readFile: (path: string) => string,
  parentDepth: number,
  layout: string
): PageMeta[] {
  return Array.from(children.values())
    .reduce<PageMeta[]>((acc, value) => {
      return acc.concat(
        pathMapToMeta(value, importPrefix, readFile, parentDepth, layout)
      )
    }, [])
    .sort((a, b) => {
      return routePathComparator(a.pathSegments, b.pathSegments)
    })
}

function tryParseCustomBlock(
  content: string,
  filePath: string[],
  blockName: string
): any {
  try {
    return JSON.parse(content)
  } catch (err) {
    const joinedPath = filePath.join('/')
    console.error(`Invalid json format of <${blockName}> content in ${joinedPath}\n`)
  }
}

function isDynamicRoute(segment: string): boolean {
  return segment[0] === ':'
}

function isOmittable(segment: string): boolean {
  return segment === 'index'
}

function toActualPath(segments: string[], layout?: string): string[] {
  const lastIndex = segments.length - 1
  const last = segments[lastIndex] === layout ? '' : basename(segments[lastIndex])
  segments = segments.slice(0, -1).concat(last)
  return segments
    .filter((s) => !isOmittable(s))
    .map((s, i) => {
      if (s[0] === '_') {
        const suffix = lastIndex === i ? '?' : ''
        return ':' + s.slice(1) + suffix
      } else {
        return s
      }
    })
    .filter(item => !!item)
}

function pathToMapPath(segments: string[]): string[] {
  const last = segments[segments.length - 1]
  return segments.slice(0, -1).concat(basename(last))
}

function pathToName(segments: string[]): string {
  const last = segments[segments.length - 1]
  segments = segments
    .slice(0, -1)
    .concat(basename(last))
    .filter((s) => !isOmittable(s))

  if (segments.length === 0) {
    return 'index'
  }

  return segments
    .map((s) => {
      return s[0] === '_' ? s.slice(1) : s
    })
    .join('-')
}

function pathToChunkName(segments: string[]): string {
  const last = segments[segments.length - 1]
  segments = segments.slice(0, -1).concat(basename(last))

  return segments
    .map((s) => {
      return s[0] === '_' ? s.slice(1) : s
    })
    .join('-')
}

function pathToSpecifier(segments: string[]): string {
  const last = segments[segments.length - 1]
  const replaced = segments
    .slice(0, -1)
    .concat(basename(last))
    .join('_')
    .replace(/[^a-zA-Z0-9]/g, '_')

  return /^\d/.test(replaced) ? '_' + replaced : replaced
}

function pathToRoute(
  segments: string[],
  parentDepth: number,
  layout: string
): string {
  const prefix = parentDepth > 0 ? '' : '/'
  return prefix + toActualPath(segments, layout).slice(parentDepth).join('/')
}

function basename(filename: string): string {
  return filename.replace(/\.[^.]+$/g, '')
}