import { useMutation } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import * as api from './api';

export function useSubmitFeedback() {
  const user = useCurrentUser();
  return useMutation({
    mutationFn: (args: { message: string; category: string }) =>
      api.submitFeedback(user!.id, args.message, args.category),
  });
}
