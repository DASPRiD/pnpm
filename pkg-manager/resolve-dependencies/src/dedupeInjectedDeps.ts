import path from 'path'
import normalize from 'normalize-path'
import { type PkgResolutionId, type DepPath } from '@pnpm/types'
import { type ResolvedDirectDependency, type ResolvedImporters } from './resolveDependencyTree.js'
import { type NodeId } from './nextNodeId.js'
import { type LinkedDependency } from './resolveDependencies.js'
import {
  type GenericDependenciesGraphWithResolvedChildren,
  type DependenciesByProjectId,
  type PartialResolvedPackage,
  type ProjectToResolve,
} from './resolvePeers.js'

export interface DedupeInjectedDepsOptions<T extends PartialResolvedPackage> {
  depGraph: GenericDependenciesGraphWithResolvedChildren<T>
  dependenciesByProjectId: DependenciesByProjectId
  lockfileDir: string
  pathsByNodeId: Map<NodeId, DepPath>
  projects: ProjectToResolve[]
  resolvedImporters: ResolvedImporters
}

export function dedupeInjectedDeps<T extends PartialResolvedPackage> (
  opts: DedupeInjectedDepsOptions<T>
): void {
  const injectedDepsByProjects = getInjectedDepsByProjects(opts)
  const dedupeMap = getDedupeMap(injectedDepsByProjects, opts)
  applyDedupeMap(dedupeMap, opts)
}

type InjectedDepsByProjects = Map<string, Map<string, { depPath: DepPath, id: string }>>

function getInjectedDepsByProjects<T extends PartialResolvedPackage> (
  opts: Pick<DedupeInjectedDepsOptions<T>, 'projects' | 'pathsByNodeId' | 'depGraph' | 'resolvedImporters'>
): InjectedDepsByProjects {
  console.log('=== getInjectedDepsByProjects: project IDs ===')
  for (const proj of opts.projects) {
    console.log('  Project ID:', proj.id)
  }
  console.log('=== resolvedImporters keys ===')
  for (const key of Object.keys(opts.resolvedImporters)) {
    console.log('  Importer:', key)
  }
  console.log('==============================================')

  const injectedDepsByProjects = new Map<string, Map<string, { depPath: DepPath, id: string }>>()
  for (const project of opts.projects) {
    for (const [alias, nodeId] of project.directNodeIdsByAlias.entries()) {
      const depPath = opts.pathsByNodeId.get(nodeId)!
      console.log('=== getInjectedDepsByProjects ===')
      console.log('Project:', project.id)
      console.log('Alias:', alias)
      console.log('nodeId:', nodeId)
      console.log('depPath:', depPath)
      console.log('depGraph[depPath].id:', opts.depGraph[depPath].id)
      console.log('startsWith file:', opts.depGraph[depPath].id.startsWith('file:'))
      if (!opts.depGraph[depPath].id.startsWith('file:')) continue
      const id = opts.depGraph[depPath].id.substring(5)
      console.log('Extracted id:', id)
      console.log('Is workspace package (old logic):', opts.projects.some((project) => project.id === id))
      console.log('Check against resolvedImporters:', id in opts.resolvedImporters)
      console.log('=================================')
      // FIX: Check against all resolved importers (all workspace packages), not just the current projects
      // This fixes the issue where pnpm rm in a specific package doesn't include all workspace packages in opts.projects
      if (id in opts.resolvedImporters) {
        if (!injectedDepsByProjects.has(project.id)) injectedDepsByProjects.set(project.id, new Map())
        injectedDepsByProjects.get(project.id)!.set(alias, { depPath, id })
      }
    }
  }
  return injectedDepsByProjects
}

type DedupeMap = Map<string, Map<string, string>>

function getDedupeMap<T extends PartialResolvedPackage> (
  injectedDepsByProjects: InjectedDepsByProjects,
  opts: Pick<DedupeInjectedDepsOptions<T>, 'depGraph' | 'dependenciesByProjectId'>
): DedupeMap {
  const toDedupe = new Map<string, Map<string, string>>()
  for (const [id, deps] of injectedDepsByProjects.entries()) {
    const dedupedInjectedDeps = new Map<string, string>()
    for (const [alias, dep] of deps.entries()) {
      // Check for subgroup not equal.
      // The injected project in the workspace may have dev deps
      const isSubset = Object.entries(opts.depGraph[dep.depPath].children)
        .every(([alias, depPath]) => opts.dependenciesByProjectId[dep.id].get(alias) === depPath)
      console.log('=== getDedupeMap ===')
      console.log('Project:', id)
      console.log('Alias:', alias)
      console.log('depPath:', dep.depPath)
      console.log('isSubset:', isSubset)
      console.log('children:', Object.entries(opts.depGraph[dep.depPath].children))
      console.log('====================')
      if (isSubset) {
        dedupedInjectedDeps.set(alias, dep.id)
      }
    }
    toDedupe.set(id, dedupedInjectedDeps)
  }
  return toDedupe
}

function applyDedupeMap<T extends PartialResolvedPackage> (
  dedupeMap: DedupeMap,
  opts: Pick<DedupeInjectedDepsOptions<T>, 'dependenciesByProjectId' | 'resolvedImporters' | 'lockfileDir'>
): void {
  for (const [id, aliases] of dedupeMap.entries()) {
    for (const [alias, dedupedProjectId] of aliases.entries()) {
      opts.dependenciesByProjectId[id].delete(alias)
      const index = opts.resolvedImporters[id].directDependencies.findIndex((dep) => dep.alias === alias)
      const prev = opts.resolvedImporters[id].directDependencies[index]
      const linkedDep: LinkedDependency & ResolvedDirectDependency = {
        ...prev,
        pkg: prev,
        isLinkedDependency: true,
        pkgId: `link:${normalize(path.relative(id, dedupedProjectId))}` as PkgResolutionId,
        resolution: {
          type: 'directory',
          directory: path.join(opts.lockfileDir, dedupedProjectId),
        },
      }
      opts.resolvedImporters[id].directDependencies[index] = linkedDep
      opts.resolvedImporters[id].linkedDependencies.push(linkedDep)
    }
  }
}
