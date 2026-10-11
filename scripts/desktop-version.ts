/** Replace the first version field while allowing both LF and CRLF source files. */
export function stampVersion(
  source: string,
  pattern: RegExp,
  version: string,
  file: string,
): string {
  const match = pattern.exec(source);
  if (!match) throw new Error(`Could not find a version field in ${file}`);
  return source.replace(pattern, (_value, prefix: string, quote: string) => `${prefix}${quote}${version}${quote}`);
}
