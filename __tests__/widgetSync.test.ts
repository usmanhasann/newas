/**
 * Home-screen widget sync (app side). The iOS widget fetches for itself, so the app's job is to hand
 * it valid settings; Android gets the data. Covers: minting + reusing this phone's read-only key,
 * replacing a revoked key, clearing a circle that's no longer valid, staying put when offline, the
 * last of two quick picks winning, wiping everything on sign-out / when a different (or unknown)
 * account signs in, and revoking the key on sign-out (audit 2026-09-30).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  forgetWidgetOnSignOut,
  reconcileWidgetOwner,
  refreshWidget,
} from '@features/widget/sync';

const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (k: string) => Promise.resolve(mockSecure.get(k) ?? null),
  setItemAsync: (k: string, v: string) => {
    mockSecure.set(k, v);
    return Promise.resolve();
  },
  deleteItemAsync: (k: string) => {
    mockSecure.delete(k);
    return Promise.resolve();
  },
}));

const mockRpc = jest.fn();
jest.mock('@lib', () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a) },
  env: { supabaseUrl: 'https://proj.supabase.co', supabaseAnonKey: 'anon-key' },
}));

const mockIos = jest.fn();
const mockAndroid = jest.fn();
jest.mock('@features/widget/native', () => ({
  writeIosWidgetSettings: (...a: unknown[]) => mockIos(...a),
  writeAndroidWidgetData: (...a: unknown[]) => mockAndroid(...a),
}));

const FEED = {
  circle: 'Konah’s Friends',
  member_count: 1,
  generated_at: 1,
  members: [{ id: 'a', name: 'Augie', avatar: null, moods: ['Calm'], at: 1 }],
};

/** Server stand-in: `validKeys` are accepted by widget_feed; create_widget_key mints `nextKey`. */
function server({ validKeys, nextKey = 'k-new', circleOk = true }: {
  validKeys: string[];
  nextKey?: string;
  circleOk?: boolean;
}) {
  mockRpc.mockImplementation((fn: string, args?: { p_key: string; p_circle?: string }) => {
    if (fn === 'create_widget_key') {
      validKeys.push(nextKey);
      return Promise.resolve({ data: nextKey, error: null });
    }
    if (fn === 'revoke_widget_key') {
      const i = validKeys.indexOf(args!.p_key);
      if (i >= 0) validKeys.splice(i, 1);
      return Promise.resolve({ data: null, error: null });
    }
    if (fn === 'widget_feed') {
      if (!validKeys.includes(args!.p_key)) {
        return Promise.resolve({ data: { error: 'invalid_key' }, error: null });
      }
      const feed = { ...FEED, circle: `Circle ${args!.p_circle}` };
      return Promise.resolve({ data: circleOk ? feed : { error: 'no_circle' }, error: null });
    }
    return Promise.resolve({ data: null, error: { message: 'unexpected ' + fn } });
  });
}

const calls = (fn: string) => mockRpc.mock.calls.filter((c) => c[0] === fn);
const pick = (id: string | null) =>
  id ? AsyncStorage.setItem('widget.circle_id', id) : AsyncStorage.removeItem('widget.circle_id');

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSecure.clear();
  mockRpc.mockReset();
  mockIos.mockReset();
  mockAndroid.mockReset();
});

describe('refreshWidget', () => {
  it('first time: mints a key, checks the feed with it, hands iOS its settings and Android the data', async () => {
    server({ validKeys: [], nextKey: 'k1' });
    await pick('c1');
    expect(await refreshWidget()).toBe('synced');

    expect(calls('create_widget_key')).toHaveLength(1);
    expect(calls('widget_feed')[0]![1]).toEqual({ p_key: 'k1', p_circle: 'c1' });
    expect(mockSecure.get('widget.key')).toBe('k1');
    expect(mockIos).toHaveBeenLastCalledWith({
      key: 'k1',
      circleId: 'c1',
      feedUrl: 'https://proj.supabase.co/rest/v1/rpc/widget_feed',
      apiKey: 'anon-key',
    });
    expect(mockAndroid).toHaveBeenLastCalledWith(
      expect.objectContaining({ circle: 'Circle c1', circleId: 'c1', members: FEED.members }),
    );
  });

  it('reuses this phone’s key after that', async () => {
    mockSecure.set('widget.key', 'k1');
    server({ validKeys: ['k1'] });
    await pick('c1');
    await refreshWidget();
    expect(calls('create_widget_key')).toHaveLength(0);
    expect(mockIos).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'k1' }));
  });

  it('a revoked / pruned key is replaced once, then works', async () => {
    mockSecure.set('widget.key', 'old');
    server({ validKeys: [], nextKey: 'k2' });
    await pick('c1');
    await refreshWidget();
    expect(calls('create_widget_key')).toHaveLength(1);
    expect(mockSecure.get('widget.key')).toBe('k2');
    expect(mockIos).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'k2' }));
  });

  it('a circle that is no longer valid (left / removed / Public) is cleared everywhere', async () => {
    await pick('c1');
    mockSecure.set('widget.key', 'k1');
    server({ validKeys: ['k1'], circleOk: false });
    expect(await refreshWidget()).toBe('unavailable');
    expect(await AsyncStorage.getItem('widget.circle_id')).toBeNull();
    expect(mockIos).toHaveBeenLastCalledWith(null);
    expect(mockAndroid).toHaveBeenLastCalledWith(null);
  });

  it('offline: writes nothing, so the widget keeps its last data, and says so', async () => {
    mockSecure.set('widget.key', 'k1');
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    await pick('c1');
    expect(await refreshWidget()).toBe('failed');
    expect(mockIos).not.toHaveBeenCalled();
    expect(mockAndroid).not.toHaveBeenCalled();
  });

  it('"Don’t show a widget" clears both platforms without any server call', async () => {
    await pick(null);
    expect(await refreshWidget()).toBe('cleared');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockIos).toHaveBeenLastCalledWith(null);
    expect(mockAndroid).toHaveBeenLastCalledWith(null);
  });

  it('two quick picks: the widget ends on the LAST one, and only one key is ever minted', async () => {
    server({ validKeys: [], nextKey: 'k1' });
    await pick('c1');
    const first = refreshWidget();
    await pick('c2');
    const second = refreshWidget();
    await pick('c3');
    const third = refreshWidget();
    const results = await Promise.all([first, second, third]);

    expect(results[1]).toBe('superseded'); // overtaken before it started
    expect(results[2]).toBe('synced');
    expect(calls('create_widget_key')).toHaveLength(1);
    expect(mockIos).toHaveBeenLastCalledWith(expect.objectContaining({ circleId: 'c3', key: 'k1' }));
    expect(mockAndroid).toHaveBeenLastCalledWith(expect.objectContaining({ circleId: 'c3' }));
  });
});

