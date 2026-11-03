/**
 * Apple's one-time name kept on the phone (client 10/14 p.10) holds personal data, so it is kept no
 * longer than needed: per Apple ID, ignored and removed after 48 hours, and every copy removed on
 * sign-out (registered sign-out task) and Delete Account.
 */
import {
  forgetAllAppleNames,
  forgetAppleName,
  recallAppleName,
  rememberAppleName,
} from '@store/appleName';
import { runSignOutTasks } from '@store/signOutTasks';

const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage');

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useRealTimers();
});

it('keeps a name per Apple ID and gives it back only for that ID', async () => {
  await rememberAppleName('a1', 'Konah Quittman');
  expect(await recallAppleName('a1')).toBe('Konah Quittman');
  expect(await recallAppleName('a2')).toBeNull();
  expect(await recallAppleName(undefined)).toBeNull();
  await forgetAppleName('a1');
  expect(await recallAppleName('a1')).toBeNull();
});

it('a copy older than 48 hours is ignored and removed', async () => {
  jest.useFakeTimers({ now: new Date('2026-10-16T10:00:00Z') });
  await rememberAppleName('a1', 'Konah Quittman');
  jest.setSystemTime(new Date('2026-10-18T09:59:00Z')); // 47h59m later
  expect(await recallAppleName('a1')).toBe('Konah Quittman');
  jest.setSystemTime(new Date('2026-10-18T10:00:01Z')); // just over 48h
  expect(await recallAppleName('a1')).toBeNull();
  expect(await AsyncStorage.getItem('lysm.appleName.a1')).toBeNull();
});

it('sign-out removes every kept Apple name, and nothing else', async () => {
  await rememberAppleName('a1', 'One');
  await rememberAppleName('a2', 'Two');
  await AsyncStorage.setItem('other.key', 'keep me');
  await runSignOutTasks();
  expect(await recallAppleName('a1')).toBeNull();
  expect(await recallAppleName('a2')).toBeNull();
  expect(await AsyncStorage.getItem('other.key')).toBe('keep me');
});

it('Delete Account clean-up removes every kept Apple name', async () => {
  await rememberAppleName('a1', 'One');
  await forgetAllAppleNames();
  expect(await recallAppleName('a1')).toBeNull();
});
