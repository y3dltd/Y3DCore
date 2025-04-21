'use client';

import { PrintTaskStatus } from '@prisma/client';
import { format } from 'date-fns';
import { Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { usePrintQueueModal } from '@/contexts/PrintQueueModalContext';

interface EditableTaskData {
  product_name: string;
  sku: string;
  quantity: number;
  color_1: string;
  color_2: string;
  custom_text: string;
  status: PrintTaskStatus;
  needs_review: boolean;
  review_reason: string;
}

export function PrintTaskDetailModal() {
  const { selectedTask: task, isModalOpen: isOpen, setIsModalOpen } = usePrintQueueModal();

  const [formData, setFormData] = useState<EditableTaskData | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [isBulkNameUpdating, startBulkNameUpdateTransition] = useTransition();
  const router = useRouter();

  // Set form data when task changes
  useEffect(() => {
    if (task && isOpen) {
      setFormData({
        product_name: task.product?.name || '',
        sku: task.product?.sku || '',
        quantity: task.quantity || 1,
        color_1: task.color_1 || '',
        color_2: task.color_2 || '',
        custom_text: task.custom_text || '',
        status: task.status,
        needs_review: task.needs_review || false,
        review_reason: task.review_reason || '',
      });
    } else {
      setFormData(null);
    }
  }, [task, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const inputValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev =>
      prev ? { ...prev, [name]: type === 'number' ? parseInt(value, 10) || 0 : inputValue } : null
    );
  };

  const handleStatusChange = (value: string) => {
    if (Object.values(PrintTaskStatus).includes(value as PrintTaskStatus)) {
      setFormData(prev => (prev ? { ...prev, status: value as PrintTaskStatus } : null));
    }
  };

  const handleNeedsReviewChange = (checked: boolean | 'indeterminate') => {
    if (typeof checked === 'boolean') {
      setFormData(prev => (prev ? { ...prev, needs_review: checked } : null));
    }
  };

  const handleSave = () => {
    if (!formData || !task) return;

    startSaveTransition(async () => {
      try {
        const response = await fetch(`/api/print-tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to parse error' }));
          throw new Error(errorData.error || `Failed to save task ${task.id}`);
        }

        toast.success(`Task ${task.id} updated successfully.`);
        setIsModalOpen(false);
        router.refresh();
      } catch (error: unknown) {
        console.error('Save failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Failed to save: ${errorMessage}`);
      }
    });
  };

  const handleBulkNameUpdate = () => {
    if (!formData || !task) return;

    const identifier = task.product?.sku ? { sku: task.product.sku } : { name: task.product?.name };
    const newName = formData.product_name;

    if (!newName || newName === task.product?.name) {
      toast.info("Product name hasn't changed or is empty.");
      return;
    }

    startBulkNameUpdateTransition(async () => {
      try {
        const response = await fetch(`/api/tasks/bulk-update-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier,
            newName,
          }),
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to parse error' }));
          throw new Error(errorData.error || `Failed bulk name update`);
        }
        const result = await response.json();
        toast.success(`Updated ${result.count} tasks to name "${newName}".`);
        router.refresh();
      } catch (error: unknown) {
        console.error('Bulk name update failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Bulk name update failed: ${errorMessage}`);
      }
    });
  };

  if (!isOpen || !task || !formData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsModalOpen}>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader className="border-b pb-3 mb-4">
          <DialogTitle className="text-xl font-semibold">
            Edit Task Details (ID: {task.id})
          </DialogTitle>
          <DialogDescription>
            Order #{task.marketplace_order_number}
            {task.ship_by_date &&
              ` - Ship By: ${format(new Date(task.ship_by_date), 'dd/MM/yyyy')}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <div className="space-y-4">
            <div>
              <Label htmlFor="product_name">Product Name</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="product_name"
                  name="product_name"
                  value={formData.product_name}
                  onChange={handleChange}
                  className="flex-grow"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkNameUpdate}
                  disabled={
                    isBulkNameUpdating ||
                    !formData.product_name ||
                    formData.product_name === task.product?.name
                  }
                  title="Update name for all tasks with same original SKU or Name"
                >
                  {isBulkNameUpdating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span className="ml-2">Update All</span>
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" name="sku" value={formData.sku} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                value={formData.quantity}
                onChange={handleChange}
                min="0"
              />
            </div>
            <div>
              <Label htmlFor="color_1">Color 1</Label>
              <Input id="color_1" name="color_1" value={formData.color_1} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="color_2">Color 2</Label>
              <Input id="color_2" name="color_2" value={formData.color_2} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select name="status" value={formData.status} onValueChange={handleStatusChange}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(PrintTaskStatus).map(s => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="custom_text">Custom Text</Label>
              <Textarea
                id="custom_text"
                name="custom_text"
                value={formData.custom_text}
                onChange={handleChange}
                rows={5}
              />
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="needs_review"
                name="needs_review"
                checked={formData.needs_review}
                onCheckedChange={handleNeedsReviewChange}
              />
              <Label
                htmlFor="needs_review"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Needs Review?
              </Label>
            </div>
            <div>
              <Label htmlFor="review_reason">Review Reason</Label>
              <Textarea
                id="review_reason"
                name="review_reason"
                value={formData.review_reason}
                onChange={handleChange}
                rows={3}
                disabled={!formData.needs_review}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4 border-t mt-4">
          <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
