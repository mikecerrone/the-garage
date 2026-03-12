import { createAdminClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils';
import type { Member } from '@/types/database';

export type MemberMatchKind =
  | 'phone-exact'
  | 'phone-contains'
  | 'name-exact'
  | 'name-prefix'
  | 'name-contains';

export interface OperatorMemberSearchResult {
  id: string;
  isExactMatch: boolean;
  matchKind: MemberMatchKind;
  name: string;
  phone: string;
}

export interface MemberSearchRepository {
  findCandidates: (query: string, digits: string) => Promise<Member[]>;
}

interface RankedMemberResult extends OperatorMemberSearchResult {
  score: number;
}

function cleanQuery(query: string) {
  return query.trim().replace(/\s+/g, ' ');
}

function escapeLikeValue(value: string) {
  return value.replace(/[%_,]/g, '');
}

function getDigits(value: string) {
  return value.replace(/\D/g, '');
}

function scoreMember(query: string, digits: string, member: Member) {
  const normalizedQuery = query.toLowerCase();
  const normalizedName = member.name.toLowerCase();
  const phoneDigits = getDigits(member.phone);
  const normalizedPhone = digits ? normalizePhone(digits) : '';

  if (digits && member.phone === normalizedPhone) {
    return { isExactMatch: true, matchKind: 'phone-exact' as const, score: 500 };
  }

  if (digits && phoneDigits.includes(digits)) {
    return {
      isExactMatch: false,
      matchKind: 'phone-contains' as const,
      score: phoneDigits.endsWith(digits) ? 460 : 430,
    };
  }

  if (normalizedName === normalizedQuery) {
    return { isExactMatch: true, matchKind: 'name-exact' as const, score: 400 };
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return { isExactMatch: false, matchKind: 'name-prefix' as const, score: 340 };
  }

  if (normalizedName.includes(normalizedQuery)) {
    return { isExactMatch: false, matchKind: 'name-contains' as const, score: 280 };
  }

  return null;
}

export function rankMemberResults(query: string, members: Member[]) {
  const normalizedQuery = cleanQuery(query);
  const digits = getDigits(normalizedQuery);
  const rankedResults = members
    .map((member) => {
      const match = scoreMember(normalizedQuery, digits, member);
      if (!match) {
        return null;
      }

      return {
        id: member.id,
        isExactMatch: match.isExactMatch,
        matchKind: match.matchKind,
        name: member.name,
        phone: member.phone,
        score: match.score,
      };
    })
    .filter((member): member is RankedMemberResult => member !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.name.localeCompare(right.name);
    });

  return rankedResults;
}

function createSupabaseRepository(): MemberSearchRepository {
  const supabase = createAdminClient();

  return {
    async findCandidates(query: string, digits: string) {
      const searchValue = escapeLikeValue(query);
      const filters = [`name.ilike.%${searchValue}%`];

      if (digits.length >= 2) {
        filters.push(`phone.ilike.%${digits}%`);
      }

      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('is_active', true)
        .or(filters.join(','))
        .limit(25);

      if (error) {
        throw error;
      }

      return data || [];
    },
  };
}

export async function searchMembers(
  query: string,
  repository: MemberSearchRepository = createSupabaseRepository()
) {
  const normalizedQuery = cleanQuery(query);
  const digits = getDigits(normalizedQuery);

  if (normalizedQuery.length < 2 && digits.length < 2) {
    return [];
  }

  const candidates = await repository.findCandidates(normalizedQuery, digits);
  return rankMemberResults(normalizedQuery, candidates).slice(0, 8);
}