describe('reconcileWidgetOwner', () => {
  async function setUpFor(owner: string) {
    await AsyncStorage.setItem('widget.owner', owner);
    await pick('c1');
    mockSecure.set('widget.key', 'k1');
  }

  it('a different account on this phone wipes the previous account’s widget', async () => {
    await setUpFor('userA');
    server({ validKeys: ['k1'] });
    await reconcileWidgetOwner('userB');
    expect(await AsyncStorage.getItem('widget.circle_id')).toBeNull();
    expect(mockSecure.has('widget.key')).toBe(false);
    expect(await AsyncStorage.getItem('widget.owner')).toBe('userB');
    expect(mockIos).toHaveBeenLastCalledWith(null);
    expect(calls('widget_feed')).toHaveLength(0);
  });

  it('signing out wipes it', async () => {
    await setUpFor('userA');
    await reconcileWidgetOwner(null);
    expect(await AsyncStorage.getItem('widget.circle_id')).toBeNull();
    expect(await AsyncStorage.getItem('widget.owner')).toBeNull();
    expect(mockSecure.has('widget.key')).toBe(false);
    expect(mockIos).toHaveBeenLastCalledWith(null);
  });

  it('signed out with nothing recorded: still clears anything left (never a server call)', async () => {
    mockSecure.set('widget.key', 'left-in-keychain');
    await reconcileWidgetOwner(null);
    expect(mockSecure.has('widget.key')).toBe(false);
    expect(mockIos).toHaveBeenLastCalledWith(null);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('the same account keeps its circle and re-syncs', async () => {
    await setUpFor('userA');
    server({ validKeys: ['k1'] });
    await reconcileWidgetOwner('userA');
    expect(await AsyncStorage.getItem('widget.circle_id')).toBe('c1');
    expect(mockIos).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'k1', circleId: 'c1' }));
  });

  it('no account recorded (reinstall: the keychain kept someone’s old key) starts clean', async () => {
    mockSecure.set('widget.key', 'someone-elses');
    server({ validKeys: ['someone-elses'], nextKey: 'k-mine' });
    await reconcileWidgetOwner('userB');
    expect(mockSecure.has('widget.key')).toBe(false);
    expect(await AsyncStorage.getItem('widget.owner')).toBe('userB');

    // Their first pick mints THEIR key; the old one is never used.
    await pick('c9');
    await refreshWidget();
    expect(calls('widget_feed').every((c) => (c[1] as { p_key: string }).p_key === 'k-mine')).toBe(true);
    expect(mockIos).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'k-mine', circleId: 'c9' }));
  });
});

describe('forgetWidgetOnSignOut', () => {
  it('revokes this phone’s key on the server and wipes the widget', async () => {
    const valid = ['k1'];
    server({ validKeys: valid });
    await AsyncStorage.setItem('widget.owner', 'userA');
    await pick('c1');
    mockSecure.set('widget.key', 'k1');

    await forgetWidgetOnSignOut();
    expect(calls('revoke_widget_key')).toEqual([['revoke_widget_key', { p_key: 'k1' }]]);
    expect(valid).toEqual([]); // the key no longer works anywhere
    expect(mockSecure.has('widget.key')).toBe(false);
    expect(await AsyncStorage.getItem('widget.circle_id')).toBeNull();
    expect(mockIos).toHaveBeenLastCalledWith(null);
    expect(mockAndroid).toHaveBeenLastCalledWith(null);
  });

  it('nothing to revoke when this phone never had a key', async () => {
    await forgetWidgetOnSignOut();
    expect(calls('revoke_widget_key')).toHaveLength(0);
  });
});
