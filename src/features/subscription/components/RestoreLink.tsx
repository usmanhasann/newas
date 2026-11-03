/**
 * "Restore purchases" link for the paywalls (App Store expects one on any subscription
 * screen). Encapsulates the IAP restore mutation + user feedback so both the onboarding
 * TrialStep and the standalone PaywallScreen share one implementation. After a successful
 * restore the entitlement query is invalidated (in the hook), so the gate routes onward.
 */
import { Platform } from 'react-native';
import { Text } from '@components';
import { toast } from '@store/toast';
import { useRestorePurchases, IapError, purchaseProblemMessage } from '@features/iap';

export function RestoreLink({ className }: { className?: string }) {
  const restore = useRestorePurchases();

  const onRestore = async () => {
    if (restore.isPending) return;
    try {
      const outcome = await restore.mutateAsync();
      toast.info(
        outcome.status === 'restored' || outcome.status === 'purchased'
          ? 'Your purchases were restored.'
          : 'There’s no subscription to restore for this account.',
      );
    } catch (e) {
      if (
        e instanceof IapError &&
        (e.code === 'owned_elsewhere' || e.code === 'unavailable')
      ) {
        toast.error(purchaseProblemMessage(e, Platform.OS));
      } else {
        toast.error('We couldn’t restore purchases. Please try again.');
      }
    }
  };

  return (
    <Text variant="link" className={className} onPress={onRestore}>
      Restore purchases
    </Text>
  );
}
