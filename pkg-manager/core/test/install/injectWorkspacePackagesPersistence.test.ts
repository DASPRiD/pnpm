import path from 'path'
import { assertProject } from '@pnpm/assert-project'
import { type MutatedProject, mutateModules, type ProjectOptions } from '@pnpm/core'
import { preparePackages } from '@pnpm/prepare'
import { type ProjectRootDir } from '@pnpm/types'
import { testDefaults } from '../utils/index.js'

test('workspace packages should use file: protocol from the start when injectWorkspacePackages is true', async () => {
  const projectAManifest = {
    name: 'a',
    version: '1.0.0',
    dependencies: {
      'b': 'workspace:*',
    },
  }
  const projectBManifest = {
    name: 'b',
    version: '1.0.0',
  }

  preparePackages([
    {
      location: 'a',
      package: projectAManifest,
    },
    {
      location: 'b',
      package: projectBManifest,
    },
  ])

  const importers: MutatedProject[] = [
    {
      mutation: 'install',
      rootDir: path.resolve('a') as ProjectRootDir,
    },
    {
      mutation: 'install',
      rootDir: path.resolve('b') as ProjectRootDir,
    },
  ]
  const allProjects: ProjectOptions[] = [
    {
      buildIndex: 0,
      manifest: projectAManifest,
      rootDir: path.resolve('a') as ProjectRootDir,
    },
    {
      buildIndex: 0,
      manifest: projectBManifest,
      rootDir: path.resolve('b') as ProjectRootDir,
    },
  ]

  // Initial install with injectWorkspacePackages: true
  await mutateModules(importers, testDefaults({
    allProjects,
    injectWorkspacePackages: true,
  }))

  const rootModules = assertProject(process.cwd())
  const lockfile = rootModules.readLockfile()

  // Verify that workspace package uses file: protocol from the start
  expect(lockfile.packages['b@file:b']).toBeDefined()
  expect(lockfile.packages['b@file:b']).toEqual({
    resolution: {
      directory: 'b',
      type: 'directory',
    },
  })

  // Now remove and add a regular dependency in package a
  await mutateModules([
    {
      mutation: 'installSome',
      dependencyNames: ['is-positive'],
      rootDir: path.resolve('a') as ProjectRootDir,
    },
  ], testDefaults({
    allProjects,
    injectWorkspacePackages: true,
  }))

  // Add the dependency
  projectAManifest.dependencies['is-positive'] = '1.0.0'
  await mutateModules([
    {
      mutation: 'install',
      rootDir: path.resolve('a') as ProjectRootDir,
    },
  ], testDefaults({
    allProjects,
    injectWorkspacePackages: true,
  }))

  const lockfileAfterAdd = rootModules.readLockfile()

  // Verify workspace package still uses file: protocol
  expect(lockfileAfterAdd.packages['b@file:b']).toBeDefined()
  expect(lockfileAfterAdd.packages['b@file:b']).toEqual({
    resolution: {
      directory: 'b',
      type: 'directory',
    },
  })

  // Now remove the dependency
  delete projectAManifest.dependencies['is-positive']
  await mutateModules([
    {
      mutation: 'uninstallSome',
      dependencyNames: ['is-positive'],
      rootDir: path.resolve('a') as ProjectRootDir,
    },
  ], testDefaults({
    allProjects,
    injectWorkspacePackages: true,
  }))

  const lockfileAfterRemove = rootModules.readLockfile()

  // Verify workspace package STILL uses file: protocol (not changed to link:)
  expect(lockfileAfterRemove.packages['b@file:b']).toBeDefined()
  expect(lockfileAfterRemove.packages['b@file:b']).toEqual({
    resolution: {
      directory: 'b',
      type: 'directory',
    },
  })

  // Verify no link: protocol exists for package b
  expect(Object.keys(lockfileAfterRemove.packages ?? {}).find(key => key.startsWith('b@link:'))).toBeUndefined()
})
