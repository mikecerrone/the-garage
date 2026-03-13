import { describe, expect, it, vi } from 'vitest';
import type { Member } from '@/types/database';
import { rankMemberResults, searchMembers } from '@/lib/operator/search-members';

const members: Member[] = [
  {
    created_at: '2026-03-12T10:00:00Z',
    id: 'mike',
    is_active: true,
    name: 'Mike Cerrone',
    notes: null,
    phone: '+16155551212',
  },
  {
    created_at: '2026-03-12T10:00:00Z',
    id: 'mikey',
    is_active: true,
    name: 'Mikey Jones',
    notes: null,
    phone: '+16155554321',
  },
  {
    created_at: '2026-03-12T10:00:00Z',
    id: 'sarah',
    is_active: true,
    name: 'Sarah Mike',
    notes: null,
    phone: '+16155559876',
  },
];

describe('rankMemberResults', () => {
  it('prefers exact phone matches over looser name matches', () => {
    const ranked = rankMemberResults('615-555-1212', members);

    expect(ranked[0]).toMatchObject({
      id: 'mike',
      isExactMatch: true,
      matchKind: 'phone-exact',
    });
  });

  it('keeps name prefix matches ahead of broader contains matches', () => {
    const ranked = rankMemberResults('Mike', members);

    expect(ranked.map((member) => member.id)).toEqual(['mike', 'mikey', 'sarah']);
  });
});

describe('searchMembers', () => {
  it('returns no results for tiny queries', async () => {
    const repository = {
      findCandidates: vi.fn(),
    };

    await expect(searchMembers('m', repository)).resolves.toEqual([]);
    expect(repository.findCandidates).not.toHaveBeenCalled();
  });

  it('caps the ranked results to eight matches', async () => {
    const manyMembers = Array.from({ length: 12 }, (_, index) => ({
      created_at: '2026-03-12T10:00:00Z',
      id: `member-${index}`,
      is_active: true,
      name: `Mike ${index}`,
      notes: null,
      phone: `+16155550${index.toString().padStart(3, '0')}`,
    }));

    const repository = {
      findCandidates: vi.fn().mockResolvedValue(manyMembers),
    };

    const results = await searchMembers('Mike', repository);

    expect(results).toHaveLength(8);
  });
});
