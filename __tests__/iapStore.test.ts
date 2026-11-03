/**
 * In-app purchases in the app (client revisions 10/14 p.32-38, N17): the stores' prices and free
 * trial (storeCatalog), and the purchase service against a stand-in store (expo-iap mocked):
 * checked on the server before it counts, finished only after that, tied to the account.
 */
import * as ExpoIap from 'expo-iap';
import {
  catalogFromProducts,
  androidOfferToken,
  isCatalogReady,
} from '@features/iap/storeCatalog';
import { createNativeIapService } from '@features/iap/nativeService';
import { IapError, purchaseProblemMessage } from '@features/iap/types';

const mockVerify = jest.fn();
jest.mock('@features/iap/verifyApi', () => ({
  verifyStorePurchase: (input: unknown) => mockVerify(input),
}));

const iap = ExpoIap as unknown as Record<string, jest.Mock>;

const iosProducts = [
  {
    id: 'lysm.premium.annual',
    platform: 'ios',
    displayPrice: '29,99 €',
    price: 29.99,
    currency: 'EUR',
    introductoryPricePaymentModeIOS: 'free-trial',
    subscriptionGroupIdIOS: '21000000',
  },
  {
    id: 'lysm.premium.monthly',
    platform: 'ios',
    displayPrice: '4,99 €',
    price: 4.99,
    currency: 'EUR',
  },
];

const phase = (micros: string, label: string) => ({
  formattedPrice: label,
  priceAmountMicros: micros,
  priceCurrencyCode: 'GBP',
  billingPeriod: 'P1Y',
  billingCycleCount: 0,
  recurrenceMode: 1,
});
const androidProducts = (withTrial: boolean) => [
  {
    id: 'lysm.premium.annual',
    platform: 'android',
    displayPrice: '£0.00',
    price: 0,
    currency: 'GBP',
    subscriptionOffers: [
      ...(withTrial
        ? [
            {
              id: 'free-trial',
              basePlanIdAndroid: 'annual',
              offerTokenAndroid: 'tok-trial',
              pricingPhasesAndroid: {
                pricingPhaseList: [phase('0', 'Free'), phase('24990000', '£24.99')],
              },
            },
          ]
        : []),
      {
        id: 'annual',
        basePlanIdAndroid: 'annual',
        offerTokenAndroid: 'tok-annual',
        pricingPhasesAndroid: { pricingPhaseList: [phase('24990000', '£24.99')] },
      },
    ],
  },
  {
    id: 'lysm.premium.monthly',
    platform: 'android',
    displayPrice: '£3.99',
    price: 3.99,
    currency: 'GBP',
    subscriptionOffers: [
      {
        id: 'monthly',
        basePlanIdAndroid: 'monthly',
        offerTokenAndroid: 'tok-monthly',
        pricingPhasesAndroid: { pricingPhaseList: [phase('3990000', '£3.99')] },
      },
    ],
  },
];

describe('the stores’ prices and free trial (p.36)', () => {
  it('App Store: the store’s own prices in the person’s currency, and the Annual trial offer', () => {
    const c = catalogFromProducts('ios', iosProducts);
    expect(c.prices).toEqual({
      yearly: { priceLabel: '29,99 €', amount: 29.99, currency: 'EUR' },
      monthly: { priceLabel: '4,99 €', amount: 4.99, currency: 'EUR' },
    });
    expect(c.iosTrialOffered).toBe(true);
    expect(c.iosGroupId).toBe('21000000');
    expect(isCatalogReady(c)).toBe(true);
  });

  it('Google Play: the base plan’s recurring price (never the free phase), and the trial offer only when Google offers it', () => {
    const withTrial = catalogFromProducts('android', androidProducts(true));
    expect(withTrial.prices.yearly).toEqual({
      priceLabel: '£24.99',
      amount: 24.99,
      currency: 'GBP',
    });
    expect(withTrial.prices.monthly).toEqual({
      priceLabel: '£3.99',
      amount: 3.99,
      currency: 'GBP',
    });
    expect(androidOfferToken(withTrial, 'yearly', true)).toBe('tok-trial');
    expect(androidOfferToken(withTrial, 'yearly', false)).toBe('tok-annual');
    expect(androidOfferToken(withTrial, 'monthly', false)).toBe('tok-monthly');

    // Google lists the trial offer only to accounts that can still take it.
    const used = catalogFromProducts('android', androidProducts(false));
    expect(used.androidOffers.yearly?.trial).toBeNull();
    expect(androidOfferToken(used, 'yearly', true)).toBe('tok-annual');
  });

  it('a store that has none of our products yet can’t sell (the app’s own trial stands in)', () => {
    expect(isCatalogReady(catalogFromProducts('ios', []))).toBe(false);
    expect(isCatalogReady(catalogFromProducts('ios', [iosProducts[0]!]))).toBe(false);
    expect(isCatalogReady(null)).toBe(false);
  });
});

