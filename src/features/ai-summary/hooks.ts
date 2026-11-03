import { useMutation, useQueryClient } from '@tanstack/react-query';
import { journalKeys } from '@features/journal';
import type { JournalEntry } from '@app-types/database';
import * as api from './api';

/** Triggers async summary generation; optimistically shows the pending state. */
export function useGenerateSummary(entryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.invokeAiSummary(entryId),
    onMutate: () => {
      qc.setQueryData<JournalEntry | null>(journalKeys.entry(entryId), (old) =>
        old ? { ...old, ai_status: 'pending', ai_error: null } : old,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: journalKeys.entry(entryId) });
      qc.invalidateQueries({ queryKey: ['journal', 'list'] });
    },
  });
}
