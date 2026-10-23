import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReminders, reminderLine } from './reminders';

const TODAY = '2026-10-15';
const items = (...w: (string | null)[]) => w.map((d, i) => ({ id: i + 1, name: `i${i + 1}`, warrantyExpiration: d }));

test('warranty reminders: today through 30 days, nothing before or after', () => {
  const r = computeReminders(items('2026-10-14', '2026-10-15', '2026-11-14', '2026-11-15', null), [], TODAY);
  assert.deepEqual(r.map(x => [x.itemId, x.days]), [[2, 0], [3, 30]]);
});

test('loan reminders: overdue first, due within 3 days, ignore far or undated', () => {
  const loans = [
    { itemId: 1, itemName: 'A', expectedReturnDate: '2026-10-18' },
    { itemId: 2, itemName: 'B', expectedReturnDate: '2026-10-10' },
    { itemId: 3, itemName: 'C', expectedReturnDate: '2026-10-19' },
    { itemId: 4, itemName: 'D', expectedReturnDate: null },
    { itemId: 5, itemName: 'E', expectedReturnDate: '2026-10-15' },
  ];
  const r = computeReminders(items('2026-10-20'), loans, TODAY);
  assert.deepEqual(r.map(x => [x.kind, x.itemName, x.days]), [
    ['loan_overdue', 'B', -5], ['loan_due_soon', 'E', 0], ['loan_due_soon', 'A', 3], ['warranty_ending', 'i1', 5],
  ]);
});

test('lines read naturally in both languages', () => {
  const [w] = computeReminders(items('2026-10-16'), [], TODAY);
  assert.equal(reminderLine(w, 'en'), 'The warranty on “i1” ends tomorrow (2026-10-16).');
  assert.equal(reminderLine(w, 'cs'), 'Záruka na „i1“ končí zítra (2026-10-16).');
  const [o] = computeReminders([], [{ itemId: 1, itemName: 'Drill', expectedReturnDate: '2026-10-14' }], TODAY);
  assert.equal(reminderLine(o, 'en'), '“Drill” is 1 day overdue (2026-10-14).');
  assert.doesNotMatch(reminderLine(o, 'en') + reminderLine(o, 'cs'), /Petr/);
  assert.match(reminderLine(o, 'cs'), /před 1 dnem/);
});
