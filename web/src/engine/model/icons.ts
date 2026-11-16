// SPDX-License-Identifier: GPL-3.0-only
// Built-in icon registry (IR v9 namespace, FILE-FORMAT §3.1): the portable,
// offline set every PanelCraft build ships. Names, human labels, categories and
// search keywords live here because *format* validation has to know the
// reserved namespace (a document icon may not shadow a built-in), while the
// path geometry lives in engine/render/icons.ts (one entry per
// web/assets/icons/<name>.svg source).
//
// Provenance and licensing for every asset: docs/ICONS.md — all originals,
// drawn in-repo, GPL-3.0-only, no third-party or vendor artwork (ADR-0005).
// No icon font, no CDN, no network: adding an icon means adding a local file.

export type IconCategory =
  | 'compute'
  | 'storage'
  | 'network'
  | 'security'
  | 'platform'
  | 'ops'
  | 'data'
  | 'client'
  | 'concept';

export interface BuiltinIcon {
  /** Handle used by `icon name` (and reserved against project icons). */
  name: string;
  /** Human label shown in the picker. */
  label: string;
  category: IconCategory;
  /** Extra search terms (technology-neutral, lowercase). */
  keywords: readonly string[];
}

/** Built-in icons, in picker order (grouped by category, then alphabetical). */
export const BUILTIN_ICONS: readonly BuiltinIcon[] = [
  { name: 'server', label: 'Server', category: 'compute', keywords: ['host', 'vm', 'compute', 'machine'] },
  { name: 'container', label: 'Container', category: 'compute', keywords: ['docker', 'pod', 'image'] },
  { name: 'cluster', label: 'Cluster', category: 'compute', keywords: ['kubernetes', 'nodes', 'fleet'] },
  { name: 'function', label: 'Function', category: 'compute', keywords: ['lambda', 'serverless', 'faas'] },
  { name: 'gear', label: 'Service', category: 'compute', keywords: ['service', 'process', 'worker', 'engine'] },

  { name: 'database', label: 'Database', category: 'storage', keywords: ['sql', 'rdbms', 'table', 'store'] },
  { name: 'cache', label: 'Cache', category: 'storage', keywords: ['redis', 'memcached', 'memory'] },
  { name: 'storage', label: 'Object storage', category: 'storage', keywords: ['bucket', 'blob', 's3', 'disk'] },
  { name: 'backup', label: 'Backup', category: 'storage', keywords: ['archive', 'snapshot', 'restore'] },
  { name: 'folder', label: 'Folder', category: 'storage', keywords: ['directory', 'files'] },

  { name: 'cloud', label: 'Cloud', category: 'network', keywords: ['internet', 'public', 'saas'] },
  { name: 'cdn', label: 'CDN', category: 'network', keywords: ['edge', 'cache', 'distribution'] },
  { name: 'network', label: 'Network', category: 'network', keywords: ['vpc', 'subnet', 'topology'] },
  { name: 'loadbalancer', label: 'Load balancer', category: 'network', keywords: ['lb', 'proxy', 'ingress'] },
  { name: 'gateway', label: 'Gateway', category: 'network', keywords: ['api gateway', 'ingress', 'edge'] },
  { name: 'proxy', label: 'Proxy', category: 'network', keywords: ['reverse proxy', 'forward', 'sidecar'] },
  { name: 'queue', label: 'Queue', category: 'network', keywords: ['mq', 'broker', 'kafka', 'sqs'] },
  { name: 'stream', label: 'Event stream', category: 'network', keywords: ['kafka', 'events', 'pubsub', 'log'] },

  { name: 'lock', label: 'Lock', category: 'security', keywords: ['locked', 'private', 'secure'] },
  { name: 'shield', label: 'Firewall', category: 'security', keywords: ['waf', 'security', 'protect'] },
  { name: 'key', label: 'Key / secret', category: 'security', keywords: ['credential', 'token', 'vault', 'password'] },
  { name: 'certificate', label: 'Certificate', category: 'security', keywords: ['tls', 'ssl', 'trust'] },

  { name: 'browser', label: 'Browser', category: 'client', keywords: ['web', 'spa', 'frontend', 'ui'] },
  { name: 'mobile', label: 'Mobile app', category: 'client', keywords: ['ios', 'android', 'phone', 'client'] },
  { name: 'user', label: 'User', category: 'client', keywords: ['person', 'actor', 'customer'] },
  { name: 'users', label: 'User group', category: 'client', keywords: ['team', 'people', 'audience'] },

  { name: 'api', label: 'API', category: 'platform', keywords: ['endpoint', 'rest', 'contract', 'interface'] },
  { name: 'mail', label: 'Email', category: 'platform', keywords: ['smtp', 'notification', 'message'] },
  { name: 'code', label: 'Code', category: 'platform', keywords: ['source', 'module', 'repository'] },
  { name: 'git', label: 'Repository', category: 'platform', keywords: ['git', 'vcs', 'branch', 'source control'] },
  { name: 'package', label: 'Package', category: 'platform', keywords: ['library', 'artifact', 'dependency', 'bundle'] },
  { name: 'terminal', label: 'Terminal', category: 'platform', keywords: ['shell', 'cli', 'command'] },

  { name: 'monitor', label: 'Monitoring', category: 'ops', keywords: ['metrics', 'observability', 'health', 'pulse'] },
  { name: 'logs', label: 'Logs', category: 'ops', keywords: ['logging', 'trace', 'records'] },
  { name: 'alert', label: 'Alert', category: 'ops', keywords: ['alarm', 'warning', 'incident', 'pager'] },
  { name: 'deploy', label: 'Deploy', category: 'ops', keywords: ['release', 'ci', 'cd', 'pipeline', 'ship'] },
  { name: 'workflow', label: 'Workflow', category: 'ops', keywords: ['orchestration', 'dag', 'steps', 'job'] },
  { name: 'clock', label: 'Scheduler', category: 'ops', keywords: ['cron', 'time', 'batch', 'timer'] },

  { name: 'chart', label: 'Analytics', category: 'data', keywords: ['metrics', 'report', 'business intelligence'] },
  { name: 'search', label: 'Search', category: 'data', keywords: ['index', 'query', 'find', 'elastic'] },

  { name: 'document', label: 'Document', category: 'concept', keywords: ['file', 'record', 'report'] },
  { name: 'external', label: 'External system', category: 'concept', keywords: ['third party', 'vendor', 'outside'] },
  { name: 'group', label: 'Group box', category: 'concept', keywords: ['boundary', 'context', 'domain'] },
];

/** Reserved handles — a project icon may not reuse one (validation P207). */
export const BUILTIN_ICON_NAMES: ReadonlySet<string> = new Set(BUILTIN_ICONS.map((i) => i.name));

/** `true` when `name` names a built-in icon. */
export const isBuiltinIcon = (name: string): boolean => BUILTIN_ICON_NAMES.has(name);

/** Registry entry for `name`, or `undefined` for a project/unknown handle. */
export const builtinIcon = (name: string): BuiltinIcon | undefined =>
  BUILTIN_ICONS.find((i) => i.name === name);

/** Search the built-in set by label, handle and keywords (picker filter). */
export function searchBuiltinIcons(query: string): BuiltinIcon[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...BUILTIN_ICONS];
  return BUILTIN_ICONS.filter(
    (i) =>
      i.name.includes(q) ||
      i.label.toLowerCase().includes(q) ||
      i.category.includes(q) ||
      i.keywords.some((k) => k.includes(q)),
  );
}
