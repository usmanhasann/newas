import { detectCrisis } from '@features/crisis/matcher';
import type { CrisisKeyword } from '@app-types/database';

function kw(p: Partial<CrisisKeyword> & { phrase: string }): CrisisKeyword {
  return {
    id: p.phrase,
    match_type: 'contains',
    severity: 'high',
    title: 'title',
    message: 'message',
    resource_name: '988 Suicide & Crisis Lifeline',
    resource_phone: '988',
    resource_sms: '988',
    resource_url: null,
    region: 'US',
    is_active: true,
    created_at: '',
    updated_at: '',
    ...p,
  };
}

describe('detectCrisis', () => {
  it('matches a contains phrase, case-insensitively', () => {
    const m = detectCrisis('I want to KILL MYSELF tonight', [
      kw({ phrase: 'kill myself', severity: 'critical' }),
    ]);
    expect(m?.phrase).toBe('kill myself');
  });

  it('respects word boundaries for match_type word', () => {
    const kws = [kw({ phrase: 'die', match_type: 'word' })];
    expect(detectCrisis('my diet is fine', kws)).toBeNull();
    expect(detectCrisis('i feel like i might die', kws)?.phrase).toBe('die');
  });

  it('returns the highest-severity match', () => {
    const m = detectCrisis('i feel hopeless and want to kill myself', [
      kw({ phrase: 'hopeless', severity: 'medium' }),
      kw({ phrase: 'kill myself', severity: 'critical' }),
    ]);
    expect(m?.severity).toBe('critical');
  });

  it('ignores inactive keywords and empty text', () => {
    expect(detectCrisis('kill myself', [kw({ phrase: 'kill myself', is_active: false })])).toBeNull();
    expect(detectCrisis('', [kw({ phrase: 'kill myself' })])).toBeNull();
    expect(detectCrisis('a calm happy day', [kw({ phrase: 'kill myself' })])).toBeNull();
  });
});
