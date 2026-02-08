export function depPathToRef (
  depPath: string,
  opts: {
    alias: string
    realName: string
  }
): string {
  const result = opts.alias === opts.realName && depPath.startsWith(`${opts.realName}@`)
    ? depPath.substring(opts.realName.length + 1)
    : depPath

  if (depPath.includes('file:') || depPath.includes('link:')) {
    console.log('=== depPathToRef ===')
    console.log('depPath:', depPath)
    console.log('alias:', opts.alias)
    console.log('realName:', opts.realName)
    console.log('result:', result)
    console.log('====================')
  }

  return result
}
