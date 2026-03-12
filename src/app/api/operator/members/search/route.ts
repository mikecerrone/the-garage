import { NextRequest, NextResponse } from 'next/server';
import { getOperatorAccess } from '@/lib/operator-access';
import { searchMembers } from '@/lib/operator/search-members';

export async function GET(request: NextRequest) {
  const access = await getOperatorAccess();
  if (!access.isOperator) {
    return NextResponse.json(
      { error: 'Please sign in again.' },
      { status: 401 }
    );
  }

  const query = request.nextUrl.searchParams.get('q') || '';

  if (query.trim().length < 2) {
    return NextResponse.json({ members: [] });
  }

  console.info(
    JSON.stringify({
      event: 'quick_add_search_started',
      queryLength: query.trim().length,
    })
  );

  try {
    const members = await searchMembers(query);

    console.info(
      JSON.stringify({
        count: members.length,
        event: 'quick_add_search_results_returned',
      })
    );

    return NextResponse.json({ members });
  } catch (error) {
    console.error('Error searching members:', error);
    return NextResponse.json(
      { error: 'Search is unavailable right now.' },
      { status: 500 }
    );
  }
}
