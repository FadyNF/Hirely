'use client';

import { useRouter } from 'next/navigation';
import { faArrowDown } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/context';
import UserRoleActionList, { type RoleUser } from './UserRoleActionList';

export default function AdminsSection({ users }: { users: RoleUser[] }) {
  const { authFetch } = useAuth();
  const router = useRouter();

  const demote = async (userId: number) => {
    const res = await authFetch(`/api/admin/approvals/${userId}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
  };

  return (
    <UserRoleActionList
      users={users}
      emptyMessage="No promoted admins yet."
      actionLabel="Demote"
      actionBusyLabel="Demoting…"
      actionIcon={faArrowDown}
      actionColor="#B45309"
      onAction={demote}
    />
  );
}
