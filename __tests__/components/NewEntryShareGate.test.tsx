/**
 * Sharing an entry into a circle (client spec 2026-09-29): Private circles only, and the writer
 * picks what the circle sees, the AI reflection (default) or the entry as written. A reflection
 * share asks for the reflection straight away and tells the circle once it exists; a written share
 * tells them at once. Sharing is a "post", so it goes through the verification gate, but the
 * JOURNAL entry itself is never blocked: an unverified email account saves privately and shares
 * after verifying. The server keeps the entry's "shared" state (the app never sets it).
 * Collaborators are mocked; the gate is a controllable double (see VerifyGate.test).
 */
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { NewEntryScreen } from '@features/journal/screens/NewEntryScreen';

const mockCreate = jest.fn((_input: Record<string, unknown>) => Promise.resolve({ id: 'e1' }));
const mockUpdate = jest.fn(() => Promise.resolve({ id: 'e1' }));
const mockShare = jest.fn((_input: Record<string, unknown>) =>
  Promise.resolve([{ circle_id: 'c1', post_id: 'p1' }]),
);
const mockInvoke = jest.fn((_id: string) => Promise.resolve({ status: 'ready' }));
const mockNotify = jest.fn();
const mockToastError = jest.fn();
const mockResolveHeading = jest.fn((_entry: { id: string; local_date: string }) =>
  Promise.resolve('Entry complete'),
);

jest.mock('@features/moods', () => ({ MoodPicker: () => null }));
jest.mock('@features/crisis', () => ({
  useEntryCrisisCheck: () => ({ hasCrisisWords: () => false, showSupport: jest.fn(), sheet: null }),
  EntryNotShareable: () => null,
}));
jest.mock('@features/safety', () => ({ reportPrivateThreat: jest.fn() }));
jest.mock('@features/circles', () => {
  class PostBlockedError extends Error {}
  const logic = jest.requireActual('@features/circles/postingLogic');
  return {
    PostBlockedError,
    entryShareTargets: logic.entryShareTargets,
    unshareQuestion: logic.unshareQuestion,
    isShareTextBlocked: () => Promise.resolve(false),
    useMyCircles: () => ({
      data: [
        { id: 'c1', name: 'Family', type: 'private', archived_at: null },
        { id: 'c2', name: 'Runners', type: 'public', archived_at: null },
        // Archived: nothing new goes in, so it's never offered for a new entry.
        { id: 'c3', name: 'Old Book Club', type: 'private', archived_at: '2026-09-01T00:00:00Z' },
      ],
    }),
    useEntryShares: () => ({ data: undefined }),
    // Lazy wrapper: the factory runs before the mock fns initialize.
    useShareEntry: () => ({ mutateAsync: (i: Record<string, unknown>) => mockShare(i) }),
  };
});
jest.mock('@features/ai-summary', () => ({ invokeAiSummary: (id: string) => mockInvoke(id) }));
jest.mock('@features/notifications', () => ({ notifyEvent: (e: unknown) => mockNotify(e) }));
jest.mock('@features/journal/hooks', () => ({
  useCreateEntry: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdateEntry: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useEntry: () => ({ data: undefined }),
  useCompletionHeadingResolver: () => mockResolveHeading,
}));
jest.mock('@features/journal/components/EntryCompletionModal', () => ({
  EntryCompletionModal: () => null,
}));
jest.mock('@store/toast', () => ({
  toast: { error: (m: string) => mockToastError(m), success: jest.fn(), info: jest.fn() },
}));
jest.mock('@features/email-verification', () => {
  const state: {
    mode: 'proceed' | 'block';
    captured: null | (() => void | Promise<void>);
    cancel: null | (() => void);
  } = {
    mode: 'proceed',
    captured: null,
    cancel: null,
  };
  return {
    __state: state,
    useVerifyGate: () => ({
      check: async () => state.mode === 'proceed',
      openVerify: (onConfirmed: () => void | Promise<void>, onCancel?: () => void) => {
        state.captured = onConfirmed;
        state.cancel = onCancel ?? null;
      },
      requireVerified: async (a: () => void | Promise<void>) => {
        if (state.mode === 'proceed') await a();
        else state.captured = a;
      },
      gate: null,
    }),
  };
});

const ev = jest.requireMock('@features/email-verification') as {
  __state: {
    mode: 'proceed' | 'block';
    captured: null | (() => void | Promise<void>);
    cancel: null | (() => void);
  };
};

function makeNav() {
  return {
    goBack: jest.fn(),
    replace: jest.fn(),
    popToTop: jest.fn(),
    navigate: jest.fn(),
  };
}

