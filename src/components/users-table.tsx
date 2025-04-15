'use client';

import * as React from 'react';
import { useState, useTransition } from 'react';
import { format } from 'date-fns';
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  MoreHorizontal,
  Trash2,
  PlusCircle,
  Loader2,
  KeyRound // Icon for password reset
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Type for user data received by the component (password excluded)
export type UserData = {
  id: number;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

// --- API Call Helpers --- 
async function deleteUser(userId: number) {
  const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete user' }));
    throw new Error(error.message || 'Delete failed');
  }
  return response.json();
}

async function addUser(email: string, password: string): Promise<UserData> {
  const response = await fetch(`/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to add user' }));
    throw new Error(error.message || 'Add failed');
  }
  return response.json();
}

async function updateUserPassword(userId: number, password: string): Promise<UserData> {
    const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH', // Or PUT, depending on API design
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to update password' }));
        throw new Error(error.message || 'Password update failed');
    }
    return response.json();
}

// --- Column Definitions --- 
export const columns: ColumnDef<UserData>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Email
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
   {
    accessorKey: 'createdAt',
    header: 'Created At',
    cell: ({ row }) => format(new Date(row.getValue('createdAt')), 'PPPpp'),
  },
  {
    accessorKey: 'updatedAt',
    header: 'Updated At',
    cell: ({ row }) => format(new Date(row.getValue('updatedAt')), 'PPPpp'),
  },
  {
    id: 'actions',
    cell: function ActionCell({ row }) {
      const user = row.original;
      const router = useRouter();
      const [isDeletePending, startDeleteTransition] = useTransition();
      const [isEditPending, startEditTransition] = useTransition();
      const [showDeleteDialog, setShowDeleteDialog] = useState(false);
      const [showEditDialog, setShowEditDialog] = useState(false);
      const [newPassword, setNewPassword] = useState('');
      const [confirmPassword, setConfirmPassword] = useState('');
      const [passwordError, setPasswordError] = useState<string | null>(null);

      const handleDelete = () => {
        if (user.id === 1) {
          toast.error("Cannot delete the primary admin user (ID 1).");
          return;
        }
        startDeleteTransition(async () => {
          try {
            await deleteUser(user.id);
            toast.success(`User ${user.email} deleted successfully.`);
            router.refresh(); // Refresh data
          } catch (error) {
            toast.error(`Failed to delete user: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
          setShowDeleteDialog(false);
        });
      };

      const handleEditPassword = () => {
          if (newPassword !== confirmPassword) {
              setPasswordError("Passwords do not match.");
              return;
          }
          if (newPassword.length < 8) { // Basic length check
                setPasswordError("Password must be at least 8 characters long.");
                return;
          }
          setPasswordError(null);

          startEditTransition(async () => {
              try {
                  await updateUserPassword(user.id, newPassword);
                  toast.success(`Password updated for ${user.email}.`);
                  router.refresh(); // Refresh data
                  setShowEditDialog(false);
                  setNewPassword('');
                  setConfirmPassword('');
              } catch (error) {
                  toast.error(`Failed to update password: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
          });
      };

      return (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                <KeyRound className="mr-2 h-4 w-4" /> Change Password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setShowDeleteDialog(true)} 
                disabled={user.id === 1} // Disable delete for admin user ID 1
                className="text-red-600 focus:text-red-600 focus:bg-red-100"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete User
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Edit Password Dialog */}
           <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
              <DialogContent>
                  <DialogHeader>
                      <DialogTitle>Change Password for {user.email}</DialogTitle>
                      <DialogDescription>
                          Enter and confirm the new password. Minimum 8 characters.
                      </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="new-password" className="text-right col-span-1">
                              New Password
                          </Label>
                          <Input
                              id="new-password"
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="col-span-3"
                              disabled={isEditPending}
                          />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="confirm-password" className="text-right col-span-1">
                              Confirm Password
                          </Label>
                          <Input
                              id="confirm-password"
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="col-span-3"
                              disabled={isEditPending}
                          />
                      </div>
                      {passwordError && <p className="text-red-500 text-sm col-span-4 text-center">{passwordError}</p>}
                  </div>
                  <DialogFooter>
                      <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={isEditPending}>
                          Cancel
                      </Button>
                      <Button onClick={handleEditPassword} disabled={isEditPending || !newPassword || !confirmPassword}>
                          {isEditPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Update Password
                      </Button>
                  </DialogFooter>
              </DialogContent>
          </Dialog>

          {/* Delete Confirmation Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the user 
                  <span className="font-medium"> {user.email}</span>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletePending}>Cancel</AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isDeletePending}
                >
                  {isDeletePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete User
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      );
    },
  },
];

interface UsersTableProps {
  users: UserData[];
}

// --- Add User Dialog --- 
function AddUserDialog({ onUserAdded }: { onUserAdded: () => void }) {
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleAddUser = () => {
         if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters long.");
            return;
        }
        if (!email) {
            setError("Email is required.");
            return;
        }
        setError(null);

        startTransition(async () => {
            try {
                await addUser(email, password);
                toast.success(`User ${email} added successfully.`);
                setEmail('');
                setPassword('');
                setConfirmPassword('');
                setOpen(false);
                onUserAdded(); // Trigger data refresh in parent
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to add user');
                toast.error(`Failed to add user: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add User
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add New User</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="new-email" className="text-right col-span-1">Email</Label>
                        <Input
                            id="new-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="col-span-3"
                            disabled={isPending}
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="new-password" className="text-right col-span-1">Password</Label>
                        <Input
                            id="new-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="col-span-3"
                            disabled={isPending}
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="confirm-new-password" className="text-right col-span-1">Confirm</Label>
                        <Input
                            id="confirm-new-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="col-span-3"
                            disabled={isPending}
                        />
                    </div>
                    {error && <p className="text-red-500 text-sm col-span-4 text-center">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
                    <Button onClick={handleAddUser} disabled={isPending || !email || !password || !confirmPassword}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Add User
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// --- Main Table Component --- 
export function UsersTable({ users }: UsersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const router = useRouter();

  const table = useReactTable<UserData>({
    data: users,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  // Callback for AddUserDialog to trigger refresh
  const handleUserAdded = () => {
      router.refresh();
  };

  return (
    <div className="w-full space-y-4">
        <div className="flex justify-end">
            <AddUserDialog onUserAdded={handleUserAdded} />
        </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'} // Example selection state
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
} 