describe('buying through the store (iOS)', () => {
  let onPurchase: (p: unknown) => void = () => undefined;
  let onError: (e: unknown) => void = () => undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    iap.fetchProducts!.mockResolvedValue(iosProducts);
    iap.purchaseUpdatedListener!.mockImplementation((cb: (p: unknown) => void) => {
      onPurchase = cb;
      return { remove: jest.fn() };
    });
    iap.purchaseErrorListener!.mockImplementation((cb: (e: unknown) => void) => {
      onError = cb;
      return { remove: jest.fn() };
    });
  });

  const purchase = {
    id: 't1',
    productId: 'lysm.premium.annual',
    purchaseToken: 'signed.transaction.jws',
    purchaseState: 'purchased',
    transactionDate: 1,
  };

  it('buys tied to the account, checks it on the server, then finishes it', async () => {
    mockVerify.mockResolvedValue('ok');
    const service = createNativeIapService();
    const pending = service.purchase('yearly', { userId: 'user-1', withTrial: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(iap.requestPurchase).toHaveBeenCalledWith({
      type: 'subs',
      request: { apple: { sku: 'lysm.premium.annual', appAccountToken: 'user-1' } },
    });
    onPurchase(purchase);
    await expect(pending).resolves.toEqual({
      status: 'purchased',
      productId: 'lysm.premium.annual',
    });
    expect(mockVerify).toHaveBeenCalledWith({
      platform: 'ios',
      productId: 'lysm.premium.annual',
      token: 'signed.transaction.jws',
    });
    expect(iap.finishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false });
  });

  it('closing the store’s sheet is a cancel, not an error', async () => {
    const service = createNativeIapService();
    const pending = service.purchase('monthly', { userId: 'user-1', withTrial: false });
    await new Promise((r) => setTimeout(r, 0));
    onError({ code: 'user-cancelled', productId: 'lysm.premium.monthly' });
    await expect(pending).resolves.toEqual({
      status: 'canceled',
      productId: 'lysm.premium.monthly',
    });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('a check that fails leaves the purchase unfinished (it comes back and is checked again)', async () => {
    mockVerify.mockRejectedValue(new Error('offline'));
    const service = createNativeIapService();
    const pending = service.purchase('yearly', { userId: 'user-1', withTrial: true });
    await new Promise((r) => setTimeout(r, 0));
    onPurchase(purchase);
    await expect(pending).rejects.toMatchObject({ code: 'network' });
    expect(iap.finishTransaction).not.toHaveBeenCalled();
  });

  it('a subscription another LYSM account holds is refused (and finished, so it doesn’t replay)', async () => {
    mockVerify.mockResolvedValue('owned_by_other_account');
    const service = createNativeIapService();
    const pending = service.purchase('yearly', { userId: 'user-1', withTrial: true });
    await new Promise((r) => setTimeout(r, 0));
    onPurchase(purchase);
    await expect(pending).rejects.toMatchObject({ code: 'owned_elsewhere' });
    expect(iap.finishTransaction).toHaveBeenCalled();
  });

  it('a store with no products can’t sell', async () => {
    iap.fetchProducts!.mockResolvedValue([]);
    const service = createNativeIapService();
    await expect(
      service.purchase('yearly', { userId: 'u', withTrial: true }),
    ).rejects.toMatchObject({
      code: 'not_configured',
    });
  });

  it('restore: the newest of our purchases, checked on the server', async () => {
    mockVerify.mockResolvedValue('ok');
    iap.getAvailablePurchases!.mockResolvedValue([
      { ...purchase, transactionDate: 1 },
      { ...purchase, id: 't2', purchaseToken: 'newer', transactionDate: 5 },
      { ...purchase, id: 'x', productId: 'someone.else', transactionDate: 9 },
    ]);
    const service = createNativeIapService();
    await expect(service.restorePurchases('user-1')).resolves.toEqual({
      status: 'restored',
      productId: 'lysm.premium.annual',
    });
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledWith(expect.objectContaining({ token: 'newer' }));

    iap.getAvailablePurchases!.mockResolvedValue([]);
    await expect(service.restorePurchases('user-1')).resolves.toEqual({
      status: 'nothing_to_restore',
    });
  });

  it('iOS free-trial eligibility is StoreKit’s, for the subscription group', async () => {
    const service = createNativeIapService();
    const catalog = catalogFromProducts('ios', iosProducts);
    iap.isEligibleForIntroOfferIOS!.mockResolvedValue(true);
    await expect(service.isTrialEligible(catalog)).resolves.toBe(true);
    expect(iap.isEligibleForIntroOfferIOS).toHaveBeenCalledWith('21000000');
    iap.isEligibleForIntroOfferIOS!.mockResolvedValue(false);
    await expect(service.isTrialEligible(catalog)).resolves.toBe(false);
  });
});

it('says what happened in plain words', () => {
  expect(purchaseProblemMessage(new IapError('canceled'), 'ios')).toBe('');
  expect(purchaseProblemMessage(new IapError('owned_elsewhere'), 'ios')).toBe(
    'This App Store subscription already belongs to another LYSM account. Sign in to that account to use it.',
  );
  expect(purchaseProblemMessage(new IapError('owned_elsewhere'), 'android')).toContain(
    'Google Play',
  );
  expect(purchaseProblemMessage(new Error('x'), 'ios')).toBe(
    'We couldn’t complete the purchase. Please try again.',
  );
});
