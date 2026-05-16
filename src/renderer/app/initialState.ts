import { AppState } from '../../shared/types';
import { INITIAL_MODELS } from '../../shared/constants';
import { getPromptLibrary } from '../../shared/prompts';

export const INITIAL_APP_STATE: AppState = {
  projects: [],
  activeProjectId: null,
  models: INITIAL_MODELS,
  prompts: getPromptLibrary().filter(p => p.editable).map(p => ({
    id: p.id,
    category: p.category as any,
    name: p.name,
    content: p.content,
  })),
  activeModelId: 'default-openai',
};

export type ResetModalState = {
  isOpen: boolean;
  type: 'clear_projects' | 'factory_reset' | null;
};
