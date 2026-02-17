export default function() {
  // BASE_URL can be set to the subpath where the site is hosted, e.g. '/presentaties'
  // If not set, defaults to empty string which will still produce absolute paths
  // like '/css/...' when concatenated below.
  const env = process.env.BASE_URL || process.env.BASEPATH || '';
  let base = env || '';
  if (base && !base.startsWith('/')) base = '/' + base;
  if (base.endsWith('/')) base = base.slice(0, -1);
  return {
    baseUrl: base
  };
}
