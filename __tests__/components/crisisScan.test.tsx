/**
 * System 2 — hybrid crisis support. Verifies the pure fail-open decision and the useCrisisScan
 * wiring: an on-device prescreen hit is required before anything is sent to the AI (privacy), the
 * AI verdict decides whether the resources popup opens, and any AI failure fails OPEN to support.
 * The on-device matcher + the AI call are mocked; the observable effect is the CrisisResourcesSheet.
 */
import { Pressable, Text } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useCrisisScan } from '@features/crisis/useCrisisScan';
import { shouldOfferCrisisSupport } from '@features/crisis/logic';

const mockDetect = jest.fn();
const mockConfirm = jest.fn();

jest.mock('@features/crisis/hooks', () => ({ useCrisisKeywords: () => ({ data: [{ id: 'k1' }] }) }));
jest.mock('@features/crisis/matcher', () => ({ detectCrisis: (...a: unknown[]) => mockDetect(...a) }));
jest.mock('@features/crisis/api', () => ({ confirmCrisis: (...a: unknown[]) => mockConfirm(...a) }));

function Harness({ text }: { text: string }) {
  const { scan, sheet } = useCrisisScan();
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="run" onPress={() => void scan(text)}>
        <Text>run</Text>
      </Pressable>
      {sheet}
    </>
  );
}

const SHEET = /You.re not alone in this/;

beforeEach(() => {
  mockDetect.mockReset();
  mockConfirm.mockReset();
});

describe('shouldOfferCrisisSupport — pure, fail-open', () => {
  it('never offers without a prescreen hit (nothing was sent to the AI)', () => {
    expect(shouldOfferCrisisSupport(false, true)).toBe(false);
    expect(shouldOfferCrisisSupport(false, null)).toBe(false);
  });
  it('follows the AI verdict when available', () => {
    expect(shouldOfferCrisisSupport(true, true)).toBe(true);
    expect(shouldOfferCrisisSupport(true, false)).toBe(false);
  });
  it('fails OPEN to support when the AI is unavailable', () => {
    expect(shouldOfferCrisisSupport(true, null)).toBe(true);
  });
});

describe('useCrisisScan — hybrid crisis support', () => {
  it('offers resources when the prescreen hits and the AI confirms', async () => {
    mockDetect.mockReturnValue({ id: 'k1' });
    mockConfirm.mockResolvedValue(true);
    const utils = await render(<Harness text="i want to end it today" />);
    fireEvent.press(utils.getByLabelText('run'));
    await waitFor(() => expect(utils.getByText(SHEET)).toBeTruthy());
    expect(mockConfirm).toHaveBeenCalledWith('i want to end it today');
  });

  it('does NOT offer resources when the AI downgrades a keyword hit', async () => {
    mockDetect.mockReturnValue({ id: 'k1' });
    mockConfirm.mockResolvedValue(false);
    const utils = await render(<Harness text="this workout is killing me" />);
    fireEvent.press(utils.getByLabelText('run'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(utils.queryByText(SHEET)).toBeNull();
  });

  it('fails OPEN — offers resources when the AI confirm errors', async () => {
    mockDetect.mockReturnValue({ id: 'k1' });
    mockConfirm.mockRejectedValue(new Error('network'));
    const utils = await render(<Harness text="i can't go on" />);
    fireEvent.press(utils.getByLabelText('run'));
    await waitFor(() => expect(utils.getByText(SHEET)).toBeTruthy());
  });

  it('never calls the AI when there is no prescreen hit (private text stays on-device)', async () => {
    mockDetect.mockReturnValue(null);
    const utils = await render(<Harness text="had a lovely day" />);
    fireEvent.press(utils.getByLabelText('run'));
    await waitFor(() => expect(mockDetect).toHaveBeenCalled());
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(utils.queryByText(SHEET)).toBeNull();
  });
});
