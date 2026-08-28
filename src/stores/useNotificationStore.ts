import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface NotificationStore {
  reads: Record<string, number>;
  loading: boolean;
  fetchReads: (employeeId: string) => Promise<void>;
  markAsRead: (employeeId: string, groupKey: string, value: number) => Promise<void>;
  markAllAsRead: (employeeId: string, notifications: { groupKey: string, value: number }[]) => Promise<void>;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  reads: {},
  loading: false,

  fetchReads: async (employeeId) => {
    if (!employeeId) return;
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('admin_notification_reads')
        .select('group_key, last_read_value')
        .eq('employee_id', employeeId);

      if (error) throw error;

      const readsMap: Record<string, number> = {};
      if (data) {
        data.forEach(item => {
          readsMap[item.group_key] = item.last_read_value;
        });
      }
      set({ reads: readsMap, loading: false });
    } catch (error) {
      console.error('Error fetching notification reads:', error);
      set({ loading: false });
    }
  },

  markAsRead: async (employeeId, groupKey, value) => {
    if (!employeeId) return;
    
    // Optimistic UI update
    set((state) => ({
      reads: { ...state.reads, [groupKey]: value }
    }));

    try {
      const { error } = await supabase
        .from('admin_notification_reads')
        .upsert({
          employee_id: employeeId,
          group_key: groupKey,
          last_read_value: value,
          last_read_at: new Date().toISOString()
        }, { onConflict: 'employee_id, group_key' });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating notification read state:', error);
    }
  },

  markAllAsRead: async (employeeId, notifications) => {
    if (!employeeId || notifications.length === 0) return;

    const updates = notifications.map(n => ({
      employee_id: employeeId,
      group_key: n.groupKey,
      last_read_value: n.value,
      last_read_at: new Date().toISOString()
    }));

    // Optimistic UI update
    const newReads = { ...get().reads };
    notifications.forEach(n => {
      newReads[n.groupKey] = n.value;
    });
    set({ reads: newReads });

    try {
      const { error } = await supabase
        .from('admin_notification_reads')
        .upsert(updates, { onConflict: 'employee_id, group_key' });
        
      if (error) throw error;
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }
}));
