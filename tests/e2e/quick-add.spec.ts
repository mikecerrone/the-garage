import { expect, test } from '@playwright/test';

const today = '2026-03-12';
const tomorrow = '2026-03-13';

const slotResponse = {
  slots: [
    {
      available_spots: 2,
      date: today,
      end_time: '10:00:00',
      is_available: true,
      max_capacity: 3,
      start_time: '09:00:00',
    },
    {
      available_spots: 1,
      date: tomorrow,
      end_time: '11:00:00',
      is_available: true,
      max_capacity: 3,
      start_time: '10:00:00',
    },
  ],
};

test.describe('Quick Add', () => {
  test('books an existing member from a suggested slot', async ({ page }) => {
    const bookingPayloads: unknown[] = [];

    await page.route('**/api/availability**', async (route) => {
      await route.fulfill({
        body: JSON.stringify(slotResponse),
        contentType: 'application/json',
      });
    });

    await page.route('**/api/operator/members/search**', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          members: [
            {
              id: 'member-1',
              isExactMatch: true,
              matchKind: 'name-exact',
              name: 'Mike Cerrone',
              phone: '+16155551212',
            },
          ],
        }),
        contentType: 'application/json',
      });
    });

    await page.route('**/api/operator/bookings', async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      bookingPayloads.push(payload);

      await route.fulfill({
        body: JSON.stringify({
          member: {
            id: 'member-1',
            name: 'Mike Cerrone',
            phone: '+16155551212',
          },
          result: 'created',
          session: {
            attended: false,
            created_at: '2026-03-12T10:00:00Z',
            created_via: 'admin',
            date: today,
            end_time: '10:00:00',
            id: 'session-1',
            member_id: 'member-1',
            notes: null,
            start_time: '09:00:00',
            status: 'booked',
            workout_type: 'other',
          },
        }),
        contentType: 'application/json',
      });
    });

    await page.goto('/quick-add');
    await page.getByPlaceholder('Mike or 615-555-1212').fill('Mike');
    await page.getByRole('button', { name: /Mike Cerrone/i }).click();
    await page.getByRole('button', { name: /9:00 AM/i }).click();
    await page.getByRole('button', { name: 'Save booking' }).click();

    await expect(page.getByText('Booked')).toBeVisible();
    await expect(page.getByText(/Mike Cerrone is locked in/i)).toBeVisible();
    expect(bookingPayloads).toHaveLength(1);
  });

  test('requires an explicit pick when fuzzy search returns multiple matches', async ({ page }) => {
    await page.route('**/api/availability**', async (route) => {
      await route.fulfill({
        body: JSON.stringify(slotResponse),
        contentType: 'application/json',
      });
    });

    await page.route('**/api/operator/members/search**', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          members: [
            {
              id: 'member-1',
              isExactMatch: false,
              matchKind: 'name-prefix',
              name: 'Mike Cerrone',
              phone: '+16155551212',
            },
            {
              id: 'member-2',
              isExactMatch: false,
              matchKind: 'name-prefix',
              name: 'Mikey Jones',
              phone: '+16155554321',
            },
          ],
        }),
        contentType: 'application/json',
      });
    });

    await page.goto('/quick-add');
    await page.getByPlaceholder('Mike or 615-555-1212').fill('Mike');

    await expect(page.getByRole('button', { name: /Mike Cerrone/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Mikey Jones/i })).toBeVisible();

    await page.getByRole('button', { name: /Mikey Jones/i }).click();
    await expect(page.getByText('Using member')).toBeVisible();
    await expect(page.getByText(/Mikey Jones/)).toBeVisible();
  });

  test('creates a new member from a custom time', async ({ page }) => {
    const bookingPayloads: unknown[] = [];

    await page.route('**/api/availability**', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ slots: [] }),
        contentType: 'application/json',
      });
    });

    await page.route('**/api/operator/members/search**', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ members: [] }),
        contentType: 'application/json',
      });
    });

    await page.route('**/api/operator/bookings', async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      bookingPayloads.push(payload);

      await route.fulfill({
        body: JSON.stringify({
          member: {
            id: 'member-3',
            name: 'Maggie',
            phone: '+16155550000',
          },
          result: 'created',
          session: {
            attended: false,
            created_at: '2026-03-12T10:00:00Z',
            created_via: 'admin',
            date: today,
            end_time: '10:30:00',
            id: 'session-3',
            member_id: 'member-3',
            notes: null,
            start_time: '09:30:00',
            status: 'booked',
            workout_type: 'other',
          },
        }),
        contentType: 'application/json',
      });
    });

    await page.goto('/quick-add');
    await page.getByPlaceholder('Mike or 615-555-1212').fill('Maggie');
    await expect(page.getByLabel('Custom time')).toHaveValue('09:00');
    await expect(page.getByLabel('Custom time')).toHaveAttribute('step', '900');
    await page.getByLabel('Custom time').fill('09:30');
    await page.getByLabel('First name').fill('Maggie');
    await page.getByLabel('Phone').fill('(615) 555-0000');
    await page.getByRole('button', { name: 'Save booking' }).click();

    await expect(page.getByText(/Maggie is locked in/i)).toBeVisible();
    expect(bookingPayloads[0]).toMatchObject({
      firstName: 'Maggie',
      phone: '(615) 555-0000',
      startTime: '09:30',
    });
    expect(bookingPayloads[0]).not.toHaveProperty('workoutType');
  });

  test('lets Bob optionally toggle workout buttons on and off', async ({ page }) => {
    const bookingPayloads: Array<Record<string, unknown>> = [];

    await page.route('**/api/availability**', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ slots: [] }),
        contentType: 'application/json',
      });
    });

    await page.route('**/api/operator/members/search**', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ members: [] }),
        contentType: 'application/json',
      });
    });

    await page.route('**/api/operator/bookings', async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      bookingPayloads.push(payload);

      await route.fulfill({
        body: JSON.stringify({
          member: {
            id: 'member-4',
            name: 'Bob',
            phone: '+16155559999',
          },
          result: 'created',
          session: {
            attended: false,
            created_at: '2026-03-12T10:00:00Z',
            created_via: 'admin',
            date: today,
            end_time: '10:00:00',
            id: 'session-4',
            member_id: 'member-4',
            notes: null,
            start_time: '09:00:00',
            status: 'booked',
            workout_type: 'push',
          },
        }),
        contentType: 'application/json',
      });
    });

    await page.goto('/quick-add');
    await page.getByPlaceholder('Mike or 615-555-1212').fill('Bob');
    await page.getByLabel('First name').fill('Bob');
    await page.getByLabel('Phone').fill('(615) 555-9999');

    const pushButton = page.getByRole('button', { name: 'Push' });
    await pushButton.click();
    await expect(pushButton).toHaveAttribute('aria-pressed', 'true');
    await pushButton.click();
    await expect(pushButton).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('button', { name: 'Legs' }).click();
    await page.getByRole('button', { name: 'Save booking' }).click();

    expect(bookingPayloads[0]).toMatchObject({
      workoutType: 'legs',
    });
  });

  test('shows a conflict and allows force add anyway', async ({ page }) => {
    const bookingPayloads: Array<Record<string, unknown>> = [];

    await page.route('**/api/availability**', async (route) => {
      await route.fulfill({
        body: JSON.stringify(slotResponse),
        contentType: 'application/json',
      });
    });

    await page.route('**/api/operator/members/search**', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          members: [
            {
              id: 'member-1',
              isExactMatch: true,
              matchKind: 'name-exact',
              name: 'Mike Cerrone',
              phone: '+16155551212',
            },
          ],
        }),
        contentType: 'application/json',
      });
    });

    await page.route('**/api/operator/bookings', async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      bookingPayloads.push(payload);

      if (!payload.allowConflict) {
        await route.fulfill({
          body: JSON.stringify({
            code: 'full',
            error: 'That slot just filled up. Force add if you still want to squeeze someone in.',
          }),
          contentType: 'application/json',
          status: 409,
        });
        return;
      }

      await route.fulfill({
        body: JSON.stringify({
          member: {
            id: 'member-1',
            name: 'Mike Cerrone',
            phone: '+16155551212',
          },
          result: 'created',
          session: {
            attended: false,
            created_at: '2026-03-12T10:00:00Z',
            created_via: 'admin',
            date: today,
            end_time: '10:00:00',
            id: 'session-9',
            member_id: 'member-1',
            notes: null,
            start_time: '09:00:00',
            status: 'booked',
            workout_type: 'other',
          },
        }),
        contentType: 'application/json',
      });
    });

    await page.goto('/quick-add');
    await page.getByPlaceholder('Mike or 615-555-1212').fill('Mike');
    await page.getByRole('button', { name: /Mike Cerrone/i }).click();
    await page.getByRole('button', { name: /9:00 AM/i }).click();
    await page.getByRole('button', { name: 'Save booking' }).click();

    await expect(page.getByText(/needs a quick review/i)).toBeVisible();
    await page.getByRole('button', { name: 'Force add anyway' }).click();
    await expect(page.getByText(/Mike Cerrone is locked in/i)).toBeVisible();

    expect(bookingPayloads[0].allowConflict).toBeFalsy();
    expect(bookingPayloads[1].allowConflict).toBeTruthy();
  });
});
