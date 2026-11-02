import type { ModelInfo } from '../shared/models';

export const CATALOG_TTL_MS = 60 * 60 * 1000;

const PAGE_SIZE = 100;

const MAX_PAGES = 10;

const TEXT_GENERATION = 'Text Generation';

export type CatalogEntry = ModelInfo & {
  readonly reasoning: boolean;
  readonly tools: boolean;
  readonly createdAt: string;
  readonly beta: boolean;
};

export type StoredCatalog = {
  readonly entries: readonly CatalogEntry[];
  readonly fetchedAt: number;
};

type Property = { readonly property_id?: unknown; readonly value?: unknown };

type SearchResult = {
  readonly name?: unknown;
  readonly created_at?: unknown;
  readonly properties?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const propertiesOf = (result: SearchResult): ReadonlyMap<string, unknown> =>
  new Map(
    (Array.isArray(result.properties) ? result.properties : [])
      .filter(isRecord)
      .flatMap((each: Property) =>
        typeof each.property_id === 'string' ? [[each.property_id, each.value] as const] : [],
      ),
  );

const flag = (value: unknown) => value === true || value === 'true';

const priceFor = (value: unknown, unit: string): number => {
  if (!Array.isArray(value)) return 0;

  const match = value.find((each) => isRecord(each) && each.unit === unit);

  return isRecord(match) && typeof match.price === 'number' ? match.price : 0;
};

const labelOf = (id: string): string => {
  const tail = id.split('/').pop() ?? id;

  return tail
    .split('-')
    .map((word) => (/^[a-z]/.test(word) ? word[0]?.toUpperCase() + word.slice(1) : word))
    .join(' ');
};

export const catalogEntry = (result: SearchResult): CatalogEntry | null => {
  if (typeof result.name !== 'string' || !result.name.startsWith('@cf/')) return null;

  const properties = propertiesOf(result);
  const context = Number(properties.get('context_window') ?? 0);
  const price = properties.get('price');

  if (!Number.isFinite(context) || context <= 0) return null;

  return {
    id: result.name,
    label: labelOf(result.name),
    context,
    inputPerMtok: priceFor(price, 'per M input tokens'),
    outputPerMtok: priceFor(price, 'per M output tokens'),
    vision: flag(properties.get('vision')),
    reasoning: flag(properties.get('reasoning')),
    tools: flag(properties.get('function_calling')),
    beta: flag(properties.get('beta')),
    createdAt: typeof result.created_at === 'string' ? result.created_at : '',
  };
};

const isCatalogEntry = (value: unknown): value is CatalogEntry =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.label === 'string' &&
  typeof value.context === 'number' &&
  typeof value.inputPerMtok === 'number' &&
  typeof value.outputPerMtok === 'number' &&
  typeof value.vision === 'boolean' &&
  typeof value.reasoning === 'boolean' &&
  typeof value.tools === 'boolean' &&
  typeof value.beta === 'boolean' &&
  typeof value.createdAt === 'string';

export const parseStoredEntries = (raw: string): readonly CatalogEntry[] => {
  const parsed: unknown = JSON.parse(raw);

  return Array.isArray(parsed) ? parsed.filter(isCatalogEntry) : [];
};

export const usableForAgents = (entry: CatalogEntry): boolean => entry.tools;

const searchUrl = (accountId: string, page: number) => {
  const url = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search`,
  );

  url.searchParams.set('task', TEXT_GENERATION);
  url.searchParams.set('per_page', String(PAGE_SIZE));
  url.searchParams.set('page', String(page));

  return url;
};

export const fetchCatalog = async (
  accountId: string,
  token: string,
  send: typeof fetch = fetch,
): Promise<readonly CatalogEntry[]> => {
  const entries: CatalogEntry[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await send(searchUrl(accountId, page), {
      headers: { authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error(`Workers AI catalog returned ${response.status}`);

    const body: unknown = await response.json();

    if (!isRecord(body) || !Array.isArray(body.result))
      throw new Error(`Workers AI catalog returned no result list (${response.status})`);

    const results = body.result;

    for (const result of results) {
      const entry = isRecord(result) ? catalogEntry(result) : null;

      if (entry !== null && usableForAgents(entry)) entries.push(entry);
    }

    if (results.length < PAGE_SIZE) break;
  }

  if (entries.length === 0) throw new Error('Workers AI catalog returned no models with tool use');

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const isFresh = (stored: StoredCatalog | null, now: number): boolean =>
  stored !== null && stored.entries.length > 0 && now - stored.fetchedAt < CATALOG_TTL_MS;

export const mergeCatalog = (
  pinned: readonly ModelInfo[],
  live: readonly CatalogEntry[],
): readonly ModelInfo[] => {
  const pinnedIds = new Set(pinned.map((each) => each.id));

  return [...pinned, ...live.filter((each) => !pinnedIds.has(each.id))];
};

export type CatalogSource = {
  readonly stored: () => Promise<StoredCatalog | null>;
  readonly save: (catalog: StoredCatalog) => Promise<void>;
  readonly fetchLive: () => Promise<readonly CatalogEntry[]>;
  readonly now: () => number;
};

export const loadCatalog = async (source: CatalogSource): Promise<StoredCatalog> => {
  const stored = await source.stored();
  const now = source.now();

  if (stored !== null && isFresh(stored, now)) return stored;

  try {
    const fresh = { entries: await source.fetchLive(), fetchedAt: now };

    await source.save(fresh);

    return fresh;
  } catch (cause) {
    if (stored !== null && stored.entries.length > 0) return stored;

    throw cause;
  }
};
