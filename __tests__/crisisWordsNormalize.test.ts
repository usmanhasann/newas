/**
 * Concerning words (client 10/14 p.36, N18) are KEYWORDS ONLY now, so the phone's matcher is the
 * whole check (no AI behind it), and it mirrors the database's crisis_words_match. The list is
 * written without apostrophes ("dont want to live", "cant go on") and with spaces ("self harm"):
 * the text as typed AND a normalized form are compared, so iPhone's curly apostrophe, a straight
 * one, or a dash all still match, and normalizing never loses a match the plain check had.
 */
import { detectCrisis, normalizeCrisisText } from '@features/crisis/matcher';
import type { CrisisKeyword } from '@app-types/database';

function kw(phrase: string, match_type: CrisisKeyword['match_type'] = 'contains'): CrisisKeyword {
  return {
    id: phrase,
    phrase,
    match_type,
    severity: 'high',
    title: 't',
    message: 'm',
    resource_name: '988 Suicide & Crisis Lifeline',
    resource_phone: '988',
    resource_sms: '988',
    resource_url: null,
    region: 'US',
    is_active: true,
    created_at: '',
    updated_at: '',
  };
}

const LIST = [
  kw('dont want to live'),
  kw('cant go on'),
  kw('self harm'),
  kw('suicide', 'word'),
  kw('hopeless', 'word'),
];

it('reads apostrophes and dashes the same way the database does', () => {
  expect(normalizeCrisisText('I DON’T  want—to live')).toBe('i dont want to live');
  expect(normalizeCrisisText("can't-go - on ")).toBe('cant go on');
});

it('matches the list whatever apostrophe or dash was typed', () => {
  expect(detectCrisis('I don’t want to live like this', LIST)?.phrase).toBe('dont want to live');
  expect(detectCrisis("I don't want to live like this", LIST)?.phrase).toBe('dont want to live');
  expect(detectCrisis('I just can’t go on', LIST)?.phrase).toBe('cant go on');
  expect(detectCrisis('thinking about self-harm again', LIST)?.phrase).toBe('self harm');
});

it('keeps every match the plain check had, and whole words stay whole', () => {
  // "suicide’s": the apostrophe ends the word as typed (normalized it would read "suicides").
  expect(detectCrisis('the suicide’s anniversary', LIST)?.phrase).toBe('suicide');
  expect(detectCrisis('the hopelessness of Mondays', LIST)).toBeNull();
  expect(detectCrisis('a calm walk by the river', LIST)).toBeNull();
});
