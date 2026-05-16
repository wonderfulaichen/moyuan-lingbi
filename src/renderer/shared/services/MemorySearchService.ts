import { AtomicMemory } from '../../../shared/types';

export type MemoryType = 'character' | 'plot' | 'worldRule' | 'worldLocation' | 'worldHistory' | 'all';

export interface SearchResult {
  id: string;
  type: MemoryType;
  title: string;
  description: string;
  tags: string[];
  lastUpdated: number;
  relevanceScore: number;
  isFavorite: boolean;
  data: unknown;
}

export interface FilterOptions {
  types: MemoryType[];
  onlyFavorites: boolean;
}

export type SortOption = 'relevance' | 'recent' | 'name';

export interface Favorite {
  projectId: string;
  memoryType: MemoryType;
  memoryId: string;
  addedAt: number;
}

const FAVORITES_STORAGE_KEY = 'memory-favorites';

function loadFavorites(): Favorite[] {
  try {
    const data = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveFavorites(favorites: Favorite[]): void {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
}

function isFavorite(projectId: string, memoryType: MemoryType, memoryId: string): boolean {
  const favorites = loadFavorites();
  return favorites.some(f => f.projectId === projectId && f.memoryType === memoryType && f.memoryId === memoryId);
}

function calculateRelevance(text: string, query: string): number {
  if (!query.trim()) return 1;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  let score = 0;
  if (lowerText.includes(lowerQuery)) score += 10;
  if (lowerText.startsWith(lowerQuery)) score += 5;
  
  const words = lowerQuery.split(/\s+/).filter(w => w);
  for (const word of words) {
    if (lowerText.includes(word)) score += 3;
  }
  
  return score;
}

export const MemorySearchService = {
  searchMemories(atomic: AtomicMemory, query: string): SearchResult[] {
    const results: SearchResult[] = [];
    const searchQuery = query.trim();

    atomic.characters.forEach(char => {
      const searchText = `${char.name} ${char.identity} ${char.personality.join(' ')} ${char.abilities.join(' ')}`;
      const relevance = calculateRelevance(searchText, searchQuery);
      if (relevance > 0 || !searchQuery) {
        results.push({
          id: char.id,
          type: 'character',
          title: char.name,
          description: char.identity || '',
          tags: char.personality,
          lastUpdated: atomic.lastUpdated,
          relevanceScore: relevance,
          isFavorite: false,
          data: char,
        });
      }
    });

    atomic.plots.forEach(plot => {
      const searchText = `${plot.description} ${plot.involvedCharacters.join(' ')}`;
      const relevance = calculateRelevance(searchText, searchQuery);
      if (relevance > 0 || !searchQuery) {
        results.push({
          id: plot.id,
          type: 'plot',
          title: plot.description.length > 50 ? `${plot.description.slice(0, 50)}...` : plot.description,
          description: plot.description,
          tags: [plot.type, plot.status],
          lastUpdated: atomic.lastUpdated,
          relevanceScore: relevance,
          isFavorite: false,
          data: plot,
        });
      }
    });

    atomic.world.rules.forEach((rule, index) => {
      const relevance = calculateRelevance(rule, searchQuery);
      if (relevance > 0 || !searchQuery) {
        results.push({
          id: `world-rule-${index}`,
          type: 'worldRule',
          title: rule.length > 50 ? `${rule.slice(0, 50)}...` : rule,
          description: rule,
          tags: ['规则'],
          lastUpdated: atomic.lastUpdated,
          relevanceScore: relevance,
          isFavorite: false,
          data: rule,
        });
      }
    });

    atomic.world.geography.forEach((geo, index) => {
      const relevance = calculateRelevance(geo, searchQuery);
      if (relevance > 0 || !searchQuery) {
        results.push({
          id: `world-geo-${index}`,
          type: 'worldLocation',
          title: geo,
          description: geo,
          tags: ['地理'],
          lastUpdated: atomic.lastUpdated,
          relevanceScore: relevance,
          isFavorite: false,
          data: geo,
        });
      }
    });

    atomic.world.history.forEach((hist, index) => {
      const relevance = calculateRelevance(hist, searchQuery);
      if (relevance > 0 || !searchQuery) {
        results.push({
          id: `world-history-${index}`,
          type: 'worldHistory',
          title: hist.length > 50 ? `${hist.slice(0, 50)}...` : hist,
          description: hist,
          tags: ['历史'],
          lastUpdated: atomic.lastUpdated,
          relevanceScore: relevance,
          isFavorite: false,
          data: hist,
        });
      }
    });

    if (atomic.world.cosmology) {
      const relevance = calculateRelevance(atomic.world.cosmology, searchQuery);
      if (relevance > 0 || !searchQuery) {
        results.push({
          id: 'world-cosmology',
          type: 'worldRule',
          title: '力量体系',
          description: atomic.world.cosmology,
          tags: ['力量体系'],
          lastUpdated: atomic.lastUpdated,
          relevanceScore: relevance,
          isFavorite: false,
          data: atomic.world.cosmology,
        });
      }
    }

    return results;
  },

  filterMemories(results: SearchResult[], filters: FilterOptions): SearchResult[] {
    return results.filter(result => {
      if (filters.types.length > 0 && !filters.types.includes('all') && !filters.types.includes(result.type)) {
        return false;
      }
      return true;
    });
  },

  sortMemories(results: SearchResult[], sortBy: SortOption): SearchResult[] {
    return [...results].sort((a, b) => {
      switch (sortBy) {
        case 'relevance':
          return b.relevanceScore - a.relevanceScore;
        case 'recent':
          return b.lastUpdated - a.lastUpdated;
        case 'name':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });
  },

  recommendRelatedMemories(atomic: AtomicMemory, currentId: string): SearchResult[] {
    const currentChar = atomic.characters.find(c => c.id === currentId);
    if (currentChar) {
      const relatedCharacterIds = currentChar.relationships.map(r => r.targetId);
      return atomic.characters
        .filter(c => relatedCharacterIds.includes(c.id))
        .map(char => ({
          id: char.id,
          type: 'character' as MemoryType,
          title: char.name,
          description: char.identity || '',
          tags: char.personality,
          lastUpdated: atomic.lastUpdated,
          relevanceScore: 8,
          isFavorite: false,
          data: char,
        }));
    }

    const currentPlot = atomic.plots.find(p => p.id === currentId);
    if (currentPlot) {
      return atomic.characters
        .filter(c => currentPlot.involvedCharacters.includes(c.id) || currentPlot.involvedCharacters.includes(c.name))
        .map(char => ({
          id: char.id,
          type: 'character' as MemoryType,
          title: char.name,
          description: char.identity || '',
          tags: char.personality,
          lastUpdated: atomic.lastUpdated,
          relevanceScore: 7,
          isFavorite: false,
          data: char,
        }));
    }

    return [];
  },

  toggleFavorite(projectId: string, memoryType: MemoryType, memoryId: string): boolean {
    const favorites = loadFavorites();
    const index = favorites.findIndex(f => f.projectId === projectId && f.memoryType === memoryType && f.memoryId === memoryId);
    
    if (index >= 0) {
      favorites.splice(index, 1);
      saveFavorites(favorites);
      return false;
    } else {
      favorites.push({ projectId, memoryType, memoryId, addedAt: Date.now() });
      saveFavorites(favorites);
      return true;
    }
  },

  getFavorites(projectId: string): Favorite[] {
    return loadFavorites().filter(f => f.projectId === projectId);
  },

  isFavorite,
};
