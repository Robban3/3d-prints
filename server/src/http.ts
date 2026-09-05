/**
 * Express 5 typar sökvägsparametrar som `string | string[]`, eftersom en
 * wildcard-parameter kan matcha flera segment. Våra rutter har bara enkla
 * parametrar, så allt annat än en sträng behandlas som ingen träff alls.
 */
export function pathParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}
