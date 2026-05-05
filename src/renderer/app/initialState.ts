import { AppState } from '../../shared/types';
import { DEFAULT_PROMPTS, INITIAL_MODELS } from '../../shared/constants';

export const INITIAL_APP_STATE: AppState = {
  projects: [],
  activeProjectId: null,
  models: INITIAL_MODELS,
  prompts: DEFAULT_PROMPTS,
  activeModelId: 'default-openai',
};

export type ResetModalState = {
  isOpen: boolean;
  type: 'clear_projects' | 'factory_reset' | null;
};
