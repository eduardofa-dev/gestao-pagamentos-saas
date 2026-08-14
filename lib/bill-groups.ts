import type { Bill } from "./finance-data.ts";

export type BillDateGroup = {
  date: string;
  bills: Bill[];
};

export function groupBillsByDueDate(bills: Bill[]): BillDateGroup[] {
  return [...bills]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .reduce<BillDateGroup[]>((result, bill) => {
      const current = result.at(-1);
      if (current?.date === bill.dueDate) current.bills.push(bill);
      else result.push({ date: bill.dueDate, bills: [bill] });
      return result;
    }, []);
}
