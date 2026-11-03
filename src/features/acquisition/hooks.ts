import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import { profileKeys } from '@features/profile';
import type { AcquisitionValue } from '@features/onboarding';
import * as api from './api';

/**
 * Resolve the acquisition prompt — record an answer OR dismiss (skip). Both refresh the profile
 * afterwards so the committed `acquisition_prompt_seen` flag sticks and the popup never reappears.
 */
export function useResolveAcquisition() {
  const qc = useQueryClient();
  const user = useCurrentUser();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: profileKeys.me(user?.id) });
  };

  const record = useMutation({
    mutationFn: (source: AcquisitionValue) => api.recordAcquisitionSource(source),
    onSettled: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: () => api.dismissAcquisitionPrompt(),
    onSettled: invalidate,
  });

  return { record, dismiss };
}
