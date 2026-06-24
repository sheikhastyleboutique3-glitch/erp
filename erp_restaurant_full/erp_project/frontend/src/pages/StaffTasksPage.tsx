import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';

interface ChecklistItem { label: string; done?: boolean }
interface StaffTask {
  id: number;
  branchId: number;
  title: string;
  description?: string | null;
  category: string;
  status: string;
  priority: string;
  assignedToId?: number | null;
  dueAt?: string | null;
  checklist?: ChecklistItem[] | null;
}

const CATEGORIES = ['CLEANING', 'MAINTENANCE', 'OPENING', 'CLOSING', 'OTHER'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

const priorityTone: Record<string, string> = {
  LOW: 'text-gray-500',
  NORMAL: 'text-sky-600',
  HIGH: 'text-amber-600',
  URGENT: 'text-red-600 font-semibold',
};

export default function StaffTasksPage() {
  const { t } = useTranslation();
  const { activeBranch, user } = useAuth();
  const qc = useQueryClient();
  const branchId = activeBranch?.id;
  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'BRANCH_MANAGER';

  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // New-task form state.
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('CLEANING');
  const [priority, setPriority] = useState('NORMAL');
  const [dueAt, setDueAt] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [checklistText, setChecklistText] = useState('');

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['staff-tasks', branchId ?? 'all', statusFilter, categoryFilter],
    queryFn: () =>
      api
        .get('/staff-tasks', {
          params: {
            ...(branchId ? { branchId } : {}),
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(categoryFilter ? { category: categoryFilter } : {}),
          },
        })
        .then((r) => r.data.data),
  });

  // Users for the assignee dropdown (managers only; ignore failures silently).
  const { data: users } = useQuery({
    queryKey: ['users-for-tasks'],
    queryFn: () => api.get('/users').then((r) => r.data.data),
    enabled: canManage,
    staleTime: 60_000,
    retry: false,
  });

  const resetForm = () => {
    setTitle(''); setDueAt(''); setAssignedToId(''); setChecklistText(''); setPriority('NORMAL'); setCategory('CLEANING');
  };

  const createTask = useMutation({
    mutationFn: () =>
      api.post('/staff-tasks', {
        branchId,
        title,
        category,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        assignedToId: assignedToId ? parseInt(assignedToId, 10) : undefined,
        checklist: checklistText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((label) => ({ label, done: false })),
      }),
    onSuccess: () => { toast.success(t('staffTasks.created')); resetForm(); qc.invalidateQueries({ queryKey: ['staff-tasks'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.patch(`/staff-tasks/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-tasks'] }),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const toggleItem = useMutation({
    mutationFn: ({ id, index, done }: { id: number; index: number; done: boolean }) =>
      api.patch(`/staff-tasks/${id}/checklist`, { index, done }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-tasks'] }),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const removeTask = useMutation({
    mutationFn: (id: number) => api.delete(`/staff-tasks/${id}`),
    onSuccess: () => { toast.success(t('common.deleted')); qc.invalidateQueries({ queryKey: ['staff-tasks'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const userName = (id?: number | null) => {
    if (!id) return null;
    const u = (users || []).find((x: any) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}` : `#${id}`;
  };

  return (
    <div>
      <PageHeader title={t('nav.staffTasks')} subtitle={activeBranch?.name} />
      {!branchId && <p className="text-xs text-amber-600 mb-3">{t('staffTasks.selectBranch')}</p>}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
          <option value="">{t('staffTasks.allStatuses')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
          <option value="">{t('staffTasks.allCategories')}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Create form (managers only) */}
      {canManage && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 mb-5">
          <h3 className="text-sm font-semibold mb-3">{t('staffTasks.newTask')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('staffTasks.titlePlaceholder')}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
              <option value="">{t('staffTasks.unassigned')}</option>
              {(users || []).map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.role})</option>)}
            </select>
          </div>
          <textarea value={checklistText} onChange={(e) => setChecklistText(e.target.value)}
            placeholder={t('staffTasks.checklistPlaceholder')} rows={3}
            className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
          <button disabled={!branchId || !title || createTask.isPending} onClick={() => createTask.mutate()}
            className="mt-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">
            {t('staffTasks.addTask')}
          </button>
        </div>
      )}

      {/* Task list */}
      {isLoading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(tasks || []).map((task: StaffTask) => {
            const items = Array.isArray(task.checklist) ? task.checklist : [];
            const doneCount = items.filter((i) => i.done).length;
            return (
              <div key={task.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{task.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {task.category} · <span className={priorityTone[task.priority] || ''}>{task.priority}</span>
                    </div>
                  </div>
                  <StatusBadge status={task.status} size="sm" />
                </div>

                {task.assignedToId && (
                  <div className="text-xs text-gray-500 mt-2">{t('staffTasks.assignedTo')}: {userName(task.assignedToId)}</div>
                )}
                {task.dueAt && (
                  <div className="text-xs text-gray-500 mt-0.5">{t('staffTasks.due')}: {new Date(task.dueAt).toLocaleString()}</div>
                )}

                {items.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-xs text-gray-400">{doneCount}/{items.length}</div>
                    {items.map((it, idx) => (
                      <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={!!it.done}
                          onChange={(e) => toggleItem.mutate({ id: task.id, index: idx, done: e.target.checked })}
                          className="rounded border-gray-300" />
                        <span className={it.done ? 'line-through text-gray-400' : ''}>{it.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <select value={task.status} onChange={(e) => setStatus.mutate({ id: task.id, status: e.target.value })}
                    className="flex-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs">
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                  {canManage && (
                    <button onClick={() => removeTask.mutate(task.id)}
                      className="text-xs text-red-600 hover:underline">{t('common.delete')}</button>
                  )}
                </div>
              </div>
            );
          })}
          {!tasks?.length && <p className="text-sm text-gray-400 col-span-full">{t('staffTasks.empty')}</p>}
        </div>
      )}
    </div>
  );
}
