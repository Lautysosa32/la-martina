import { supabase } from '../lib/supabase';
import { Expense } from '../types/expense.types';

const BRANCH_ID = 'main';

// ─── FETCH ───────────────────────────────────────────────────────────────────
export const fetchExpenses = async (): Promise<Expense[]> => {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('branch_id', BRANCH_ID)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching expenses:', error);
    return [];
  }
  return (data || []) as Expense[];
};

// ─── INSERT ──────────────────────────────────────────────────────────────────
export const insertExpense = async (expense: Expense): Promise<void> => {
  const { error } = await supabase.from('expenses').insert({
    id: expense.id,
    branch_id: BRANCH_ID,
    type: expense.type,
    supplier_name: expense.supplier_name ?? null,
    amount: expense.amount,
    payment_method: expense.payment_method,
    description: expense.description ?? null,
    observations: expense.observations ?? null,
    receipt_url: expense.receipt_url ?? null,
    created_by: expense.created_by,
    status: expense.status,
    expense_date: expense.expense_date,
    payment_status: expense.payment_status,
    cancellation_date: expense.cancellation_date,
    cancellation_method: expense.cancellation_method,
    last_activity_at: expense.last_activity_at,
  });
  if (error) {
    console.error('Error inserting expense:', error);
    alert(`Error guardando egreso: ${error.message}`);
  }
};

// ─── UPDATE ──────────────────────────────────────────────────────────────────
export const updateExpenseInDb = async (id: string, updates: Partial<Expense>): Promise<void> => {
  const { error } = await supabase
    .from('expenses')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('branch_id', BRANCH_ID);
  if (error) {
    console.error('Error updating expense:', error);
    alert(`Error actualizando egreso: ${error.message}`);
  }
};

// ─── SOFT DELETE ─────────────────────────────────────────────────────────────
export const cancelExpenseInDb = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('expenses')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('branch_id', BRANCH_ID);
  if (error) {
    console.error('Error cancelling expense:', error);
    alert(`Error eliminando egreso: ${error.message}`);
  }
};
