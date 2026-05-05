import { useState, useEffect, useRef, useCallback } from 'react';
import { AIAssistantState } from '../../../../../shared/types/fileSystem';
import { aiAssistant } from '../../../../shared/services/AIAssistantService';
import { useAIStatus } from '../../../../shared/contexts/AIStatusContext';

export function useAIAssistantState() {
  const [state, setState] = useState<AIAssistantState>(aiAssistant.getState());
  const { setGenerating, setComplete, setTokenUsage, status } = useAIStatus();
  const prevProcessingRef = useRef(false);

  useEffect(() => {
    const unsub = aiAssistant.subscribe(s => setState({ ...s, tasks: status.tasks as any }));
    return unsub;
  }, [status.tasks]);

  useEffect(() => {
    aiAssistant.setOnTokenUsage(setTokenUsage);
    return () => { aiAssistant.setOnTokenUsage(() => {}); };
  }, [setTokenUsage]);

  useEffect(() => {
    if (!prevProcessingRef.current && state.isProcessing) {
      prevProcessingRef.current = true;
    } else if (prevProcessingRef.current && !state.isProcessing) {
      prevProcessingRef.current = false;
      setComplete();
    }
  }, [state.isProcessing, setComplete]);

  return state;
}
