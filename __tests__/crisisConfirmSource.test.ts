/**
 * Only Circle posts still ask the crisis AI to confirm a keyword hit; journal entries are keywords
 * only and never reach it (client 10/14 p.36). The Circle-post confirm says what it is, so
 * detect-crisis answers anything else (older app builds' entry checks) from the keyword list alone,
 * without sending the text to the AI.
 */
import { confirmCrisis } from '@features/crisis/api';

const mockInvoke = jest.fn((_name: string, _opts: unknown) =>
  Promise.resolve({ data: { crisis: true }, error: null }),
);
jest.mock('@lib', () => ({
  supabase: { functions: { invoke: (name: string, opts: unknown) => mockInvoke(name, opts) } },
}));

it('marks the AI confirm as a Circle post', async () => {
  await expect(confirmCrisis('I feel hopeless')).resolves.toBe(true);
  expect(mockInvoke).toHaveBeenCalledWith('detect-crisis', {
    body: { text: 'I feel hopeless', source: 'circle_post' },
  });
});
