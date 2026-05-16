export interface UserPromptOverride {
  id: string;
  content: string;
  updatedAt: number;
}

const STORAGE_KEY = 'moyuan_prompt_overrides';

export function getUserOverrides(): Record<string, UserPromptOverride> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function setUserOverride(id: string, content: string): void {
  const overrides = getUserOverrides();
  overrides[id] = { id, content, updatedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function removeUserOverride(id: string): void {
  const overrides = getUserOverrides();
  delete overrides[id];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function getUserOverrideContent(id: string): string | null {
  const overrides = getUserOverrides();
  return overrides[id]?.content ?? null;
}

export function hasUserOverride(id: string): boolean {
  const overrides = getUserOverrides();
  return id in overrides;
}

export function clearAllUserOverrides(): void {
  localStorage.removeItem(STORAGE_KEY);
}
