import { ApparelSubmission } from './types';

/**
 * Creates a brand new Google Sheet in the user's Google Drive.
 */
export async function createGoogleSheet(accessToken: string, titleSuffix?: string): Promise<{ id: string; url: string }> {
  const title = `Altera Apparel Orders${titleSuffix ? ` - ${titleSuffix}` : ''}`;
  
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: title,
      },
      sheets: [
        {
          properties: {
            title: 'Orders',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to create Google Sheet');
  }

  const data = await response.json();
  const spreadsheetId = data.spreadsheetId;
  const spreadsheetUrl = data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  return { id: spreadsheetId, url: spreadsheetUrl };
}

/**
 * Syncs the given apparel submissions onto a specific Google Sheet by completely replacing range A1.
 */
export async function syncSubmissionsToSheet(
  accessToken: string,
  spreadsheetId: string,
  submissions: ApparelSubmission[]
): Promise<void> {
  const rows = [
    ['Timestamp', 'Employee Name', 'Email Address', 'Campus Location', 'Item Selected', 'Size Selected'],
    ...submissions.map((sub) => [
      new Date(sub.timestamp).toLocaleString(),
      sub.name,
      sub.email,
      sub.campus,
      sub.item === 'polo' ? 'Polo Shirt' : 'Pullover Hoodie',
      sub.size,
    ]),
  ];

  // We write to the 'Orders' tab. If 'Orders' doesn't exist, we fallback to A1 (first sheet tab default)
  const range = 'Orders!A1';

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: range,
        majorDimension: 'ROWS',
        values: rows,
      }),
    }
  );

  if (!response.ok) {
    // If Orders tab caused a 400 error (e.g. they deleted the sheet tab), let's fallback to standard 'Sheet1!A1'
    const fallbackRange = 'Sheet1!A1';
    const retryResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${fallbackRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range: fallbackRange,
          majorDimension: 'ROWS',
          values: rows,
        }),
      }
    );

    if (!retryResponse.ok) {
      const errorData = await retryResponse.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to write data to Google Sheet. Check if the spreadsheet ID is correct.');
    }
  }
}