async function renderScreen() {
  const nav = makeNav();
  const utils = await render(
    <NewEntryScreen
      navigation={nav as never}
      route={{ params: { presetMood: 'calm' } } as never}
    />,
  );
  await act(async () => {
    fireEvent.changeText(
      utils.getByPlaceholderText('Write freely. This is your space.'),
      'Feeling okay',
    );
  });
  return { nav, utils };
}

async function turnOnShareAndPickCircle(
  utils: Awaited<ReturnType<typeof renderScreen>>['utils'],
) {
  await act(async () => {
    fireEvent(utils.getByRole('switch'), 'valueChange', true);
  });
  await act(async () => {
    fireEvent.press(utils.getByRole('checkbox'));
  });
}

describe('<NewEntryScreen /> sharing into a circle', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockUpdate.mockClear();
    mockShare.mockClear();
    mockInvoke.mockClear();
    mockNotify.mockClear();
    mockToastError.mockClear();
    ev.__state.mode = 'proceed';
    ev.__state.captured = null;
    ev.__state.cancel = null;
    mockResolveHeading.mockReset();
    mockResolveHeading.mockImplementation(() => Promise.resolve('Entry complete'));
  });

  it('lists Private circles only, and shares the AI reflection by default', async () => {
    const { utils } = await renderScreen();
    await turnOnShareAndPickCircle(utils);
    expect(utils.getByText('Family')).toBeTruthy();
    expect(utils.queryByText('Runners')).toBeNull(); // Public circles don't take entries
    expect(utils.queryByText('Old Book Club')).toBeNull(); // archived circles don't either
    expect(utils.getByRole('radio', { name: 'AI reflection' }).props.accessibilityState).toEqual({
      selected: true,
    });

    await act(async () => {
      fireEvent.press(utils.getByText('Save Entry'));
    });
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0]![0]).not.toHaveProperty('shared'); // the server keeps it
    await waitFor(() =>
      expect(mockShare).toHaveBeenCalledWith({
        entryId: 'e1',
        circleIds: ['c1'],
        version: 'reflection',
        note: 'Feeling okay',
      }),
    );
    // The reflection is asked for right away; the circle is told once it exists.
    expect(mockInvoke).toHaveBeenCalledWith('e1');
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith({ type: 'share_created', entry_id: 'e1' }),
    );
  });

  it('"As written" shares the words themselves and tells the circle at once', async () => {
    const { utils } = await renderScreen();
    await turnOnShareAndPickCircle(utils);
    await act(async () => {
      fireEvent.press(utils.getByRole('radio', { name: 'As written' }));
    });
    await act(async () => {
      fireEvent.press(utils.getByText('Save Entry'));
    });
    await waitFor(() =>
      expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ version: 'written' })),
    );
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith({ type: 'share_created', entry_id: 'e1' }),
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('a blocked or failed share never loses the entry, and says so', async () => {
    mockShare.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    const { utils } = await renderScreen();
    await turnOnShareAndPickCircle(utils);
    await act(async () => {
      fireEvent.press(utils.getByText('Save Entry'));
    });
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Saved, but couldn’t post to your circle. Try sharing again from the entry.',
      ),
    );
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('saves the entry privately and shares only after an unverified account verifies', async () => {
    ev.__state.mode = 'block';
    const { utils } = await renderScreen();
    await turnOnShareAndPickCircle(utils);
    await act(async () => {
      fireEvent.press(utils.getByText('Save Entry'));
    });
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockShare).not.toHaveBeenCalled();
    expect(ev.__state.captured).toBeTruthy();

    await act(async () => {
      await ev.__state.captured?.();
    });
    await waitFor(() =>
      expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ entryId: 'e1', circleIds: ['c1'] })),
    );
  });

  it('never gates a private entry (share toggle off)', async () => {
    ev.__state.mode = 'block';
    const { utils } = await renderScreen();
    await act(async () => {
      fireEvent.press(utils.getByText('Save Entry'));
    });
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockShare).not.toHaveBeenCalled();
    expect(ev.__state.captured).toBeNull();
  });

  it('keeps Save disabled while the completion heading resolves after the verify prompt is closed (no duplicate entry)', async () => {
    ev.__state.mode = 'block';
    let finish: (heading: string) => void = () => {};
    mockResolveHeading.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const { utils } = await renderScreen();
    await turnOnShareAndPickCircle(utils);
    await act(async () => {
      fireEvent.press(utils.getByText('Save Entry'));
    });
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));

    // User dismisses the verify prompt → the heading starts resolving (slow network).
    await act(async () => {
      ev.__state.cancel?.();
    });
    expect(mockResolveHeading).toHaveBeenCalledTimes(1);
    // Busy: the Save button shows its spinner (no pressable "Save Entry"), so no second entry.
    expect(utils.queryByText('Save Entry')).toBeNull();
    expect(mockCreate).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish('Entry complete');
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
